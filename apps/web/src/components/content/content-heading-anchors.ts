const HEADING_ANCHOR_PATTERN = /\s+\{#([a-z0-9-]+)\}$/i;

export const CONTENT_TOC_SENTINEL = '[[toc]]';

export function slugifyHeadingAnchor(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');

  return normalized || 'section';
}

export function extractHeadingAnchor(text: string) {
  const match = HEADING_ANCHOR_PATTERN.exec(text);

  if (!match) {
    return { anchorId: null, text };
  }

  return {
    anchorId: match[1] ?? null,
    text: text.slice(0, match.index).trimEnd()
  };
}

export function appendHeadingAnchor(text: string, anchorId: string | null | undefined) {
  if (!anchorId) {
    return text;
  }

  return `${text} {#${anchorId}}`;
}

export function createUniqueHeadingAnchor(
  preferredAnchor: string | null | undefined,
  text: string,
  usedAnchors: Set<string>
) {
  const base = slugifyHeadingAnchor(preferredAnchor?.trim() || text);
  let candidate = base;
  let suffix = 2;

  while (usedAnchors.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedAnchors.add(candidate);
  return candidate;
}
