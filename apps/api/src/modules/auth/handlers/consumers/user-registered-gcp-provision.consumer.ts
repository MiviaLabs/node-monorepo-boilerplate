import { Injectable, Logger, Inject } from '@nestjs/common';
import { AuthProviderFactory, AUTH_PROVIDER_FACTORY } from '@package/auth';
import { EventHandler } from '@package/events';

import { AuthEventType, UserRegisteredData } from '../../events';
import { AuthRepository } from '../../repositories/auth.repository';
import { UserIdentityRepository } from '../../repositories/user-identity.repository';

/**
 * DEPRECATED: Event consumer for asynchronous GCP user and tenant provisioning
 *
 * ⚠️ THIS CONSUMER IS NO LONGER USED ⚠️
 *
 * Registration now uses SYNCHRONOUS GCP provisioning.
 * All GCP operations happen in the registration transaction.
 *
 * This consumer is kept as a no-op for backward compatibility with existing
 * outbox events but does NOT perform any GCP provisioning.
 *
 * @deprecated Use synchronous registration flow in AuthService.registerWithEmailPassword
 */
@Injectable()
export class UserRegisteredGcpProvisionConsumer {
  private readonly logger = new Logger(UserRegisteredGcpProvisionConsumer.name);

  constructor(
    // Note: These are injected but not used - this handler is deprecated and a no-op
    // They're kept to satisfy NestJS DI but marked with _ prefix to indicate intentionally unused
    @Inject(AUTH_PROVIDER_FACTORY) readonly _authProviderFactory: AuthProviderFactory,
    readonly _authRepository: AuthRepository,
    readonly _userIdentityRepository: UserIdentityRepository
  ) {}

  /**
   * Handle USER_REGISTERED event (NO-OP)
   *
   * @deprecated This event handler is a no-op. GCP provisioning now happens synchronously.
   * @param event - Outbox event with UserRegisteredData payload
   */
  @EventHandler(AuthEventType.USER_REGISTERED)
  handle(event: {
    eventId: string;
    data?: UserRegisteredData;
    payload?: UserRegisteredData;
    schemaVersion: string;
  }): void {
    const payload = event.data ?? event.payload;
    if (!payload) {
      this.logger.warn(`[${event.eventId}] DEPRECATED: USER_REGISTERED event missing payload`);
      return;
    }

    this.logger.warn(
      `[${event.eventId}] DEPRECATED: Received USER_REGISTERED event for user: ${payload.userId}. ` +
        `This consumer is a no-op. GCP provisioning now happens synchronously during registration.`
    );

    // NO-OP: Registration now handles GCP provisioning synchronously
    // This event should not be created by new registrations
  }
}
