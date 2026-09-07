/**
 * OpenTelemetry instrumentation decorators for automatic tracing.
 *
 * This module provides decorators that automatically wrap methods with
 * OpenTelemetry spans, enabling distributed tracing without manual
 * instrumentation code.
 *
 * ## Decorator Types
 *
 * | Decorator | Scope | Use Case |
 * |-----------|-------|----------|
 * | `@Instrumented()` | Method | Trace individual methods |
 * | `@InstrumentedClass()` | Class | Trace all methods in a class |
 *
 * ## TypeScript Decorator Compatibility
 *
 * These decorators support both:
 *
 * - **TypeScript 5+ Standard Decorators** (Stage 3): The new ECMAScript standard
 *   decorator proposal. Used when `experimentalDecorators` is `false` in tsconfig.
 *
 * - **Legacy TypeScript Decorators**: The original TypeScript decorator implementation.
 *   Used when `experimentalDecorators: true` in tsconfig.
 *
 * The decorator automatically detects which format is being used and handles
 * both transparently. No configuration is required.
 *
 * ## Span Naming Convention
 *
 * Spans are named using the pattern: `ClassName.methodName`
 *
 * For example:
 * - `UserService.findById`
 * - `OrderRepository.create`
 * - `PaymentGateway.processPayment`
 *
 * ## Error Handling
 *
 * When a decorated method throws an error:
 * 1. The error is recorded on the span via `span.recordException()`
 * 2. The span status is set to ERROR with the error message
 * 3. The span is ended
 * 4. The original error is re-thrown (not swallowed)
 *
 * This ensures errors are visible in traces while preserving normal error flow.
 *
 * @see getTracer - Tracer retrieval function
 * @see toAttributes - Attribute conversion utility
 * @see IOpenTelemetryConfig - Tracing configuration
 *
 * @example Basic method instrumentation
 * ```typescript
 * import { Instrumented } from '@package/core';
 *
 * class UserService {
 *   @Instrumented()
 *   async findById(id: string): Promise<User | null> {
 *     // Method execution is automatically traced
 *     // Span name: "UserService.findById"
 *     return this.repository.findById(id);
 *   }
 * }
 * ```
 *
 * @example Class-level instrumentation
 * ```typescript
 * import { InstrumentedClass } from '@package/core';
 *
 * @InstrumentedClass()
 * class OrderService {
 *   // All methods are automatically instrumented
 *   async create(dto: CreateOrderDto): Promise<Order> { ... }
 *   async findById(id: string): Promise<Order | null> { ... }
 *   async update(id: string, dto: UpdateOrderDto): Promise<Order> { ... }
 * }
 * ```
 *
 * @example Custom span name and attributes
 * ```typescript
 * import { Instrumented } from '@package/core';
 * import { SpanKind } from '@opentelemetry/api';
 *
 * class PaymentGateway {
 *   @Instrumented({
 *     name: 'process-payment',
 *     kind: SpanKind.CLIENT,
 *     attributes: {
 *       'payment.provider': 'stripe',
 *       'payment.currency': 'USD'
 *     }
 *   })
 *   async processPayment(amount: number): Promise<PaymentResult> {
 *     // Span name: "PaymentGateway.process-payment"
 *     // Includes custom attributes in the span
 *     return this.stripeClient.charge(amount);
 *   }
 * }
 * ```
 *
 * @example Including method arguments in span
 * ```typescript
 * import { Instrumented } from '@package/core';
 *
 * class SearchService {
 *   @Instrumented({ includeArgs: true })
 *   async search(query: string, filters: SearchFilters): Promise<Results> {
 *     // Span includes:
 *     // - args.count: 2
 *     // - args.types: "string,object"
 *     return this.searchEngine.query(query, filters);
 *   }
 * }
 * ```
 *
 * @module
 */

import 'reflect-metadata';

import { getTracer, toAttributes } from '../opentelemetry';

import { SpanStatusCode } from '@opentelemetry/api';
import type { Span, SpanKind } from '@opentelemetry/api';

