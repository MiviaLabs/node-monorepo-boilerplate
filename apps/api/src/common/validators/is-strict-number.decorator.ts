import { Transform } from 'class-transformer';
import { registerDecorator } from 'class-validator';

import type { ValidationOptions, ValidationArguments } from 'class-validator';

// Symbol to store original value types on the class instance itself
const ORIGINAL_TYPES_KEY = Symbol('originalTypes');

/**
 * Custom validator to check if a value is a strict number.
 *
 * This validator uses a symbol property on the class instance to track original
 * types before class-transformer's implicit conversion. The TransformNumberStrict
 * decorator stores the original type, and this validator checks if the property
 * was originally a number.
 *
 * IMPORTANT: You must use @TransformNumberStrict() BEFORE this decorator.
 *
 * @example
 * ```typescript
 * class MyDto {
 *   @TransformNumberStrict()
 *   @IsStrictNumber()
 *   count: number;
 * }
 * ```
 *
 * // Valid:
 * { count: 123 }
 * { count: 0 }
 * { count: -456 }
 * { count: 12.34 }
 *
 * // Invalid (returns 400):
 * { count: '123' }    // String, not number
 * { count: 'not-a-number' }    // String, not number
 * { count: '0' }      // String, not number
 *
 * @param validationOptions - Optional class-validator validation options
 * @returns A property decorator that validates strict number type
 */
export function IsStrictNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    const options: ValidationOptions | undefined = validationOptions;
    registerDecorator({
      name: 'isStrictNumber',
      target: object.constructor,
      propertyName: propertyName,
      ...(options !== undefined && { options }),
      validator: {
        validate(value: unknown, args?: ValidationArguments) {
          // Check if the original value was a number (stored by TransformNumberStrict)
          const targetObject = args?.object ?? object;
          const originalTypes = (targetObject as Record<symbol, Record<string, string>>)[
            ORIGINAL_TYPES_KEY
          ] as Record<string, string> | undefined;
          const originalType = originalTypes?.[propertyName];

          // If the original value was NOT a number, fail validation
          if (originalType !== 'number' && originalType !== undefined) {
            return false;
          }

          // Also check current value type for safety (excluding NaN)
          return typeof value === 'number' && !Number.isNaN(value);
        },
        defaultMessage(args: ValidationArguments) {
          const targetObject = args?.object ?? object;
          const originalTypes = (targetObject as Record<symbol, Record<string, string>>)[
            ORIGINAL_TYPES_KEY
          ] as Record<string, string> | undefined;
          const originalType = originalTypes?.[args.property];
          return `${args.property} must be a number, received ${originalType ?? typeof args.value}`;
        }
      }
    });
  };
}

/**
 * Transform decorator to track the original value type before conversion.
 *
 * This decorator captures the original value's type BEFORE class-transformer's
 * implicit conversion runs. It stores this in a symbol property on the class
 * instance that @IsStrictNumber() can access during validation.
 *
 * @example
 * ```typescript
 * class MyDto {
 *   @TransformNumberStrict()
 *   @IsStrictNumber()
 *   count: number;
 * }
 * ```
 *
 * @returns A property decorator that tracks the original value type before conversion
 */
export function TransformNumberStrict(): PropertyDecorator {
  return Transform(({ value, obj }) => {
    // obj is the plain object before transformation
    // value is the current value being transformed (before implicit conversion)

    // Store the original types on the plain object
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const record = obj as Record<symbol, Record<string, string>>;
      record[ORIGINAL_TYPES_KEY] ??= {};

      // Store the original type for all properties
      for (const key in obj) {
        if (
          Object.prototype.hasOwnProperty.call(obj, key) &&
          key !== ORIGINAL_TYPES_KEY.toString()
        ) {
          const type = typeof (obj as Record<string, unknown>)[key];
          // Only store if not already stored
          if (!(key in record[ORIGINAL_TYPES_KEY])) {
            (record[ORIGINAL_TYPES_KEY] as Record<string, string>)[key] = type;
          }
        }
      }
    }

    return value as unknown;
  });
}

export { IsStrictNumber as IsStrictInt };
