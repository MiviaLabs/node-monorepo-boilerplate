# Observability Stack

This directory contains configuration for the OpenTelemetry observability infrastructure used in the Node Monorepo Boilerplate for local development.

## Overview

The observability stack provides:

- **Distributed Tracing** - Track requests across services with Jaeger
- **Metrics Collection** - Monitor application performance with Prometheus
- **Visualization** - Create dashboards and alerts with Grafana
- **Centralized Collection** - Aggregate telemetry with OpenTelemetry Collector

## Architecture

```
Applications (API, Web, Workers)
         |
         v
[OpenTelemetry SDK]
         |
         | OTLP (gRPC/HTTP)
         |
         v
[OTEL Collector]
    |       |
    |       +---> [Jaeger] (Traces)
    |
    +---------> [Prometheus] (Metrics)
                     |
                     v
                [Grafana] (Dashboards)
```

## Services

| Service        | Port  | URL                           | Purpose                       |
| -------------- | ----- | ----------------------------- | ----------------------------- |
| OTEL Collector | 4317  | N/A (OTLP gRPC endpoint)      | Receives telemetry            |
| OTEL Collector | 4318  | N/A (OTLP HTTP endpoint)      | Receives telemetry            |
| OTEL Collector | 8888  | http://localhost:8888/metrics | Collector metrics endpoint    |
| Jaeger UI      | 16686 | http://localhost:16686        | View distributed traces       |
| Prometheus     | 9090  | http://localhost:9090         | Query metrics                 |
| Grafana        | 3001  | http://localhost:3001         | View dashboards (admin/admin) |

## Quick Start

### 1. Start Observability Stack

```bash
# Start all observability services
docker compose up -d otel-collector jaeger prometheus grafana

# Or start everything including other infrastructure
docker compose up -d
```

### 2. Enable OpenTelemetry in Your Application

Copy `.env.example` to `.env` and verify:

```bash
# apps/api/.env
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
REDIS_TELEMETRY_ENABLED=true
```

### 3. Start Your Application

```bash
# Start the API server
pnpm nx serve api

# Start the web app
pnpm nx dev web
```

### 4. Access Observability UIs

- **Jaeger** (Traces): http://localhost:16686
- **Prometheus** (Metrics): http://localhost:9090
- **Grafana** (Dashboards): http://localhost:3001 (admin/admin)

## Using Jaeger

### Search for Traces

1. Go to http://localhost:16686
2. Select your service from the dropdown (e.g., `api`)
3. Click "Find Traces"
4. Click on a trace to see detailed spans

### Trace View Features

- **Service Graph** - Visualize service dependencies
- **Timeline View** - See span timing and relationships
- **Span Details** - View attributes, logs, and errors
- **Compare Traces** - Compare two traces side-by-side

## Using Prometheus

### Query Metrics

1. Go to http://localhost:9090
2. Enter a PromQL query in the search bar
3. Click "Execute"

### Example Queries

```promql
# Cache hit rate
rate(starterkit_cache_hit_total[5m]) / rate(starterkit_cache_operations_total[5m])

# Request duration percentiles
histogram_quantile(0.95, rate(http_request_duration_milliseconds_bucket[5m]))

# Error rate
rate(starterkit_cache_operations_total{cache_status="error"}[5m])
```

## Using Grafana

### Access Dashboards

1. Go to http://localhost:3001
2. Login with `admin/admin`
3. Navigate to Dashboards -> Starter Kit

### Create Custom Dashboards

1. Click "+" -> "Dashboard"
2. Add panels with Prometheus queries
3. Save and organize in folders

### Import Dashboards

- Grafana Dashboard ID: `13686` (Node Exporter)
- Grafana Dashboard ID: `14832` (Redis)

## Configuration Files

| File                                | Purpose                          |
| ----------------------------------- | -------------------------------- |
| `otel-collector-config.yaml`        | Collector pipeline configuration |
| `prometheus.yml`                    | Prometheus scrape targets        |
| `grafana/provisioning/datasources/` | Auto-provision datasources       |
| `grafana/provisioning/dashboards/`  | Auto-provision dashboards        |