/**
 * Configuration options for the `@Instrumented()` decorator.
 *
 * All options are optional. When not specified, sensible defaults are used
 * based on the method being decorated.
 *
 * @warning **This decorator converts synchronous methods to asynchronous.**
 * - If applied to a sync method, it returns a Promise even if the original doesn't.
 * - Callers must `await` the result or handle the Promise.
 * - Sync errors become rejected Promises instead of thrown exceptions.
 *
 * @example Sync-to-async conversion
 * ```typescript
 * class Example {
 *   // Original sync method
 *   @Instrumented()
 *   computeSync(x: number): number {
 *     return x * 2;
 *   }
 * }
 *
 * // WRONG: This will NOT work as expected
 * const result = example.computeSync(5);  // result is a Promise, not 10
 *
 * // CORRECT: Await the result
 * const result = await example.computeSync(5);  // result is 10
 * ```
 *
 * @see {@link Instrumented} - The decorator function that uses these options
 *
 * @example All options
 * ```typescript
 * const options: IInstrumentedOptions = {
 *   name: 'custom-operation',           // Custom span name
 *   kind: SpanKind.CLIENT,              // Span kind for client calls
 *   attributes: { 'key': 'value' },     // Static attributes
 *   includeArgs: true,                  // Include argument metadata
 *   includeResult: true                 // Include result metadata
 * };
 * ```
 */
export interface IInstrumentedOptions {
  /**
   * Custom span name to use instead of the method name.
   *
   * When not specified, the span name is derived from the method name.
   * The full span name will be `ClassName.{name}` or `ClassName.{methodName}`.
   *
   * @defaultValue The decorated method's name
   *
   * @example
   * ```typescript
   * @Instrumented({ name: 'fetch-user-data' })
   * async getUser(id: string) { ... }
   * // Span name: "UserService.fetch-user-data"
   * ```
   */
  name?: string;

  /**
   * OpenTelemetry span kind indicating the relationship of this span.
   *
   * Common values:
   * - `SpanKind.INTERNAL` (default) - Internal operation within the service
   * - `SpanKind.CLIENT` - Outgoing request to another service
   * - `SpanKind.SERVER` - Incoming request being handled
   * - `SpanKind.PRODUCER` - Message producer (async messaging)
   * - `SpanKind.CONSUMER` - Message consumer (async messaging)
   *
   * @defaultValue SpanKind.INTERNAL (when not specified)
   *
   * @example
   * ```typescript
   * import { SpanKind } from '@opentelemetry/api';
   *
   * @Instrumented({ kind: SpanKind.CLIENT })
   * async callExternalApi() { ... }
   * ```
   */
  kind?: SpanKind;

  /**
   * Additional static attributes to include in the span.
   *
   * These attributes are added to every invocation of the decorated method.
   * Use for metadata that doesn't change between calls.
   *
   * @example
   * ```typescript
   * @Instrumented({
   *   attributes: {
   *     'db.system': 'postgresql',
   *     'db.name': 'users'
   *   }
   * })
   * async queryUsers() { ... }
   * ```
   */
  attributes?: Record<string, string | number | boolean | undefined | null>;

  /**
   * Whether to include argument metadata in span attributes.
   *
   * When `true`, adds:
   * - `args.count`: Number of arguments passed
   * - `args.types`: Comma-separated list of argument types
   *
   * Note: Actual argument values are NOT included to avoid sensitive data leakage.
   *
   * @defaultValue false
   *
   * @example
   * ```typescript
   * @Instrumented({ includeArgs: true })
   * async search(query: string, limit: number) { ... }
   * // Span attributes: { 'args.count': 2, 'args.types': 'string,number' }
   * ```
   */
  includeArgs?: boolean;

  /**
   * Whether to include result metadata in span attributes.
   *
   * When `true`, adds:
   * - `result.type`: The typeof the result
   * - `result.present`: Boolean indicating if result is non-null/undefined
   *
   * Note: Actual result values are NOT included to avoid sensitive data leakage.
   *
   * @defaultValue false
   *
   * @example
   * ```typescript
   * @Instrumented({ includeResult: true })
   * async findUser(id: string): Promise<User | null> { ... }
   * // Span attributes: { 'result.type': 'object', 'result.present': true }
   * ```
   */
  includeResult?: boolean;
}

