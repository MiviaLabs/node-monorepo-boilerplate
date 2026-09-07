import type { ICommand } from '@package/types';

/**
 * Export User Data Command Props
 *
 * Properties for the export user data command (GDPR compliance)
 */
export interface ExportUserDataCommandProps {
  /**
   * Tenant ID (organization ID as string)
   */
  tenantId: string;

  /**
   * User ID to export data for
   */
  userId: string;

  /**
   * ID of user requesting the export
   */
  actorId: string;
  requestId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Export User Data Command
 *
 * Exports all user data in JSON format for GDPR compliance.
 * Users can request their own data export.
 * Admins can export any user's data.
 *
 * @example
 * ```typescript
 * const command = new ExportUserDataCommand({
 *   tenantId: '123',
 *   userId: '456',
 *   actorId: '456'
 * });
 * const export = await commandBus.execute(command);
 * ```
 */
export class ExportUserDataCommand implements ICommand {
  readonly readonly = true as const;
  readonly tenantId: string;
  readonly userId: string;
  readonly actorId: string;
  readonly requestId?: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly createdAt: Date;

  constructor(props: ExportUserDataCommandProps) {
    this.tenantId = props.tenantId;
    this.userId = props.userId;
    this.actorId = props.actorId;
    if (props.requestId !== undefined) {
      this.requestId = props.requestId;
    }
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
    this.createdAt = new Date();
  }
}
