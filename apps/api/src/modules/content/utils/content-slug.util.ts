import { Errors } from '@package/errors';

export const CONTENT_SLUG_MAX_LENGTH = 255;

function trimSlugEdgeHyphens(value: string): string {
  return value.replace(/^-+|-+$/g, '');
}

export function normalizeContentSlug(value: string): string {
  const normalized = trimSlugEdgeHyphens(
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
  ).slice(0, CONTENT_SLUG_MAX_LENGTH);

  const trimmed = trimSlugEdgeHyphens(normalized);
  if (trimmed.length === 0) {
    throw Errors.validationvalidationFailedField001({ field: 'slug' });
  }

  return trimmed;
}

export function slugFromTitle(title: string): string {
  return normalizeContentSlug(title);
}