/**
 * Method decorator for automatic OpenTelemetry instrumentation.
 *
 * Wraps an async method to automatically create an OpenTelemetry span for
 * each invocation. The span captures timing, status, and optional metadata.
 *
 * @warning **This decorator converts synchronous methods to asynchronous.**
 * - If applied to a sync method, it returns a Promise even if the original doesn't.
 * - Callers must `await` the result or handle the Promise.
 * - Sync errors become rejected Promises instead of thrown exceptions.
 *
 * @example Sync-to-async conversion
 * ```typescript
 * class Calculator {
 *   // Original sync method
 *   @Instrumented()
 *   add(a: number, b: number): number {
 *     return a + b;
 *   }
 * }
 *
 * const calc = new Calculator();
 *
 * // WRONG: This will NOT work as expected
 * const sum = calc.add(2, 3);  // sum is a Promise<number>, not 5
 * console.log(sum);            // Prints: Promise { <pending> }
 *
 * // CORRECT: Await the result
 * const sum = await calc.add(2, 3);  // sum is 5
 * console.log(sum);                   // Prints: 5
 *
 * // WRONG: Sync error handling won't work
 * try {
 *   const result = calc.add(null, 3);  // Returns rejected Promise
 * } catch (err) {
 *   // This won't catch the error!
 * }
 *
 * // CORRECT: Handle Promise rejection
 * try {
 *   const result = await calc.add(null, 3);
 * } catch (err) {
 *   // This catches the error
 * }
 * ```
 *
 * ## Decorator Compatibility
 *
 * This decorator supports both:
 * - **TypeScript 5+ Standard Decorators**: Detected by checking if the second
 *   parameter is an object with a `kind` property (a `ClassMethodDecoratorContext`).
 *   The TS5 signature is `(methodFunction, ClassMethodDecoratorContext)`.
 * - **Legacy TypeScript Decorators**: Detected when a `PropertyDescriptor`
 *   is provided as the third parameter. The legacy signature is
 *   `(prototype, propertyKey, descriptor)`.
 *
 * ## Span Lifecycle
 *
 * 1. Span is created and started when the method is called
 * 2. Custom attributes are added (if provided)
 * 3. Argument metadata is added (if `includeArgs: true`)
 * 4. Original method executes
 * 5. Result metadata is added (if `includeResult: true`)
 * 6. Span status is set (OK on success, ERROR on exception)
 * 7. Span is ended
 *
 * @param options - Configuration options for the span. All options are optional.
 * @returns A decorator function compatible with both legacy and standard decorators.
 *
 * @throws Re-throws any error thrown by the decorated method. The error is first
 *   recorded on the span via `span.recordException()` before re-throwing.
 *
 * @see {@link IInstrumentedOptions} - Configuration options
 * @see {@link InstrumentedClass} - Class-level decorator for all methods
 * @see getTracer - Tracer used internally
 * @see toAttributes - Attribute conversion
 *
 * @example Basic usage
 * ```typescript
 * class UserService {
 *   @Instrumented()
 *   async findById(id: string): Promise<User | null> {
 *     return this.repository.findById(id);
 *   }
 * }
 * ```
 *
 * @example With custom span name
 * ```typescript
 * class UserService {
 *   @Instrumented({ name: 'fetch-user' })
 *   async findById(id: string): Promise<User | null> {
 *     // Span name: "UserService.fetch-user"
 *     return this.repository.findById(id);
 *   }
 * }
 * ```
 *
 * @example With SpanKind for external calls
 * ```typescript
 * import { SpanKind } from '@opentelemetry/api';
 *
 * class PaymentService {
 *   @Instrumented({
 *     kind: SpanKind.CLIENT,
 *     attributes: { 'rpc.service': 'PaymentGateway' }
 *   })
 *   async processPayment(amount: number): Promise<Receipt> {
 *     return this.gateway.charge(amount);
 *   }
 * }
 * ```
 *
 * @example Error handling behavior
 * ```typescript
 * class OrderService {
 *   @Instrumented()
 *   async createOrder(dto: CreateOrderDto): Promise<Order> {
 *     // If this throws, the error is:
 *     // 1. Recorded on the span (span.recordException)
 *     // 2. Span status set to ERROR
 *     // 3. Original error re-thrown (not swallowed)
 *     throw new ValidationError('Invalid order');
 *   }
 * }
 * ```
 */
export function Instrumented(
  options: IInstrumentedOptions = {}
): (
  target: unknown,
  propertyKey: string | symbol | ClassMethodDecoratorContext,
  descriptor?: PropertyDescriptor
) => void | PropertyDescriptor {
  return function instrumentMethod(
    _target: unknown,
    propertyKeyOrContext: string | symbol | ClassMethodDecoratorContext,
    descriptor?: PropertyDescriptor
  ): void | PropertyDescriptor {
    // TypeScript 5+ standard decorators: (methodFunction, ClassMethodDecoratorContext)
    // Detect by checking if propertyKeyOrContext is an object with 'kind' property
    if (
      propertyKeyOrContext &&
      typeof propertyKeyOrContext === 'object' &&
      'kind' in propertyKeyOrContext
    ) {
      handleStandardDecorator(propertyKeyOrContext as ClassMethodDecoratorContext, options);
      return;
    }

    // Legacy decorators (TypeScript 4 and earlier): (prototype, propertyKey, descriptor)
    if (descriptor) {
      handleLegacyDecorator(descriptor, options);
      return descriptor;
    }
  };
}

