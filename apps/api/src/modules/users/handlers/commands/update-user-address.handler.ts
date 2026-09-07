import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { AddressType } from '@package/constants';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { UpdateUserAddressCommand } from '../../commands/update-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { UserAddressUpdatedData } from '../../events';
import type { UserAddress } from '@package/db-core';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * UpdateUserAddressHandler
 *
 * Command handler for updating user addresses with encrypted-store-backed PII storage.
 *
 * Process:
 * 1. Validate input
 * 2. Begin database transaction
 * 3. Update PII components in encrypted-store (rotation for each field)
 * 4. Update non-PII fields (type, default, verified)
 * 5. Handle default address flag change
 * 6. Insert outbox event for audit trail
 * 7. Commit transaction (all or nothing)
 * 8. Return address metadata (without PII)
 *
 * Transaction Safety:
 * - encrypted-store updates and address changes happen in same transaction
 * - Outbox event inserted in same transaction
 * - If any step fails, entire operation rolls back
 *
 * P0 Compliance:
 * - No PII in logs or error messages
 * - Tenant-scoped queries (organizationId)
 * - Outbox events contain no PII (only field names)
 */
@Injectable()
@CommandHandler(UpdateUserAddressCommand)
export class UpdateUserAddressHandler implements ICommandHandler<
  UpdateUserAddressCommand,
  UserAddress
> {
  private readonly logger = new Logger(UpdateUserAddressHandler.name);

  constructor(
    private readonly repository: UserAddressRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: UpdateUserAddressCommand): Promise<UserAddress> {
    this.logger.debug(`Updating address ${command.addressId} in tenant ${command.tenantId}`);

    // P0: Verify address exists and belongs to tenant
    const existingAddress = await this.repository.findByIdOrThrow(
      command.tenantId,
      command.addressId
    );

    // P0: Verify actor owns the target user account
    if (command.actorId !== existingAddress.userId) {
      this.logger.warn(
        `User ${command.actorId} attempted to update address ${command.addressId} belonging to user ${existingAddress.userId}`
      );
      throw new ForbiddenException('You can only modify addresses for your own account');
    }

    return this.db.transaction(async (tx) => {
      // Step 2: Update PII components in encrypted-store (rotation)
      const componentFields = this.getChangedComponentFields(command);

      for (const field of componentFields) {
        const value = command.components[field];
        if (value !== undefined && value !== null) {
          await this.repository.updateVaultField(
            command.tenantId,
            command.addressId,
            field,
            value,
            command.actorId,
            tx
          );
        }
      }

      // Step 3: Collect non-PII updates (for event payload - use events AddressType)
      const eventNonPiiUpdates = this.buildEventNonPiiUpdates(command);

      // Step 4: Apply non-PII updates if any
      let updatedAddress = existingAddress;
      const updateData = this.buildNonPiiUpdateData(command);

      if (updateData) {
        updatedAddress = await this.repository.updateWithTransaction(
          command.tenantId,
          tx,
          command.addressId,
          updateData
        );
      }

      // Step 5: Handle default address flag change
      if (command.isDefault === true) {
        updatedAddress = await this.repository.setDefault(
          command.tenantId,
          updatedAddress.userId,
          updatedAddress.id,
          tx
        );
      }

      // Step 6: Create event payload (no PII)
      const eventData: UserAddressUpdatedData = {
        tenantId: String(command.tenantId),
        userId: String(updatedAddress.userId),
        addressId: String(updatedAddress.id),
        changedFields: componentFields, // Only field names, not values
        changedNonPiiFields: eventNonPiiUpdates,
        updatedBy: String(command.actorId),
        timestamp: new Date().toISOString()
      };

      // Step 7: Insert outbox event
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserAddressEventType.USER_ADDRESS_UPDATED,
        aggregateId: String(updatedAddress.id),
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
          eventType: 'user.address.updated.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: updatedAddress.id,
          action: 'UPDATE_USER_ADDRESS',
          target: {
            entityType: 'user_address',
            entityId: String(updatedAddress.id)
          },
          details: {
            ownerUserId: String(updatedAddress.userId),
            piiFieldNames: componentFields,
            changedMetadataFields: Object.keys(eventNonPiiUpdates).sort()
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      this.logger.log(`Address ${updatedAddress.id} updated in tenant ${command.tenantId}`);

      // Step 8: Return address metadata (no PII)
      return updatedAddress;
    });
  }

  private getChangedComponentFields(
    command: UpdateUserAddressCommand
  ): Array<keyof typeof command.components> {
    return Object.keys(command.components) as Array<keyof typeof command.components>;
  }

  private buildEventNonPiiUpdates(command: UpdateUserAddressCommand): Partial<{
    addressType: AddressType;
    isDefault: boolean;
    isVerified: boolean;
    label: string | null;
    countryCode: string | null;
  }> {
    return {
      ...(command.addressType !== undefined
        ? { addressType: command.addressType as unknown as AddressType }
        : {}),
      ...(command.isDefault !== undefined ? { isDefault: command.isDefault } : {}),
      ...(command.isVerified !== undefined ? { isVerified: command.isVerified } : {}),
      ...(command.label !== undefined ? { label: command.label } : {}),
      ...(command.countryCode !== undefined ? { countryCode: command.countryCode } : {})
    };
  }

  private buildNonPiiUpdateData(
    command: UpdateUserAddressCommand
  ): Parameters<typeof this.repository.updateWithTransaction>[3] | null {
    const hasNonPiiUpdates =
      command.addressType !== undefined ||
      command.isDefault !== undefined ||
      command.isVerified !== undefined ||
      command.label !== undefined ||
      command.countryCode !== undefined;

    if (!hasNonPiiUpdates) {
      return null;
    }

    return {
      updatedAt: new Date(),
      ...(command.addressType !== undefined ? { addressType: command.addressType } : {}),
      ...(command.isDefault !== undefined ? { isDefault: command.isDefault } : {}),
      ...(command.isVerified !== undefined ? { isVerified: command.isVerified } : {}),
      ...(command.label !== undefined ? { label: command.label } : {}),
      ...(command.countryCode !== undefined ? { countryCode: command.countryCode } : {})
    };
  }
}
