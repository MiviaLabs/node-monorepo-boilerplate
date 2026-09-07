import { randomUUID } from 'node:crypto';

import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { DeleteUserAddressCommand } from '../../commands/delete-user-address.command';
import { UserAddressEventSchemaVersion, UserAddressEventType } from '../../events';
import { buildUserAuditEvent } from '../../events/user-audit-event';
import { UserAddressRepository } from '../../repositories/user-address.repository';

import type { UserAddressDeletedData } from '../../events';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';

/**
 * Response DTO for delete address command
 */
interface DeleteAddressResponse {
  success: true;
  addressId: number;
  userId: number;
}

/**
 * DeleteUserAddressHandler
 *
 * Command handler for deleting user addresses (soft delete).
 *
 * Process:
 * 1. Validate address exists and belongs to tenant
 * 2. Begin database transaction
 * 3. Perform soft delete (set deletedAt, clear isDefault)
 * 4. Insert outbox event for audit trail
 * 5. Commit transaction
 * 6. Return success confirmation
 *
 * Transaction Safety:
 * - Soft delete and outbox event happen in same transaction
 * - If any step fails, entire operation rolls back
 *
 * P0 Compliance:
 * - No PII in logs or error messages
 * - Tenant-scoped queries (organizationId)
 * - Outbox events contain no PII
 * - Soft delete preserves encrypted-store entries for audit
 *
 * Note: This is a soft delete. encrypted-store entries are retained for audit trail.
 * Hard deletion of encrypted-store entries is a separate administrative operation.
 */
@Injectable()
@CommandHandler(DeleteUserAddressCommand)
export class DeleteUserAddressHandler implements ICommandHandler<
  DeleteUserAddressCommand,
  DeleteAddressResponse
> {
  private readonly logger = new Logger(DeleteUserAddressHandler.name);

  constructor(
    private readonly repository: UserAddressRepository,
    private readonly outboxRepo: OutboxRepository,
    private readonly auditOutbox: AuditOutboxPublisher,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: DeleteUserAddressCommand): Promise<DeleteAddressResponse> {
    this.logger.debug(`Deleting address ${command.addressId} in tenant ${command.tenantId}`);

    return this.db.transaction(async (tx) => {
      // Step 1: Verify address exists and belongs to tenant
      const address = await this.repository.findByIdOrThrow(command.tenantId, command.addressId);

      // P0: Verify actor owns the target user account
      if (command.actorId !== address.userId) {
        this.logger.warn(
          `User ${command.actorId} attempted to delete address ${command.addressId} belonging to user ${address.userId}`
        );
        throw new ForbiddenException('You can only delete addresses for your own account');
      }

      // Step 2: Perform soft delete
      await this.repository.softDelete(command.tenantId, command.addressId, tx);

      // Step 3: Create event payload (no PII)
      const eventData: UserAddressDeletedData = {
        tenantId: String(command.tenantId),
        userId: String(address.userId),
        addressId: String(command.addressId),
        deletedBy: String(command.actorId),
        reason: 'User requested deletion',
        timestamp: new Date().toISOString()
      };

      // Step 4: Insert outbox event
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: UserAddressEventType.USER_ADDRESS_DELETED,
        aggregateId: String(command.addressId),
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
          eventType: 'user.address.deleted.audit',
          tenantId: command.tenantId,
          actorId: String(command.actorId),
          requestId: command.requestId,
          aggregateId: command.addressId,
          action: 'DELETE_USER_ADDRESS',
          target: {
            entityType: 'user_address',
            entityId: String(command.addressId)
          },
          details: {
            ownerUserId: String(address.userId),
            deletionMode: 'soft'
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );

      this.logger.log(
        `Address ${command.addressId} deleted for user ${address.userId} in tenant ${command.tenantId}`
      );

      // Step 5: Return success confirmation
      return {
        success: true,
        addressId: command.addressId,
        userId: address.userId
      };
    });
  }
}