/**
 * Handles TypeScript 5+ standard decorators (Stage 3 proposal).
 *
 * Standard decorators use the `ClassMethodDecoratorContext` API introduced
 * in TypeScript 5.0. The TS5 method decorator signature is:
 * `(methodFunction: Function, context: ClassMethodDecoratorContext) => Function | void`
 *
 * Detection: We identify a standard decorator call by checking if the second
 * parameter is an object containing a `kind` property (present on all decorator
 * context objects). This distinguishes it from legacy decorators where the
 * second parameter is a string or symbol property key.
 *
 * ## How It Works
 *
 * 1. Extracts method name from context
 * 2. Registers an initializer that runs when the class is instantiated
 * 3. The initializer replaces the method with an instrumented wrapper
 * 4. The wrapper creates spans for each method invocation
 *
 * @param context - The decorator context provided by TypeScript 5+ runtime
 * @param options - Instrumentation options from the decorator call
 *
 * @internal This function is called by {@link Instrumented} and should not
 *   be used directly.
 *
 * @see {@link handleLegacyDecorator} - Handler for legacy decorators
 */
function handleStandardDecorator(
  context: ClassMethodDecoratorContext,
  options: IInstrumentedOptions
): void {
  const methodName = String(context.name);
  const spanName = options.name ?? methodName;

  context.addInitializer(function (this: unknown) {
    const originalMethod = (this as Record<string, unknown>)[methodName] as (
      ...args: unknown[]
    ) => Promise<unknown>;

    (this as Record<string, unknown>)[methodName] = async function (...args: unknown[]) {
      const tracer = getTracer();
      const className = (this as { constructor: { name: string } }).constructor.name;

      const spanOptions: { kind?: SpanKind } = {};
      if (options.kind !== undefined) {
        spanOptions.kind = options.kind;
      }

      return tracer.startActiveSpan(`${className}.${spanName}`, spanOptions, async (span: Span) => {
        try {
          // Add custom attributes
          if (options.attributes) {
            span.setAttributes(toAttributes(options.attributes));
          }

          // Include arguments if requested (always emit both attributes when enabled)
          if (options.includeArgs) {
            span.setAttributes({
              'args.count': args.length,
              'args.types': args.map((arg) => typeof arg).join(',')
            });
          }

          // Execute the method
          const result = await originalMethod.apply(this, args);

          // Include result if requested (always emit both attributes when enabled)
          if (options.includeResult) {
            const resultType = result === null ? 'null' : typeof result;
            span.setAttributes({
              'result.type': resultType,
              'result.present': result != null
            });
          }

          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
          throw error;
        } finally {
          span.end();
        }
      });
    };
  });
}

/**
 * Handles legacy TypeScript decorators (experimentalDecorators: true).
 *
 * Legacy decorators receive a `PropertyDescriptor` that can be modified
 * to wrap the original method. This is the decorator format used in
 * TypeScript 4 and earlier, and still supported in TypeScript 5+ when
 * `experimentalDecorators: true` is set in tsconfig.
 *
 * ## How It Works
 *
 * 1. Extracts the original method from the descriptor
 * 2. Replaces `descriptor.value` with an instrumented wrapper
 * 3. The wrapper creates spans for each method invocation
 *
 * @param descriptor - The property descriptor containing the method to wrap
 * @param options - Instrumentation options from the decorator call
 *
 * @internal This function is called by {@link Instrumented} and
 *   {@link InstrumentedClass}, and should not be used directly.
 *
 * @see {@link handleStandardDecorator} - Handler for standard decorators
 */
