// ====================================================================
// Outbox Repository
// ====================================================================
export { OutboxRepository } from './outbox.repository';

// ====================================================================
// Outbox Poller Service
// ====================================================================
export { OutboxPollerService } from './outbox-poller.service';
export { AUDIT_EVENT_SCHEMA_VERSION, buildAuditOutboxMessage } from './audit-event.builder';

// ====================================================================
// Outbox Configuration
// ====================================================================
export {
  outboxPollerConfig,
  createOutboxPollerConfig,
  validateOutboxPollerConfig
} from './outbox.config';

// ====================================================================
// Types
// ====================================================================
export type { OutboxPollerConfig } from './outbox-poller.service';
export type { AuditOutboxPayload, BuildAuditOutboxMessageParams } from './audit-event.builder';
