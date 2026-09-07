# Dead Letter Queue (DLQ) Patterns

## Overview

The Dead Letter Queue (DLQ) pattern handles permanently failed events that have exceeded maximum retry attempts. This ensures that failed events are properly tracked, classified, and can be replayed or investigated by administrators.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Outbox Poller │─────▶│  Event Fails    │─────▶│  DLQ Service    │
│   Service       │      │  Max Retries    │      │                 │
└─────────────────┘      └─────────────────┘      └────────┬────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  Mark as        │
                                                  │  Dead-Lettered  │
                                                  │  (database)     │
                                                  └─────────────────┘
                                                           │
                                                           ▼
                                                  ┌─────────────────┐
                                                  │  Publish to     │
                                                  │  DLQ Topic      │
                                                  │  (optional)     │
                                                  └─────────────────┘
```

## Database Schema

The outbox table includes DLQ tracking fields:

- `dead_lettered_at`: Timestamp when event was sent to DLQ
- `dead_letter_reason`: Classification of failure (network, timeout, validation, permission, unknown)

### Index

A dedicated index on `dead_lettered_at` enables efficient queries for dead-lettered events:

```sql
CREATE INDEX outbox_dead_letter_idx ON outbox(dead_lettered_at);
```

## Error Classification

The DLQ service classifies errors into categories:

| Category     | Description                 | Example Patterns                           |
| ------------ | --------------------------- | ------------------------------------------ |
| `network`    | Network connectivity issues | ECONNREFUSED, ENOTFOUND, ECONNRESET        |
| `timeout`    | Timeout errors              | timeout, timed out, deadline               |
| `validation` | Schema validation failures  | validation, invalid, schema, format        |
| `permission` | Authorization failures      | unauthorized, forbidden, permission denied |
| `unknown`    | All other errors            | Any error not matching above patterns      |

## Configuration

### DeadLetterConfig

```typescript
interface DeadLetterConfig {
  enabled?: boolean; // Enable DLQ processing (default: true)
  maxRetries?: number; // Max retries before DLQ (default: 5)
  deadLetterTopic?: string; // DLQ topic name (default: 'dead-letter')
  alertOnFailure?: boolean; // Send alerts on DLQ (default: true)
  retentionDays?: number; // Retention period (default: 30 days)
  cleanupInterval?: number; // Cleanup interval ms (default: 86400000)
}
```

### Environment Variables

```bash
DEAD_LETTER_ENABLED=true
DEAD_LETTER_MAX_RETRIES=5
DEAD_LETTER_TOPIC=dead-letter
DEAD_LETTER_ALERT_ON_FAILURE=true
DEAD_LETTER_RETENTION_DAYS=30
DEAD_LETTER_CLEANUP_INTERVAL=86400000
```

## Usage

### Sending Events to DLQ

Events are automatically sent to DLQ when they exceed max retries:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly deadLetterService: DeadLetterService) {}

  async handleEventFailure(event: OutboxRecord, error: Error) {
    await this.deadLetterService.sendToDeadLetter(event, error);
  }
}
```

The DLQ service:

1. Classifies the error into a category
2. Marks the event as dead-lettered in the database
3. Logs an alert (if configured)
4. Publishes to the DLQ topic (if configured)

### Manual Error Classification

```typescript
const classification = deadLetterService.classifyError(error);
console.log(classification); // 'network' | 'timeout' | 'validation' | 'permission' | 'unknown'
```

### Retrieving Dead-Lettered Events

```typescript
const deadEvents = await deadLetterService.getDeadLetteredEvents('tenant-123');
// Returns: DeadLetterEvent[]
```

### Replay from DLQ

```typescript
const success = await deadLetterService.replayFromDeadLetter(eventId);
if (success) {
  console.log('Event queued for replay');
}
```

Replay:

1. Verifies event exists and is dead-lettered
2. Clears DLQ fields (`dead_lettered_at`, `dead_letter_reason`)
3. Resets status to `pending`
4. Resets retry count to 0
5. Event will be picked up by the outbox poller on next cycle

## Admin API Endpoints

### Get Dead-Lettered Events

```http
GET /api/v1/admin/events/dead-letter
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": [
    {
      "eventId": "123e4567-e89b-12d3-a456-426614174000",
      "eventType": "user.created",
      "aggregateId": "user-123",
      "tenantId": "tenant-abc",
      "retryCount": 5,
      "errorMessage": "Connection timeout",
      "deadLetteredAt": "2024-12-31T12:00:00.000Z",
      "reason": "timeout"
    }
  ],
  "metadata": {
    "timestamp": "2024-12-31T12:00:00.000Z"
  }
}
```

**Permission:** `system:system:monitor`

### Replay Dead-Lettered Event

```http
POST /api/v1/admin/events/dead-letter/:eventId/replay
Authorization: Bearer <token>
```

**Response:**

