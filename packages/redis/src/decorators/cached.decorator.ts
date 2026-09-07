/**
 * @Cached() Decorator
 *
 * Caches method results in Redis automatically.
 *
 * @example
 * ```typescript
 * class MyService {
 *   @Cached({ ttl: 300 })
 *   async getUser(id: string): Promise<User> {
 *     return await db.users.findUnique({ where: { id } });
 *   }
 *
 *   @Cached({ ttl: 60, keyPrefix: 'user:email' })
 *   async getUserByEmail(email: string): Promise<User> {
 *     return await db.users.findUnique({ where: { email } });
 *   }
 * }
 * ```
 */

import 'reflect-metadata';

/**
 * Cache decorator options
 */
export interface CachedOptions {
  /** Time to live in seconds */
  ttl?: number;
  /** Custom key prefix (defaults to 'cache') */
  keyPrefix?: string;
  /** Custom key generator function */
  keyGenerator?: (...args: unknown[]) => string;
  /** Whether to cache errors */
  cacheErrors?: boolean;
  /** Cache key suffix */
  keySuffix?: string;
}

/**
 * Method result decorator for automatic Redis caching
 *
 * Supports both legacy TypeScript decorators and TypeScript 5+ standard decorators
 *
 * @param options - Cache configuration options
 * @returns Method decorator that caches the method's return value
 */
export function Cached(
  options: CachedOptions = {}
): (
  target: unknown,
  propertyKey: string | symbol | ClassMethodDecoratorContext,
  descriptor?: PropertyDescriptor
) => void | PropertyDescriptor {
  return function cacheMethod(
    target: unknown,
    propertyKeyOrContext: string | symbol | ClassMethodDecoratorContext,
    descriptor?: PropertyDescriptor
  ): void | PropertyDescriptor {
    // TypeScript 5+ standard decorators
    if (target === undefined && propertyKeyOrContext && typeof propertyKeyOrContext === 'object') {
      handleStandardDecorator(propertyKeyOrContext as ClassMethodDecoratorContext, options);
      return;
    }

    // Legacy decorators (TypeScript 4 and earlier)
    if (descriptor) {
      handleLegacyDecorator(descriptor, options);
      return descriptor;
    }
  };
}

/**
 * Handle TypeScript 5+ standard decorators
 *
 * @param context - The class method decorator context
 * @param options - Cache configuration options
 */
function handleStandardDecorator(
  context: ClassMethodDecoratorContext,
  options: CachedOptions
): void {
  const methodName = String(context.name);
  const ttl = options.ttl ?? 300; // Default 5 minutes
  const keyPrefix = options.keyPrefix ?? 'cache';

  context.addInitializer(function (this: unknown) {
    const originalMethod = (this as Record<string, unknown>)[methodName] as (
      ...args: unknown[]
    ) => Promise<unknown>;

    (this as Record<string, unknown>)[methodName] = async function (...args: unknown[]) {
      const cacheKey = generateCacheKey(keyPrefix, methodName, args, options);

      // Try to get from cache
      try {
        const cached = await getCachedValue(cacheKey);
        if (cached !== null) {
          return cached;
        }
      } catch {
        // Cache miss or error, continue to execute method
      }

      // Execute method
      const result = await originalMethod.apply(this, args);

      // Cache the result
      try {
        await setCachedValue(cacheKey, result, ttl);
      } catch {
        // Cache set failed, ignore
      }

      return result;
    };
  });
}

/**
 * Handle legacy TypeScript decorators
 *
 * @param descriptor - The property descriptor of the method
 * @param options - Cache configuration options
 */
function handleLegacyDecorator(descriptor: PropertyDescriptor, options: CachedOptions): void {
  const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;
  const methodName = (descriptor as { name?: string }).name ?? 'anonymous';
  const ttl = options.ttl ?? 300; // Default 5 minutes
  const keyPrefix = options.keyPrefix ?? 'cache';

  (descriptor as { value: (...args: unknown[]) => Promise<unknown> }).value = async function (
    this: unknown,
    ...args: unknown[]
  ): Promise<unknown> {
    const cacheKey = generateCacheKey(keyPrefix, methodName, args, options);

    // Try to get from cache
    try {
      const cached = await getCachedValue(cacheKey);
      if (cached !== null) {
        return cached;
      }
    } catch {
      // Cache miss or error, continue to execute method
    }

    // Execute method
    const result = await originalMethod.apply(this, args);

    // Cache the result
    try {
      await setCachedValue(cacheKey, result, ttl);
    } catch {
      // Cache set failed, ignore
    }

    return result;
  };
}

/**
 * Generate cache key from method name and arguments
 *
 * @param prefix - Cache key prefix
 * @param methodName - Name of the cached method
 * @param args - Method arguments to include in the key
 * @param options - Cache configuration options
 * @returns Generated cache key string
 */
function generateCacheKey(
  prefix: string,
  methodName: string,
  args: unknown[],
  options: CachedOptions
): string {
  if (options.keyGenerator) {
    return options.keyGenerator(...args);
  }

  const argsKey = args
    .map((arg) => {
      if (arg === null || arg === undefined) return 'nil';
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'number') return arg.toString();
      if (typeof arg === 'boolean') return arg.toString();
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    })
    .join(':');

  const suffix = options.keySuffix ? `:${options.keySuffix}` : '';
  return `${prefix}:${methodName}:${argsKey}${suffix}`;
}

/**
 * Get cached value from Redis
 *
 * Lazy imports to avoid circular dependency.
 *
 * @param key - Cache key to retrieve
 * @returns Promise resolving to the cached value or null if not found
 */
async function getCachedValue(key: string): Promise<unknown> {
  try {
    const { getRedisClient } = await import('../client');
    const client = getRedisClient();
    const value = await client.get(key);
    if (value === null) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch {
    return null;
  }
}

/**
 * Set cached value in Redis
 *
 * @param key - Cache key to set
 * @param value - Value to cache
 * @param ttl - Time to live in seconds
 * @returns Promise that resolves when the value is cached
 */
async function setCachedValue(key: string, value: unknown, ttl: number): Promise<void> {
  const { getRedisClient } = await import('../client');
  const client = getRedisClient();
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  await client.setex(key, ttl, serialized);
}
