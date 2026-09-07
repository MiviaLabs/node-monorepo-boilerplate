/**
 * Base types for value objects
 *
 * This module provides the foundational interfaces for value objects following
 * Domain-Driven Design (DDD) principles. Value objects are immutable objects
 * that represent a descriptive aspect of the domain with no conceptual identity.
 * They are defined by their attributes rather than a unique identifier.
 *
 * @module domain/value-object.types
 */

/**
 * Base interface for value objects.
 *
 * Value objects are immutable objects that represent a descriptive aspect of the
 * domain. Unlike entities, value objects have no conceptual identity - they are
 * defined entirely by their attributes. Two value objects with the same attributes
 * are considered equal.
 *
 * Key characteristics:
 * - **Immutability**: Value objects cannot be changed after creation
 * - **Equality by value**: Two value objects are equal if their values are equal
 * - **Self-validation**: Value objects validate their invariants at construction
 * - **Side-effect free**: Methods on value objects don't modify state
 *
 * @template T - The type of the wrapped value. Can be a primitive (string, number)
 *               or a complex object for composite value objects.
 *
 * @example
 * ```typescript
 * // Implement a simple Email value object
 * class EmailVO implements IValueObject<string> {
 *   readonly value: string;
 *
 *   private constructor(email: string) {
 *     this.value = email.toLowerCase().trim();
 *   }
 *
 *   static create(email: string): EmailVO {
 *     if (!email.includes('@')) {
 *       throw new Error('Invalid email format');
 *     }
 *     return new EmailVO(email);
 *   }
 *
 *   equals(other: IValueObject<string>): boolean {
 *     return this.value === other.value;
 *   }
 * }
 *
 * // Usage
 * const email1 = EmailVO.create('user@example.com');
 * const email2 = EmailVO.create('USER@EXAMPLE.COM');
 * console.log(email1.equals(email2)); // true (case-insensitive)
 * ```
 *
 * @example
 * ```typescript
 * // Implement a composite value object (Address)
 * interface AddressProps {
 *   readonly street: string;
 *   readonly city: string;
 *   readonly country: string;
 *   readonly postalCode: string;
 * }
 *
 * class AddressVO implements IValueObject<AddressProps> {
 *   readonly value: AddressProps;
 *
 *   constructor(props: AddressProps) {
 *     this.value = Object.freeze(props);
 *   }
 *
 *   equals(other: IValueObject<AddressProps>): boolean {
 *     return (
 *       this.value.street === other.value.street &&
 *       this.value.city === other.value.city &&
 *       this.value.country === other.value.country &&
 *       this.value.postalCode === other.value.postalCode
 *     );
 *   }
 *
 *   format(): string {
 *     return `${this.value.street}, ${this.value.city}, ${this.value.country}`;
 *   }
 * }
 * ```
 *
 * @see {@link Email} for email value object type
 * @see {@link Url} for URL value object type
 * @see {@link Money} for monetary value object type
 * @see {@link PhoneNumber} for phone number value object type
 */
export interface IValueObject<T> {
  readonly value: T;
  equals(other: IValueObject<T>): boolean;
}

/**
 * Email value object type.
 *
 * Represents a validated email address. Implementations should normalize
 * the email (lowercase, trim whitespace) and validate format on construction.
 *
 * @example
 * ```typescript
 * // Email value object implementation
 * class EmailVO implements Email {
 *   readonly value: string;
 *
 *   private constructor(email: string) {
 *     this.value = email.toLowerCase().trim();
 *   }
 *
 *   static create(email: string): EmailVO | null {
 *     const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
 *     if (!emailRegex.test(email)) {
 *       return null;
 *     }
 *     return new EmailVO(email);
 *   }
 *
 *   equals(other: IValueObject<string>): boolean {
 *     return this.value === other.value;
 *   }
 *
 *   get domain(): string {
 *     return this.value.split('@')[1] ?? '';
 *   }
 * }
 *
 * // Usage in domain entity
 * interface User {
 *   readonly id: string;
 *   readonly email: Email;
 *   readonly name: string;
 * }
 * ```
 *
 * @see {@link IValueObject} for the base value object interface
 */
export type Email = IValueObject<string>;