function handleLegacyDecorator(
  descriptor: PropertyDescriptor,
  options: IInstrumentedOptions
): void {
  const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
  const methodName = originalMethod.name || 'anonymous';
  const spanName = options.name ?? methodName;

  (descriptor as { value: (...args: unknown[]) => Promise<unknown> }).value = async function (
    this: unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    const tracer = getTracer();
    const className = (this as { constructor?: { name: string } })?.constructor?.name ?? 'Unknown';

    const spanOptions: { kind?: SpanKind } = {};
    if (options.kind !== undefined) {
      spanOptions.kind = options.kind;
    }

    return tracer.startActiveSpan(`${className}.${spanName}`, spanOptions, async (span: Span) => {
      try {
        // Add custom attributes
        if (options.attributes) {
          span.setAttributes(toAttributes(options.attributes));
        }

        // Include arguments if requested (always emit both attributes when enabled)
        if (options.includeArgs) {
          span.setAttributes({
            'args.count': args.length,
            'args.types': args.map((arg) => typeof arg).join(',')
          });
        }

        // Execute the method
        const result = await originalMethod.apply(this, args);

        // Include result if requested (always emit both attributes when enabled)
        if (options.includeResult) {
          const resultType = result === null ? 'null' : typeof result;
          span.setAttributes({
            'result.type': resultType,
            'result.present': result != null
          });
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  };
}

/**
 * Class decorator to automatically instrument all methods in a class.
 *
 * Applies the `@Instrumented()` decorator to every method in the class
 * prototype, creating spans for all method calls with consistent options.
 *
 * ## What Gets Instrumented
 *
 * - All methods defined on the class prototype
 * - Inherited methods are NOT instrumented (apply decorator to base class)
 * - The constructor is excluded
 *
 * ## Use Cases
 *
 * - Service classes where all methods should be traced
 * - Repository classes for database operation visibility
 * - Gateway classes for external API call tracing
 *
 * ## Decorator Compatibility
 *
 * This decorator works with both legacy and standard TypeScript decorators.
 * It iterates over the class prototype and wraps each method using the
 * legacy decorator pattern internally.
 *
 * @param classOptions - Options applied to all methods. Individual methods
 *   cannot have custom options when using this decorator. For per-method
 *   configuration, use `@Instrumented()` on individual methods instead.
 * @returns A class decorator function
 *
 * @throws Re-throws any error thrown by decorated methods. Errors are recorded
 *   on the span before re-throwing.
 *
 * @see {@link Instrumented} - Method-level decorator for individual methods
 * @see {@link IInstrumentedOptions} - Configuration options
 *
 * @example Basic class instrumentation
 * ```typescript
 * @InstrumentedClass()
 * class UserRepository {
 *   async findById(id: string): Promise<User | null> { ... }
 *   async findAll(): Promise<User[]> { ... }
 *   async create(dto: CreateUserDto): Promise<User> { ... }
 *   async update(id: string, dto: UpdateUserDto): Promise<User> { ... }
 *   async delete(id: string): Promise<void> { ... }
 *   // All 5 methods are automatically instrumented
 * }
 * ```
 *
 * @example With shared options
 * ```typescript
 * import { SpanKind } from '@opentelemetry/api';
 *
 * @InstrumentedClass({
 *   kind: SpanKind.CLIENT,
 *   attributes: { 'db.system': 'postgresql' }
 * })
 * class DatabaseRepository {
 *   // All methods get SpanKind.CLIENT and the db.system attribute
 *   async query(sql: string): Promise<Row[]> { ... }
 *   async execute(sql: string): Promise<number> { ... }
 * }
 * ```
 *
 * @example Mixing class and method decorators
 * ```typescript
 * @InstrumentedClass()
 * class MixedService {
 *   // Uses class-level default options
 *   async normalMethod(): Promise<void> { ... }
 *
 *   // Note: Method decorator would override, but this is not recommended
 *   // Instead, use @Instrumented() only on the methods that need customization
 * }
 *
 * // Preferred approach for mixed options:
 * class BetterService {
 *   @Instrumented()
 *   async normalMethod(): Promise<void> { ... }
 *
 *   @Instrumented({ kind: SpanKind.CLIENT })
 *   async externalCall(): Promise<void> { ... }
 * }
 * ```
 */
export function InstrumentedClass(
  classOptions: IInstrumentedOptions = {}
): (target: new () => unknown | undefined, _context?: ClassDecoratorContext) => void {
  return function classDecorator(
    target: new () => unknown | undefined,
    _context?: ClassDecoratorContext
  ): void {
    const prototype = (target as new () => unknown).prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    for (const name of methodNames) {
      if (name === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor && typeof descriptor.value === 'function') {
        handleLegacyDecorator(descriptor, classOptions);
        Object.defineProperty(prototype, name, descriptor);
      }
    }
  };
}
