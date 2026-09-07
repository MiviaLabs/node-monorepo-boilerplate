/**
 * Slug generation utilities for URL-friendly strings
 */

/**
 * Converts a string to a URL-friendly slug.
 *
 * Transformation rules:
 * - Converts to lowercase
 * - Removes periods and special characters
 * - Replaces spaces and underscores with hyphens
 * - Collapses multiple hyphens into one
 * - Trims leading and trailing hyphens
 *
 * @param str - The string to convert to a slug
 * @returns A URL-friendly slug, or empty string if input contains only
 *   special characters
 *
 * @example
 * ```ts
 * slugify('Hello World'); // 'hello-world'
 * slugify('Hello  World!'); // 'hello-world'
 * slugify('Hello_World'); // 'hello-world'
 * slugify('Mr. Smith'); // 'mr-smith'
 * slugify('!!!'); // ''
 * slugify('Café au lait'); // 'caf-au-lait'
 * ```
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\./g, '') // Remove periods
    .replace(/[^\w\s]+/g, ' ') // Replace other special chars with space
    .replace(/_/g, '-') // Convert underscores to hyphens
    .replace(/\s+/g, '-') // Convert spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens to one
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}

/**
 * Generates a unique slug by appending an incrementing number if the base
 * slug already exists.
 *
 * Checks the base slug against the list of existing slugs. If a collision
 * is found, appends `-1`, `-2`, etc. until a unique slug is found.
 *
 * @param baseSlug - The base slug to make unique (should already be slugified)
 * @param existingSlugs - Array of existing slugs to check against
 * @returns A unique slug that doesn't exist in the provided array
 *
 * @example
 * ```ts
 * generateUniqueSlug('hello', []); // 'hello'
 * generateUniqueSlug('hello', ['hello']); // 'hello-1'
 * generateUniqueSlug('hello', ['hello', 'hello-1']); // 'hello-2'
 * generateUniqueSlug('world', ['hello', 'hello-1']); // 'world'
 * ```
 */
export function generateUniqueSlug(baseSlug: string, existingSlugs: readonly string[]): string {
  let slug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
}

/**
 * Generate a slug from a name, ensuring uniqueness by checking existing slugs
 * This is a convenience function that combines slugify and generateUniqueSlug
 *
 * @param name - The name to convert to a slug
 * @param existingSlugs - List of existing slugs to check for duplicates
 * @returns A unique slug
 *
 * @example
 * ```ts
 * const slug = generateSlug('Acme Corp', ['acme-corp', 'acme-corp-1']);
 * // Returns: 'acme-corp-2'
 * ```
 */
export function generateSlug(name: string, existingSlugs: readonly string[]): string {
  const baseSlug = slugify(name);
  return generateUniqueSlug(baseSlug, existingSlugs);
}
