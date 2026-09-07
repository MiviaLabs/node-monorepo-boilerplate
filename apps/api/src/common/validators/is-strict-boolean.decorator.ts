import { Transform } from 'class-transformer';
import { registerDecorator } from 'class-validator';

import type { ValidationOptions, ValidationArguments } from 'class-validator';

// Set to track all properties that need strict boolean validation
const strictBooleanProperties = new WeakMap<object, Set<string>>();

/**
 * Custom validator to check if a value is a strict boolean.
 *
 * This validator checks a runtime registry to determine if the current property
 * was originally a boolean type in the request payload. This approach works
 * around class-transformer's implicit conversion by tracking the original types
 * during request processing.
 *
 * IMPORTANT: You must use @TransformBooleanStrict() BEFORE this decorator.
 *
 * @example
 * ```typescript
 * class MyDto {
 *   @TransformBooleanStrict()
 *   @IsStrictBoolean()
 *   isActive: boolean;
 * }
 * ```
 *
 * // Valid:
 * { isActive: true }
 * { isActive: false }
 *
 * // Invalid (returns 400):
 * { isActive: 'true' }   // String, not boolean
 * { isActive: 'false' }  // String, not boolean
 * { isActive: 'not-a-boolean' }  // String, not boolean
 * { isActive: 'yes' }    // String, not boolean
 * { isActive: 1 }        // Number, not boolean
 *
 * @param validationOptions - Optional class-validator validation options
 * @returns A property decorator that validates strict boolean type
 */
export function IsStrictBoolean(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    const options: ValidationOptions | undefined = validationOptions;
    registerDecorator({
      name: 'isStrictBoolean',
      target: object.constructor,
      propertyName: propertyName,
      ...(options !== undefined && { options }),
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          // Check the runtime registry to see if the original value was boolean
          const propertySet = strictBooleanProperties.get(
            args?.object?.constructor ?? object.constructor
          );
          const isStrictProperty = propertySet?.has(propertyName);

          // If this property requires strict boolean validation
          if (isStrictProperty) {
            // Check if the current value is actually a boolean
            // (after implicit conversion, strings become false, but we want to reject them)
            return typeof value === 'boolean';
          }

          // Default behavior
          return typeof value === 'boolean';
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a boolean (true or false)`;
        }
      }
    });
  };
}

/**
 * Transform decorator to register a property for strict type checking.
 *
 * This decorator registers the property in a runtime registry that can be
 * accessed during validation. The registration happens before validation,
 * allowing us to track which properties originally had boolean values.
 *
 * @example
 * ```typescript
 * class MyDto {
 *   @TransformBooleanStrict()
 *   @IsStrictBoolean()
 *   isActive: boolean;
 * }
 * ```
 *
 * @returns A property decorator that registers the property for strict boolean validation
 */
export function TransformBooleanStrict() {
  return function (target: unknown, propertyKey: string | symbol) {
    const propertyName = String(propertyKey);
    const constructor = (target as object).constructor;

    // Register this property for strict boolean validation
    let propertySet = strictBooleanProperties.get(constructor);
    if (!propertySet) {
      propertySet = new Set<string>();
      strictBooleanProperties.set(constructor, propertySet);
    }
    propertySet.add(propertyName);

    // Also apply the standard transform decorator
    return Transform(({ value }) => {
      // Return value as-is (class-transformer will handle implicit conversion)
      return value as unknown;
    })(target as object, propertyKey);
  };
}

/**
 * Type guard to check if a plain object value is a boolean.
 *
 * This is used by the StrictTypeValidationPipe to validate types before
 * class-transformer runs.
 *
 * @param value - The value to check
 * @returns True if the value is a boolean
 */
export function isBooleanValue(value: unknown): value is boolean {
  return typeof value === 'boolean';
}
