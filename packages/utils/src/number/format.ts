/**
 * Number formatting utilities using Intl.NumberFormat
 */

/**
 * Formats a number as a currency string with proper symbol and separators.
 *
 * Uses the native `Intl.NumberFormat` API for locale-aware formatting.
 * The currency symbol, decimal separator, and grouping are determined
 * by the locale.
 *
 * @param amount - The numeric amount to format
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted currency string
 *
 * @example
 * ```ts
 * formatCurrency(1234.56); // '$1,234.56'
 * formatCurrency(1234.56, 'EUR'); // '€1,234.56'
 * formatCurrency(1234.56, 'EUR', 'de-DE'); // '1.234,56 €'
 * formatCurrency(1234.56, 'JPY'); // '¥1,235' (no decimals for JPY)
 * formatCurrency(-99.99); // '-$99.99'
 * formatCurrency(0); // '$0.00'
 * ```
 */
export function formatCurrency(amount: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency
  }).format(amount);
}

/**
 * Formats a decimal value as a percentage string.
 *
 * The input value is treated as a decimal ratio (0.5 = 50%). Uses
 * `Intl.NumberFormat` for locale-aware formatting.
 *
 * **Intelligent decimal handling:**
 * - Whole number percentages show no decimals (0.5 → "50%")
 * - For values ≥ 1%, trailing zeros are stripped ("12.50%" → "12.5%")
 * - For values < 1%, trailing zeros are preserved for precision
 *
 * @param value - The decimal value to format (0.5 = 50%)
 * @param decimals - Maximum decimal places to show (default: 2)
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted percentage string
 *
 * @example
 * ```ts
 * formatPercent(0.5); // '50%'
 * formatPercent(0.1234); // '12.34%'
 * formatPercent(0.125); // '12.5%' (trailing zero stripped)
 * formatPercent(0.001); // '0.10%' (preserved for small values)
 * formatPercent(1.5); // '150%'
 * formatPercent(0.33333, 1); // '33.3%'
 * formatPercent(0.5, 2, 'de-DE'); // '50 %'
 * ```
 */
export function formatPercent(value: number, decimals = 2, locale = 'en-US'): string {
  // Determine if the result is a whole number when expressed as percentage
  const percentValue = value * 100;
  const isWholeNumber =
    Number.isInteger(percentValue) || Math.abs(percentValue % 1) < Number.EPSILON * 100;

  // For whole numbers, don't show decimal places
  const actualDecimals = isWholeNumber ? 0 : decimals;

  const formatted = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: actualDecimals,
    maximumFractionDigits: actualDecimals
  }).format(value);

  // Strip trailing zeros for non-whole numbers when:
  // 1. percent value >= 1%, AND
  // 2. using default decimals (2) or when the value naturally has fewer decimals than requested
  // This handles cases like "12.50%" → "12.5%"
  // But keeps "0.10%" for values < 1% and "12.340%" when explicitly requesting 3 decimals
  if (!isWholeNumber && percentValue >= 1 && decimals <= 2 && formatted.includes('.')) {
    return formatted.replace(/\.?0+%$/, '%');
  }

  return formatted;
}

/**
 * Formats a number with locale-appropriate thousand separators.
 *
 * Preserves all significant decimal places without rounding. Uses
 * `Intl.NumberFormat` for locale-aware grouping and decimal separators.
 *
 * @param value - The number to format
 * @param locale - BCP 47 locale string (default: 'en-US')
 * @returns The formatted number string with thousand separators
 *
 * @example
 * ```ts
 * formatNumber(1234567); // '1,234,567'
 * formatNumber(1234.5678); // '1,234.5678'
 * formatNumber(1234567, 'de-DE'); // '1.234.567'
 * formatNumber(0.123); // '0.123'
 * formatNumber(-9876.54); // '-9,876.54'
 * ```
 */
export function formatNumber(value: number, locale = 'en-US'): string {
  // Convert to string to preserve all decimals
  // Use toFixed with high precision to avoid floating point representation issues
  const str = value.toFixed(20).replace(/\.?0+$/, '');
  const decimalPart = str.includes('.') ? str.split('.')[1] : '';

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimalPart?.length ?? 0
  }).format(value);
}
