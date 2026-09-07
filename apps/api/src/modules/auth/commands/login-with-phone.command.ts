import type { ICommand } from '@package/types';

/**
 * Login with phone command
 *
 * Authenticates user with phone number and verification code
 */
export class LoginWithPhoneCommand implements ICommand {
  readonly readonly = true;
  readonly tenantId: string;
  readonly phoneNumber: string;
  readonly verificationCode: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly createdAt: Date;
  readonly requestId?: string;

  // Outbox pattern support
  readonly correlationId?: string;
  readonly causationId?: string;

  constructor(props: {
    tenantId: string;
    phoneNumber: string;
    verificationCode: string;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    this.tenantId = props.tenantId;
    this.phoneNumber = props.phoneNumber;
    this.verificationCode = props.verificationCode;
    if (props.ipAddress !== undefined) {
      this.ipAddress = props.ipAddress;
    }
    if (props.userAgent !== undefined) {
      this.userAgent = props.userAgent;
    }
    this.createdAt = new Date();
    this.requestId = props.requestId;
    if (props.correlationId !== undefined) {
      this.correlationId = props.correlationId;
    }
    if (props.causationId !== undefined) {
      this.causationId = props.causationId;
    }
  }
}
