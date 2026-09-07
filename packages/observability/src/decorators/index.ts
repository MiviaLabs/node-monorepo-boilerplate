/**
 * Observability Decorators
 *
 * Decorator utilities for automatic metric collection.
 *
 * @example
 * ```typescript
 * import { MetricCounter, MetricHistogram } from '@package/observability/decorators';
 * ```
 */

// Decorators
export {
  MetricCounter,
  MetricHistogram,
  MetricOperationCounter,
  MetricRecorder
} from './metric.decorator';

// Types
export type {
  CounterDecoratorOptions,
  HistogramDecoratorOptions,
  IOperationCounterOptions
} from './metric.decorator';

// Constants
export { MetricNamingConvention, MetricAttributes } from './metric.decorator';
