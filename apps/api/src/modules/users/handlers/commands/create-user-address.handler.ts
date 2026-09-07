import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AddressType } from '@package/constants';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { CreateUserAddressCommand } from '../../commands/create-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { UserAddressCreatedData } from '../../events';
import type { UserAddress } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * CreateUserAddressHandler
 *
 * Command handler for creating user addresses with encrypted-store-backed PII storage.
 *
 * Process:
 * 1. Validate input (at least one address component required)
 * 2. Begin database transaction
 * 3. Store PII components in encrypted-store (within transaction)
 * 4. Create address record with encrypted-store references
 * 5. Insert outbox event for audit trail
 * 6. Commit transaction (all or nothing)
 * 7. Return address metadata (without PII)
 *
 * Transaction Safety:
 * - encrypted-store storage and address creation happen in same transaction
 * - Outbox event inserted in same transaction
 * - If any step fails, entire operation rolls back
 *
 * P0 Compliance:
 * - No PII in logs or error messages
 * - Tenant-scoped queries (organizationId)
 * - Outbox events contain no PII (only field names)
 */
@Injectable()
@CommandHandler(CreateUserAddressCommand)
export class CreateUserAddressHandler implements ICommandHandler<
  CreateUserAddressCommand,
  UserAddress
> {
  private readonly logger = new Logger(CreateUserAddressHandler.name);

  constructor(
    private readonly repository: UserAddressRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: CreateUserAddressCommand): Promise<UserAddress> {
    this.logger.debug(`Creating address for user ${command.userId} in tenant ${command.tenantId}`);

    // P0: Verify actor owns the target user account
    if (command.actorId !== command.userId) {
      this.logger.warn(
        `User ${command.actorId} attempted to create address for user ${command.userId}`
      );
      throw new ForbiddenException('You can only create addresses for your own account');
    }

    // Validate: at least one component must be provided
    const hasComponents = Object.values(command.components).some(
      (value) => typeof value === 'string' && value.trim().length > 0
    );

    if (!hasComponents) {
      this.logger.warn(`Create address failed for user ${command.userId}: no components provided`);
      throw Errors.validationvalidationFailedField001({
        field: 'components'
      });
    }

    return this.db.transaction(async (tx) => {
      // Step 1: Create address with encrypted-store storage
      const address = await this.repository.createWithVault(
        command.tenantId,
        command.userId,
        command.components,
        command.actorId,
        tx,
        {
          addressType: command.addressType,
          label: command.label ?? null,
          countryCode: command.countryCode ?? null
        }
      );

      // Step 2: Handle default address flag
      let finalAddress = address;
      if (command.isDefault) {
        finalAddress = await this.repository.setDefault(
          command.tenantId,
          command.userId,
          address.id,
          tx
        );
      }

      // Step 3: Collect encrypted-store field names (no PII values)
      const encryptedStoreFields = Object.keys(command.components).filter((key) => {
        const value = command.components[key as keyof typeof command.components];
        return value !== undefined && value.trim().length > 0;
      });

      // Step 4: Create event payload (no PII)
      // Convert command AddressType to events AddressType (same values, different types)
      const eventAddressType = command.addressType as unknown as AddressType;
      const createdAt =
        finalAddress.createdAt instanceof Date
          ? finalAddress.createdAt
          : new Date(finalAddress.createdAt);
      const eventData: UserAddressCreatedData = {
        tenantId: String(command.tenantId),
        userId: String(command.userId),
        addressId: String(finalAddress.id),
        addressType: eventAddressType,
        isDefault: command.isDefault ?? false,
        encryptedStoreFields, // Only field names, not values
        createdAt: createdAt.toISOString(),
        timestamp: new Date().toISOString()
      };

      // Step 5: Insert outbox event
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserAddressEventType.USER_ADDRESS_CREATED,
        aggregateId: String(finalAddress.id),
        aggregateVersion: '1',
        payload: eventData, // No PII in payload
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: String(command.tenantId),
        schemaVersion: UserAddressEventSchemaVersion.V1_0
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

      await this.auditOutbox.insert(
        tx,
        buildUserAuditEvent({
          eventType: 'user.address.created.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: finalAddress.id,
          action: 'CREATE_USER_ADDRESS',
          target: {
            entityType: 'user_address',
            entityId: String(finalAddress.id)
          },
          details: {
            ownerUserId: String(command.userId),
            addressType: String(command.addressType),
            isDefault: Boolean(command.isDefault),
            encryptedStoreFieldNames: encryptedStoreFields
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      this.logger.log(
        `Address ${finalAddress.id} created for user ${command.userId} in tenant ${command.tenantId}`
      );

      // Step 6: Return address metadata (no PII)
      return finalAddress;
    });
  }
}
