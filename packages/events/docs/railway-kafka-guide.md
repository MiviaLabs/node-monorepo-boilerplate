# Railway Kafka Configuration Guide

## Overview

Railway Kafka requires special configuration for consumers due to its infrastructure architecture. This guide explains the specific settings and optimizations needed for Railway Kafka.

## Key Differences from Standard Kafka

### 1. Group Coordinator Availability

Railway Kafka's group coordinator can take longer to become available than standard Kafka deployments. This is because:

- Railway uses dynamic broker scaling
- Group coordinator election takes longer in Railway's infrastructure
- Network conditions between containers vary

### 2. Consumer Connection Timeouts

Standard Kafka clients often timeout before Railway's group coordinator is ready. This requires:

- Higher session timeout (30s instead of default 10s)
- Higher heartbeat interval (3s instead of default 3s)
- Longer rebalance timeout (60s instead of default 60s)

### 3. Retry Strategy

Railway benefits from more aggressive retry logic:

- More connection retries (10 instead of 5)
- More subscription retries (15 instead of 10)
- Longer delays between retries (2-3s instead of 1-2s)
- Exponential backoff with longer maximum (60s)

## Configuration

### Consumer Configuration

```typescript
const consumer = kafka.consumer({
  groupId: consumerGroupId,
  sessionTimeout: 30000, // 30 seconds (Railway needs longer)
  heartbeatInterval: 3000, // 3 seconds (balance responsiveness vs network)
  rebalanceTimeout: 60000, // 60 seconds (Railway's multi-broker setup)
  maxWaitTimeInMs: 5000 // 5 seconds (reduce latency)
});
```

### Connection Retry Logic

```typescript
const maxConnectRetries = 10; // Increased from 5
const connectRetryDelay = 2000; // Increased from 1s

for (let attempt = 1; attempt <= maxConnectRetries; attempt++) {
  try {
    await consumer.connect();
    break;
  } catch (error) {
    // Check if error is retryable
    const isRetryable =
      errorMessage.includes('group coordinator') || errorMessage.includes('not available');

    if (!isRetryable || attempt === maxConnectRetries) {
      throw error;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s (max)
    const backoffDelay = Math.min(connectRetryDelay * Math.pow(2, attempt - 1), 60000);
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));
  }
}
```

### Subscription Retry Logic

```typescript
const maxSubscribeRetries = 15; // Increased from 10
const subscribeRetryDelay = 3000; // Increased from 2s

for (let attempt = 1; attempt <= maxSubscribeRetries; attempt++) {
  try {
    await consumer.subscribe({ topic, fromBeginning: false });
    break;
  } catch (error) {
    // Check if error is retryable
    const isRetryable =
      errorMessage.includes('leadership election') ||
      errorMessage.includes('group coordinator') ||
      errorMessage.includes('not available');

    if (!isRetryable || attempt === maxSubscribeRetries) {
      throw error;
    }

    // Exponential backoff: 3s, 6s, 12s, 24s, 48s, 60s (max)
    const backoffDelay = Math.min(subscribeRetryDelay * Math.pow(2, attempt - 1), 60000);
    await new Promise((resolve) => setTimeout(resolve, backoffDelay));
  }
}
```

## Environment Variables

For Railway Kafka, set these environment variables:

```bash
# Railway provides KAFKA_BROKERS with INTERNAL:// protocol prefix
# The client automatically strips the protocol prefix
KAFKA_BROKERS=INTERNAL://kafka.railway.internal:29092

# Optional: Enable SSL for Railway (if using SSL)
KAFKA_SSL=true

# Optional: SASL authentication (if Railway requires it)
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=<username>
KAFKA_SASL_PASSWORD=<password>

# Connection timeouts (increased for Railway)
KAFKA_CONNECTION_TIMEOUT=30000  # 30 seconds
KAFKA_REQUEST_TIMEOUT=60000     # 60 seconds

# Retry configuration (increased for Railway)
KAFKA_MAX_RETRIES=10            # More retries for Railway
KAFKA_RETRY_INTERVAL=5000       # 5 seconds between retries
```

## Common Issues and Solutions

### Issue 1: "The group coordinator is not available"

**Cause**: Group coordinator hasn't been elected yet or is not ready.

**Solution**:

- Increase session timeout to 30s
- Add retry logic with exponential backoff
- Wait up to 60s for group coordinator to become available

### Issue 2: "There is no leader for this topic-partition"

**Cause**: Topic doesn't exist or leadership election is in progress.

**Solution**:

- Auto-create topics before subscribing
- Use retry logic with exponential backoff
- Wait for leadership election to complete

### Issue 3: Connection timeout on startup

**Cause**: Consumer connects before Railway Kafka is fully initialized.

**Solution**:

- Use health check before starting consumer
- Add retry logic with exponential backoff
- Increase connection timeout to 30s

### Issue 4: Consumer disconnects frequently

**Cause**: Session timeout too low for Railway's network conditions.

**Solution**:

- Increase session timeout to 30s
- Increase heartbeat interval to 3s
- Monitor consumer health and auto-reconnect

## Best Practices

### 1. Use Auto-Create Topics

Create topics before subscribing to avoid leadership election errors:

```typescript
await ensureTopicExists(topic);
await consumer.subscribe({ topic });
```

### 2. Implement Retry Logic

Use exponential backoff for all Kafka operations:

```typescript
const backoffDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
await new Promise((resolve) => setTimeout(resolve, backoffDelay));
```

### 3. Monitor Consumer Health

Track consumer connection status and auto-reconnect:

```typescript
consumer.on('consumer.disconnect', async () => {
  await consumer.connect();
});
```

### 4. Use Unique Consumer Group IDs

Use UUID-based consumer group IDs to avoid conflicts:

```typescript
const groupId = `handler-${topic}-${randomUUID()}`;
```

### 5. Handle Errors Gracefully

Catch and log errors, but allow retryable errors to be retried:

```typescript
const isRetryable =
  errorMessage.includes('group coordinator') ||
  errorMessage.includes('leadership election') ||
  errorMessage.includes('not available');
```

## Running Tests

To test Railway Kafka configuration:

```bash
# 1. Set Railway Kafka environment variables
export KAFKA_BROKERS=$(railway variables get KAFKA_BROKERS)

# 2. Test producer (should work immediately)
pnpm nx test api --testFile=producer.test.ts

# 3. Test consumer (may need retries)
pnpm nx test api --testFile=consumer.test.ts

# 4. Test end-to-end
pnpm nx e2e api
```

## Monitoring

Monitor these metrics for Railway Kafka:

- Consumer connection status (connected/disconnected)
- Consumer lag (messages pending)
- Consumer group coordinator availability
- Topic leadership election time
- Consumer rebalance frequency

## References

- [Railway Kafka Documentation](https://docs.railway.app/template/kafka)
- [KafkaJS Consumer Configuration](https://kafka.js.org/docs/consumers)
- [Kafka Consumer Group Protocol](https://kafka.apache.org/documentation/#consumergroups)
