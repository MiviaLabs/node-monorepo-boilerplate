# Performance Guide

Performance characteristics and optimization strategies for the encryption infrastructure.

## Table of Contents

- [Overview](#overview)
- [Performance Benchmarks](#performance-benchmarks)
- [Optimization Strategies](#optimization-strategies)
- [Scaling Considerations](#scaling-considerations)
- [Monitoring](#monitoring)

## Overview

This package is designed for high-performance encryption operations with envelope encryption pattern:

- **Envelope Encryption** - Reduces KMS calls by using data keys
- **Batch Processing** - Efficient bulk data migration
- **Connection Pooling** - Reuses KMS connections
- **Caching** - Optional caching for envelope services

## Performance Benchmarks

### Encryption/Decryption Speed

Expected performance on typical infrastructure:

| Operation         | EnvVar Provider | GCP KMS    | AWS KMS    | Azure Key Vault |
| ----------------- | --------------- | ---------- | ---------- | --------------- |
| Encrypt (small)   | ~0.1ms          | ~50-100ms  | ~50-100ms  | ~50-100ms       |
| Encrypt (large)   | ~1ms            | ~100-200ms | ~100-200ms | ~100-200ms      |
| Decrypt (small)   | ~0.1ms          | ~50-100ms  | ~50-100ms  | ~50-100ms       |
| Decrypt (large)   | ~1ms            | ~100-200ms | ~100-200ms | ~100-200ms      |
| Generate Data Key | ~0.5ms          | ~100-150ms | ~100-150ms | ~100-150ms      |

**Note:** "small" = < 1KB, "large" = 1MB

### Migration Throughput

Expected migration speeds (assuming 1KB per entity):

| Batch Size | Entities/Second | Memory Usage | Notes                          |
| ---------- | --------------- | ------------ | ------------------------------ |
| 10         | ~20-50          | Low          | Good for constrained resources |
| 50         | ~50-100         | Low          | Balanced option                |
| 100        | ~100-200        | Medium       | Recommended for most cases     |
| 500        | ~200-400        | High         | Good for large datasets        |
| 1000       | ~300-500        | Very High    | May require memory increase    |

**Example:**

```typescript
// 100,000 entities at 100 entities/sec = ~17 minutes
// 100,000 entities at 200 entities/sec = ~8 minutes
```

### Memory Usage

Typical memory consumption:

| Component                 | Memory (per instance) |
| ------------------------- | --------------------- |
| EnvVarProvider            | ~1 MB                 |
| GcpKmsProvider            | ~50 MB                |
| GcpSecretManagerProvider  | ~50 MB                |
| AwsKmsProvider            | ~50 MB                |
| EnvelopeEncryptionService | ~5 MB                 |
| DataMigrationService      | ~10 MB                |

## Optimization Strategies

### 1. Use Envelope Encryption

Envelope encryption significantly reduces KMS calls:

```typescript
// WITHOUT envelope encryption (slow)
// Each entity requires 1 KMS call
for (const entity of entities) {
  await kmsProvider.encrypt(entity.data); // 1 KMS call per entity
}
// 1000 entities = 1000 KMS calls

// WITH envelope encryption (fast)
// Each entity uses cached data key
const dataKey = await kmsProvider.generateDataKey(); // 1 KMS call
for (const entity of entities) {
  await envelopeService.encrypt(entity.data, { dataKey }); // No KMS call
}
// 1000 entities = 1 KMS call (initial)
```

### 2. Optimize Batch Sizes

Choose batch size based on your data:

```typescript
// For small entities (< 1KB)
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 500 // Large batches for small entities
});

// For medium entities (1KB - 10KB)
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 100 // Medium batches
});

// For large entities (> 10KB)
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 10 // Small batches for large entities
});
```

### 3. Add Delays Between Batches

Control migration speed to avoid overwhelming resources:

```typescript
// Add delay between batches
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 100,
  batchDelay: 100 // 100ms delay between batches
});
```

**Recommended delays:**

- **No delay:** Max speed, may affect application performance
- **50-100ms:** Good balance, minimal impact
- **200-500ms:** For sensitive production systems
- **1000ms+:** For very constrained resources

### 4. Use Parallel Processing

Process multiple entities concurrently:

```typescript
// Enable concurrency in migration
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  concurrency: 4 // Process 4 entities in parallel
});
```

**Concurrency guidelines:**

- **CPU-bound:** Use number of CPU cores
- **I/O-bound:** Can use higher concurrency (4-8)
- **Database-bound:** Match connection pool size

### 5. Leverage ContinueOnError

Don't let single entity failures slow down migration:

```typescript
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  continueOnError: true // Continue on single entity failures
});

// Handle failures after migration
if (result.failed > 0) {
  for (const error of result.errors) {
    logger.error(`Failed to migrate ${error.entityId}:`, error.error);
    // Retry failed entities
  }
}
```

### 6. Use Appropriate Providers

Choose the right provider for your use case:

```typescript
// Development/Testing
const devProvider = new EnvVarProvider({
  encryptionKey: process.env.ENCRYPTION_KEY
});
// Fast: ~0.1ms per operation

// Production (Cloud)
const prodProvider = new GcpKmsProvider({
  projectId: 'my-project',
  locationId: 'global',
  keyRingId: 'my-keyring',
  keyId: 'my-key'
});
// Secure: ~50-100ms per operation
```

### 7. Implement Caching

Cache frequently accessed data:

```typescript
import { cache } from './cache';

class CachedEncryptionService {
  async encrypt(plaintext: string, keyId: string): Promise<string> {
    const cacheKey = `encrypt:${keyId}:${plaintext}`;

    // Check cache
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    // Encrypt and cache
    const result = await this.encryption.encryptToBase64(plaintext, { keyId });
    await cache.set(cacheKey, result.ciphertext, 300); // Cache for 5 minutes

    return result.ciphertext;
  }
}
```

### 8. Monitor and Adapt

Adjust parameters based on real-time metrics:

```typescript
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 100,
  onProgress: async (progress) => {
    const elapsed = Date.now() - startTime;
    const throughput = progress.processed / (elapsed / 1000);

    console.log(`Throughput: ${throughput.toFixed(2)} entities/sec`);

    // Adjust batch size based on performance
    if (throughput < 50) {
      console.log('Low throughput - consider reducing batch size');
    } else if (throughput > 200) {
      console.log('High throughput - consider increasing batch size');
    }
  }
});
```

## Scaling Considerations

### Horizontal Scaling

For large-scale migrations:

```typescript
// Split migration across multiple workers
const totalEntities = await repository.count();
const workers = 4;
const entitiesPerWorker = Math.ceil(totalEntities / workers);

const promises = [];
for (let i = 0; i < workers; i++) {
  const offset = i * entitiesPerWorker;

  promises.push(
    migrationService.migrateEntities(
      {
        ...repository,
        findAll: (opts) =>
          repository.findAll({
            limit: entitiesPerWorker,
            offset: offset + (opts?.offset ?? 0)
          })
      },
      {
        oldKeyId: 'old-key',
        newKeyId: 'new-key'
      }
    )
  );
}

await Promise.all(promises);
```

### Database Indexing

Ensure proper indexes for migration queries:

```sql
-- Create index on encrypted fields
CREATE INDEX idx_users_email_encrypted ON users USING GIN (email);

-- Or use partial index for entities needing migration
CREATE INDEX idx_users_need_migration ON users (id)
WHERE sensitive_data->>'version' = 'old-key';
```

### Connection Pooling

Configure appropriate connection pool sizes:

```typescript
// PostgreSQL connection pool
const pool = new Pool({
  max: 20, // Maximum connections
  min: 5, // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// Match batch size to pool size
const result = await migrationService.migrateEntities(repository, {
  oldKeyId: 'old-key',
  newKeyId: 'new-key',
  batchSize: 20 // Match pool size
});
```

### Resource Limits

Set appropriate resource limits:

```yaml
# Kubernetes example
resources:
  requests:
    memory: '256Mi'
    cpu: '250m'
  limits:
    memory: '512Mi'
    cpu: '500m'
```

## Monitoring

### Metrics to Track

Key performance indicators:

```typescript
interface EncryptionMetrics {
  // Operation counts
  encryptCount: number;
  decryptCount: number;
  migrationCount: number;

  // Operation times
  avgEncryptTime: number;
  avgDecryptTime: number;
  avgMigrationTime: number;

  // Error rates
  encryptErrorRate: number;
  decryptErrorRate: number;
  migrationErrorRate: number;

  // Resource usage
  memoryUsage: number;
  cpuUsage: number;
  activeConnections: number;
}
```

### OpenTelemetry Integration

Built-in OpenTelemetry metrics:

```typescript
import { MeterProvider } from '@opentelemetry/metrics';

const meter = new MeterProvider().getMeter('encryption');

// Track encryption operations
const encryptCounter = meter.createCounter('encryption.operations', {
  description: 'Number of encryption operations'
});

const encryptDuration = meter.createHistogram('encryption.duration', {
  description: 'Duration of encryption operations'
});

// Use in code
const startTime = Date.now();
await encryption.encrypt(data);
encryptCounter.add(1, { operation: 'encrypt' });
encryptDuration.record(Date.now() - startTime, { operation: 'encrypt' });
```

### Health Checks

Implement health check endpoints:

```typescript
app.get('/health/encryption', async (req, res) => {
  const health = {
    status: 'healthy',
    providers: {},
    metrics: {}
  };

  // Check provider health
  for (const [name, provider] of providers) {
    const isHealthy = await provider.healthCheck();
    health.providers[name] = isHealthy;

    if (!isHealthy) {
      health.status = 'degraded';
    }
  }

  // Include metrics
  health.metrics = {
    activeMigrations: migrationService.listActiveMigrations().length,
    lastEncryption: lastEncryptionTime,
    errorRate: calculateErrorRate()
  };

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});
```

### Performance Testing

Load test your encryption setup:

```typescript
import { pMap } from 'p-map';

async function loadTest() {
  const data = 'test-data-to-encrypt';
  const iterations = 1000;
  const concurrency = 10;

  const startTime = Date.now();

  await pMap(
    Array.from({ length: iterations }),
    async () => {
      const result = await encryption.encryptToBase64(data);
      const decrypted = await encryption.decryptFromBase64(
        result.ciphertext,
        result.encryptedDataKey,
        result.iv,
        result.authTag
      );
      return decrypted;
    },
    { concurrency }
  );

  const duration = Date.now() - startTime;
  const opsPerSecond = (iterations / duration) * 1000;

  console.log(`Operations: ${iterations}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Ops/sec: ${opsPerSecond.toFixed(2)}`);
  console.log(`Avg latency: ${(duration / iterations).toFixed(2)}ms`);
}
```

## Performance Tuning Checklist

Before running a production migration:

- [ ] Tested in staging environment
- [ ] Measured baseline performance
- [ ] Configured appropriate batch size
- [ ] Set up monitoring and alerting
- [ ] Configured connection pooling
- [ ] Optimized database indexes
- [ ] Set resource limits appropriately
- [ ] Implemented error handling
- [ ] Prepared rollback plan
- [ ] Scheduled maintenance window (if needed)
- [ ] Tested migration on sample data
- [ ] Configured progress tracking
- [ ] Set up health checks

## Best Practices Summary

1. **Start with small batches** - Increase if performance is good
2. **Monitor actively** - Watch for issues during migration
3. **Use dry-run mode** - Preview before actual migration
4. **Add delays** - If migration affects application performance
5. **Use continueOnError** - Don't let single failures stop migration
6. **Test thoroughly** - Verify in staging before production
7. **Monitor resources** - Watch memory, CPU, and connections
8. **Plan for rollback** - Know how to revert if needed
9. **Document everything** - Record migration parameters and results
10. **Learn and adapt** - Adjust parameters based on results

## Additional Resources

- [Key Rotation Guide](./KEY_ROTATION_GUIDE.md) - Key rotation workflows
- [Migration Guide](./MIGRATION_GUIDE.md) - Detailed migration procedures
- [Provider Documentation](./PROVIDERS.md) - Provider-specific information
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
