import { Injectable, Logger } from '@nestjs/common';
import { EventHandler } from '@package/events';

import { UserEventType } from '../../events';

import type { UserCreatedData } from '../../events';
import type { EventMessage } from '@package/events';

/**
 * User Created Event Consumer
 *
 * Listens for user.created events from Kafka and processes them.
 * This demonstrates the consumer pattern for event-driven architecture.
 *
 * @example
 * ```typescript
 * // When a user is created, this consumer will:
 * // 1. Log the event details (for demonstration)
 * // 2. Send welcome email (placeholder)
 * // 3. Update analytics (placeholder)
 * // 4. Invalidate cache (placeholder)
 * ```
 */
@Injectable()
export class UserCreatedConsumer {
  private readonly logger = new Logger(UserCreatedConsumer.name);

  /**
   * Handle user.created event
   *
   * This method is automatically called when a user.created event is received
   * from Kafka. The @EventHandler decorator registers this method with the
   * EventsModule.
   *
   * @param event - The event message containing user creation data
   */
  @EventHandler(UserEventType.USER_CREATED)
  handleUserCreated(event: EventMessage<UserCreatedData>): void {
    const { data } = event;

    // Log the event in a visually distinct way for demonstration
    this.logger.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    USER CREATED EVENT RECEIVED                          ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event ID:    ${event.eventId}
║ User ID:     ${data.userId}
║ Tenant ID:   ${data.tenantId}
║ Organization:${data.organizationId}
║ Email Hash:  ${data.emailHash?.substring(0, 16)}...
║ Timestamp:   ${data.timestamp}
╠══════════════════════════════════════════════════════════════════════╣
║ [DEMONSTRATION] This is where you would:                              ║
║   - Send welcome email                                                 ║
║   - Track analytics                                                    ║
║   - Update cache                                                       ║
║   - Trigger workflows                                                  ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    // TODO: Implement actual business logic
    // await this.emailService.sendWelcome(data.userId, data.emailHash);
    // await this.analytics.track('user.created', data);
    // await this.cache.invalidateUserList(data.tenantId);

    // For now, this is a demonstration of the consumer pattern
    // In production, you would integrate with actual services
  }
}