/**
 * URL value object type.
 *
 * Represents a validated URL. Implementations should validate the URL format
 * and optionally restrict to specific protocols (https, http).
 *
 * Note: This type is named `Url` (not `URL`) to avoid shadowing the global
 * `URL` constructor, allowing implementations to use the native URL API
 * without qualification.
 *
 * @example
 * ```typescript
 * // URL value object implementation
 * class UrlVO implements Url {
 *   readonly value: string;
 *
 *   private constructor(url: string) {
 *     this.value = url;
 *   }
 *
 *   static create(url: string): UrlVO | null {
 *     try {
 *       const parsed = new URL(url);
 *       if (!['http:', 'https:'].includes(parsed.protocol)) {
 *         return null;
 *       }
 *       return new UrlVO(parsed.href);
 *     } catch {
 *       return null;
 *     }
 *   }
 *
 *   equals(other: IValueObject<string>): boolean {
 *     return this.value === other.value;
 *   }
 *
 *   get hostname(): string {
 *     return new URL(this.value).hostname;
 *   }
 * }
 *
 * // Usage
 * const websiteUrl = UrlVO.create('https://example.com/page');
 * const invalidUrl = UrlVO.create('not-a-url'); // null
 * ```
 *
 * @see {@link IValueObject} for the base value object interface
 */
export type Url = IValueObject<string>;

/**
 * Phone number value object type.
 *
 * Represents a validated phone number. Implementations should normalize
 * the format (remove spaces, dashes) and validate the structure. Consider
 * using E.164 format for international compatibility.
 *
 * @example
 * ```typescript
 * // Phone number value object with E.164 format
 * class PhoneNumberVO implements PhoneNumber {
 *   readonly value: string;
 *
 *   private constructor(phone: string) {
 *     // Store in E.164 format: +1234567890
 *     this.value = phone;
 *   }
 *
 *   static create(phone: string, countryCode: string = '+1'): PhoneNumberVO | null {
 *     // Remove all non-digit characters
 *     const digits = phone.replace(/\D/g, '');
 *
 *     if (digits.length < 10 || digits.length > 15) {
 *       return null;
 *     }
 *
 *     // Add country code if not present
 *     const normalized = digits.startsWith('1')
 *       ? `+${digits}`
 *       : `${countryCode}${digits}`;
 *
 *     return new PhoneNumberVO(normalized);
 *   }
 *
 *   equals(other: IValueObject<string>): boolean {
 *     return this.value === other.value;
 *   }
 *
 *   format(): string {
 *     // Format as (xxx) xxx-xxxx for US numbers
 *     const digits = this.value.replace(/\D/g, '');
 *     if (digits.length === 11 && digits.startsWith('1')) {
 *       return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
 *     }
 *     return this.value;
 *   }
 * }
 *
 * // Usage
 * const phone = PhoneNumberVO.create('555-123-4567');
 * console.log(phone?.format()); // "(555) 123-4567"
 * ```
 *
 * @see {@link IValueObject} for the base value object interface
 */
export type PhoneNumber = IValueObject<string>;

/**
 * Monetary amount value object type.
 *
 * Represents a monetary value with amount and currency. This is a composite
 * value object where the value is an object containing both the numeric amount
 * and the currency code. Implementations should handle currency-specific
 * formatting and potentially support currency conversion.
 *
 * @example
 * ```typescript
 * // Money value object implementation
 * interface MoneyProps {
 *   readonly amount: number;
 *   readonly currency: string;
 * }
 *
 * class MoneyVO implements Money {
 *   readonly value: MoneyProps;
 *
 *   private constructor(amount: number, currency: string) {
 *     this.value = Object.freeze({ amount, currency: currency.toUpperCase() });
 *   }
 *
 *   static create(amount: number, currency: string): MoneyVO {
 *     if (amount < 0) {
 *       throw new Error('Amount cannot be negative');
 *     }
 *     return new MoneyVO(amount, currency);
 *   }
 *
 *   static zero(currency: string): MoneyVO {
 *     return new MoneyVO(0, currency);
 *   }
 *
 *   equals(other: IValueObject<MoneyProps>): boolean {
 *     return (
 *       this.value.amount === other.value.amount &&
 *       this.value.currency === other.value.currency
 *     );
 *   }
 *
 *   add(other: MoneyVO): MoneyVO {
 *     if (this.value.currency !== other.value.currency) {
 *       throw new Error('Cannot add different currencies');
 *     }
 *     return new MoneyVO(
 *       this.value.amount + other.value.amount,
 *       this.value.currency
 *     );
 *   }
 *
 *   format(locale: string = 'en-US'): string {
 *     return new Intl.NumberFormat(locale, {
 *       style: 'currency',
 *       currency: this.value.currency,
 *     }).format(this.value.amount);
 *   }
 * }
 *
 * // Usage
 * const price = MoneyVO.create(99.99, 'USD');
 * const tax = MoneyVO.create(8.50, 'USD');
 * const total = price.add(tax);
 * console.log(total.format()); // "$108.49"
 * ```
 *
 * @see {@link IValueObject} for the base value object interface
 */
export type Money = IValueObject<{
  readonly amount: number;
  readonly currency: string;
}>;
