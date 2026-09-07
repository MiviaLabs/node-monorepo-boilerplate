import { randomUUID } from 'node:crypto';

import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Errors } from '@package/errors';
import { OutboxRepository } from '@package/events';

import { MAIN_DB } from '../../../../common/database/database.constants';
import { TransferOwnershipCommand } from '../../commands/transfer-ownership.command';
import { buildAuthAuditEvent } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { OrganizationRepository } from '../../repositories/organization.repository';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

// Auth event schema version constant
const AUTH_EVENT_SCHEMA_VERSION = '1.0' as const;

/**
 * Transfer Ownership Handler
 *
 * Handles organization ownership transfer with validation:
 *
 * **Business Rules:**
 * 1. Only current owner can initiate transfer
 * 2. New owner must be an existing member of the organization
 * 3. New owner must be active (not soft-deleted)
 * 4. Transfer is atomic (uses transaction)
 *
 * **Validation:**
 * - Actor must be current owner
 * - New owner must exist and belong to same organization
 * - New owner must be active
 * - New owner cannot be same as current owner
 *
 * **Events Published:**
 * - `organization.ownership.transferred` - Domain event
 * - `organization.ownership.transferred.audit` - Audit log
 *
 * @example
 * ```typescript
 * const command = new TransferOwnershipCommand({
 *   tenantId: 'org-123',
 *   actorId: 'owner-user-id',
 *   newOwnerId: 'new-owner-user-id',
 *   reason: 'Organizational restructuring'
 * });
 * await commandBus.execute(command);
 * ```
 */
@CommandHandler(TransferOwnershipCommand)
export class TransferOwnershipHandler implements ICommandHandler<TransferOwnershipCommand> {
  private readonly logger = new Logger(TransferOwnershipHandler.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly orgRepository: OrganizationRepository,
    private readonly outboxRepo: OutboxRepository,
    @Inject(MAIN_DB) private readonly db: NodePgDatabase
  ) {}

  async execute(command: TransferOwnershipCommand): Promise<void> {
    this.logger.log(
      `[TransferOwnershipHandler] Starting ownership transfer: actor=${command.actorId}, newOwner=${command.newOwnerId}, tenant=${command.tenantId}`
    );

    return this.db.transaction(async (tx) => {
      // Fetch organization
      const org = await this.orgRepository.findByIdWithTransaction(command.tenantId, tx);

      if (!org) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'Organization not found'
        });
      }

      // Validate: Actor must be current owner
      if (org.ownerId?.toString() !== command.actorId) {
        this.logger.warn(
          `[TransferOwnershipHandler] REJECTED: User ${command.actorId} is not the current owner (owner: ${org.ownerId})`
        );
        throw Errors.authinsufficientPermissionsRequiredpermission004({
          requiredPermission: 'organization:transfer-ownership'
        });
      }

      // Validate: New owner cannot be same as current owner
      if (command.newOwnerId === command.actorId) {
        throw Errors.businessoperationNotAllowed001({
          reason: 'New owner cannot be the same as current owner'
        });
      }

      // Fetch new owner user globally (across all organizations, including soft-deleted)
      const newOwner = await this.authRepository.findByIdGlobalWithTransaction(
        tx,
        Number(command.newOwnerId)
      );

      if (!newOwner) {
        throw Errors.useruserWithId001({ userId: command.newOwnerId });
      }

      // Validate: New owner must belong to same organization
      if (newOwner.organizationId?.toString() !== command.tenantId) {
        this.logger.warn(
          `[TransferOwnershipHandler] REJECTED: New owner ${command.newOwnerId} does not belong to organization ${command.tenantId}`
        );
        throw Errors.businessoperationNotAllowed001({
          reason: 'New owner must be a member of the organization'
        });
      }

      // Validate: New owner must be active (not soft-deleted)
      if (!newOwner.isActive || newOwner.deletedAt) {
        this.logger.warn(
          `[TransferOwnershipHandler] REJECTED: New owner ${command.newOwnerId} is inactive or deleted`
        );
        throw Errors.businessoperationNotAllowed001({
          reason: 'New owner account is inactive or deleted'
        });
      }

      // Transfer ownership
      const updatedOrg = await this.orgRepository.transferOwnership(
        command.tenantId,
        newOwner.id,
        tx
      );

      this.logger.log(
        `[TransferOwnershipHandler] Successfully transferred ownership from ${command.actorId} to ${command.newOwnerId}`
      );

      // Publish domain event
      await this.outboxRepo.insert(tx, {
        eventId: randomUUID(),
        eventType: 'organization.ownership.transferred',
        aggregateId: updatedOrg.id.toString(),
        aggregateVersion: '1',
        payload: {
          tenantId: command.tenantId,
          organizationId: updatedOrg.id.toString(),
          previousOwnerId: command.actorId,
          newOwnerId: command.newOwnerId,
          reason: command.reason,
          timestamp: new Date().toISOString()
        },
        correlationId: command.correlationId,
        causationId: command.causationId,
        tenantId: command.tenantId,
        schemaVersion: AUTH_EVENT_SCHEMA_VERSION
      });

      // Publish audit log event
      await this.outboxRepo.insert(
        tx,
        buildAuthAuditEvent({
          eventType: 'organization.ownership.transferred.audit',
          tenantId: command.tenantId,
          actorId: command.actorId,
          requestId: command.requestId,
          aggregateId: updatedOrg.id.toString(),
          action: 'TRANSFER_OWNERSHIP',
          target: {
            entityType: 'organization',
            entityId: updatedOrg.id.toString()
          },
          details: {
            newOwnerId: command.newOwnerId,
            reasonProvided: Boolean(command.reason?.trim())
          },
          correlationId: command.correlationId,
          causationId: command.causationId
        })
      );
    });
  }
}
