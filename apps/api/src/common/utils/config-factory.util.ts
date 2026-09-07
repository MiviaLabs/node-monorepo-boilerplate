import type { ConfigService } from '@nestjs/config';

/**
 * Resolve ConfigService from variadic async module factory args.
 *
 * Some external dynamic module signatures require useFactory to accept
 * (...args: unknown[]), so we centralize the cast in one place.
 *
 * @param args - The variadic arguments passed to the factory function
 * @returns The ConfigService instance extracted from args
 */
export function configServiceFromFactoryArgs(args: unknown[]): ConfigService {
  return args[0] as ConfigService;
}