## OpenTelemetry Collector Configuration

The collector is configured with:

### Receivers

- **OTLP** (gRPC/HTTP) - Receives traces, metrics, logs
- **Prometheus** - Scrapes metrics endpoints

### Processors

- **Batch** - Batches telemetry before export
- **Memory Limiter** - Prevents OOM
- **Resource Detection** - Adds system attributes
- **Attributes** - Modifies/removes sensitive attributes

### Exporters

- **Jaeger** - Exports traces
- **Prometheus** - Exposes metrics endpoint
- **Prometheus Remote Write** - Pushes to Prometheus
- **Logging** - Console output (debug)

## Metrics Reference

### Cache Metrics

| Metric Name                              | Type      | Description            |
| ---------------------------------------- | --------- | ---------------------- |
| `starterkit_cache_hit_total`             | Counter   | Cache hits             |
| `starterkit_cache_miss_total`            | Counter   | Cache misses           |
| `starterkit_cache_operations_total`      | Counter   | Total cache operations |
| `starterkit_cache_duration_milliseconds` | Histogram | Operation duration     |

### HTTP Metrics

| Metric Name                          | Type      | Description      |
| ------------------------------------ | --------- | ---------------- |
| `http_request_duration_milliseconds` | Histogram | Request duration |
| `http_requests_total`                | Counter   | Total requests   |

## Tracing Reference

### Spans

Spans are automatically created for:

- Command handlers (CQRS)
- Query handlers (CQRS)
- Event handlers
- HTTP requests
- Cache operations (if enabled)
- Database queries

### Span Attributes

Standard attributes include:

- `tenant.id` - Current tenant ID
- `actor.id` - User performing action
- `operation.type` - command/query/event
- `resource.id` - Resource being operated on

## Troubleshooting

### Collector Not Receiving Data

```bash
# Check collector logs
docker logs starter-kit-otel-collector

# Check OTLP endpoint is accessible
curl http://localhost:4318/health
```

### No Traces in Jaeger

1. Verify OTEL_ENABLED=true in application .env
2. Check exporter endpoint: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`
3. Check collector is exporting to Jaeger:
   ```bash
   docker logs starter-kit-otel-collector | grep jaeger
   ```

### No Metrics in Prometheus

1. Verify collector is exposing metrics:
   ```bash
   curl http://localhost:8888/metrics
   ```
2. Check Prometheus targets:
   - Go to http://localhost:9090/targets
   - Verify `otel-collector` is UP

### Grafana Datasource Not Working

1. Check datasource configuration in provisioning files
2. Verify Prometheus is accessible from Grafana container:
   ```bash
   docker exec starter-kit-grafana wget -O- http://prometheus:9090/api/v1/query?query=up
   ```

## Development Tips

### Adding Custom Metrics

```typescript
import { metricsService } from '@package/observability';

// Create a counter
const counter = metricsService.createCounter('custom.metric', {
  description: 'Custom metric'
});

// Increment counter
metricsService.incrementCounter('custom.metric', 1, { label: 'value' });
```

### Adding Custom Spans

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('my-service');

tracer.startActiveSpan('custom-operation', (span) => {
  try {
    span.setAttribute('custom.attribute', 'value');
    // Your code here
  } catch (error) {
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
});
```

## Production Considerations

For production deployments:

1. **Use managed services** - AWS X-Ray, Google Cloud Trace, etc.
2. **Adjust sampling** - Reduce trace volume
3. **Add authentication** - Secure collector endpoints
4. **Persistent storage** - Volume mounts for Prometheus/Grafana
5. **Resource limits** - CPU/memory constraints
6. **Monitoring** - Monitor the monitoring stack

## Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OTel Collector Configuration](https://opentelemetry.io/docs/collector/configuration/)