```json
{
  "data": {
    "eventId": "123e4567-e89b-12d3-a456-426614174000",
    "success": true,
    "message": "Event queued for replay"
  },
  "metadata": {
    "timestamp": "2024-12-31T12:00:00.000Z"
  }
}
```

**Permission:** `system:system:settings`

### Delete Dead-Lettered Event

```http
DELETE /api/v1/admin/events/dead-letter/:eventId
Authorization: Bearer <token>
```

**Response:** `204 No Content`

**Permission:** `system:tenants:delete`

## Monitoring and Alerts

### OpenTelemetry Metrics

The DLQ service emits the following metrics:

- `dead_letter.total`: Total number of events sent to DLQ (with `classification` and `eventType` attributes)
- `dead_letter.replay_success`: Number of successful replay attempts (with `eventType` attribute)
- `dead_letter.replay_failed`: Number of failed replay attempts

### Alert Format

When `alertOnFailure` is true, the following alert is logged:

```
╔══════════════════════════════════════════════════════════════════════╗
║                    DEAD LETTER QUEUE ALERT                              ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event permanently failed and sent to dead letter queue                 ║
╠══════════════════════════════════════════════════════════════════════╣
║ Event ID:    123e4567-e89b-12d3-a456-426614174000
║ Event Type:  user.created
║ Aggregate:   user-123
║ Tenant:      tenant-abc
║ Retry Count: 5
║ Reason:      timeout
║ Error:       Connection timeout (sanitized)
╠══════════════════════════════════════════════════════════════════════╣
║ [ACTION] Review dead letter event and replay if appropriate             ║
╚══════════════════════════════════════════════════════════════════════╝
```

## Cleanup and Retention

### Automatic Cleanup

The DLQ service automatically cleans up old dead-lettered events based on the retention period. The cleanup interval is configured via `cleanupInterval` (default: 24 hours).

### Manual Cleanup

```typescript
const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
await outboxRepo.cleanupDeadLetters(cutoffDate);
```

## Best Practices

1. **Set appropriate retry limits**: Balance between transient error recovery and timely DLQ detection
2. **Monitor DLQ size**: Large DLQ may indicate systemic issues
3. **Classify errors accurately**: Helps identify root causes
4. **Replay with caution**: Verify the underlying issue is resolved before replaying
5. **Set retention policies**: Balance between debugging needs and storage costs
6. **Enable alerting**: Get notified when events go to DLQ for timely intervention

## Error Handling

### PII Protection

All error messages are sanitized before logging and publishing to DLQ:

```typescript
import { sanitizeError } from './utils/error-sanitizer';

const sanitizedError = sanitizeError(error.message);
// Removes stack traces, file paths, and limits length
```

### Multi-Tenancy

All DLQ operations are scoped to tenant ID:

```typescript
// Get dead-lettered events for specific tenant
const events = await deadLetterService.getDeadLetteredEvents('tenant-123');
```

## Integration with External Systems

### PagerDuty Integration

```typescript
@Injectable()
export class DeadLetterService extends DeadLetterServiceBase {
  constructor(
    eventBus: EventBus,
    outboxRepo: OutboxRepository,
    config: DeadLetterConfig,
    private readonly pagerDutyService: PagerDutyService
  ) {
    super(eventBus, outboxRepo, config);
  }

  override async sendToDeadLetter(event: OutboxRecord, error: unknown) {
    await super.sendToDeadLetter(event, error);

    // Create PagerDuty incident for critical events
    if (event.eventType.startsWith('payment.')) {
      await this.pagerDutyService.createIncident({
        summary: `Payment event failed: ${event.eventId}`,
        severity: 'critical'
      });
    }
  }
}
```

### Slack Integration

```typescript
override async sendToDeadLetter(event: OutboxRecord, error: unknown) {
  await super.sendToDeadLetter(event, error);

  // Post to Slack channel
  await this.slackService.postMessage({
    channel: '#events-dlq',
    text: `Event ${event.eventId} (${event.eventType}) sent to DLQ`,
  });
}
```

## Testing

### Unit Tests

```typescript
import { DeadLetterService, ErrorClassification } from '@package/events';

describe('DeadLetterService', () => {
  it('should classify timeout errors correctly', () => {
    const service = new DeadLetterService(eventBus, outboxRepo, config);
    const error = new Error('Request timed out');
    assert.equal(service.classifyError(error), ErrorClassification.TIMEOUT);
  });

  it('should send events to DLQ', async () => {
    const service = new DeadLetterService(eventBus, outboxRepo, config);
    await service.sendToDeadLetter(event, error);
    // Verify event is marked as dead-lettered
  });
});
```

## Documentation References

- [Outbox Pattern](./outbox-pattern.md)
- [Event Schemas](./event-schemas.md)
- [Creating Consumers](./creating-consumers.md)
- [OpenTelemetry Integration](../../../../packages/observability/README.md)
