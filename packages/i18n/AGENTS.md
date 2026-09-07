# @package/i18n

Lightweight internationalization (i18n) utilities with template-based translation, parameter interpolation, and security-hardened implementation.

## Purpose

This package provides a minimal i18n solution for the Node Monorepo Boilerplate. It supports loading translation dictionaries per locale, retrieving translated strings by key, and interpolating dynamic parameters using `{{placeholder}}` syntax.

**Security Features:**

- Prototype pollution protection via `Object.create(null)`
- Immutable translations via `Object.freeze()`
- Three-tier fallback chain (locale → en → raw key)

**Quality Assurance:**


## Structure

```text
src/
└── index.ts          # All exports: t, useTranslation, loadTranslations, i18n
```

## Usage

```typescript
import { loadTranslations, t, useTranslation } from '@package/i18n';

// Load translations for a locale
loadTranslations('en', {
  greeting: 'Hello, {{name}}!',
  'messages.count': 'You have {{count}} messages.'
});

// Direct translation
const greeting = t('greeting', { name: 'Alice' }); // "Hello, Alice!"

// Hook-style usage (returns locale-bound translator)
const { t: translate, locale } = useTranslation('en');
const message = translate('messages.count', { count: 5 }); // "You have 5 messages."
```

## Key Exports

### Types

- `TranslationParams` - Record type for interpolation parameters (`string | number | boolean | null | undefined`)

### Functions

- `loadTranslations(locale, translations)` - Load/merge translations for a locale
- `t(key, params?, locale?)` - Translate a key with optional parameters
- `useTranslation(locale?)` - Returns `{ t, locale }` bound to a specific locale

### Namespace

- `i18n` - Bundled namespace containing `t`, `useTranslation`, and `loadTranslations`

## Security

### Prototype Pollution Protection

Uses `Object.create(null)` for the translation store to prevent prototype pollution attacks via malicious locale keys:

```typescript
const translationStore: Record<string, Record<string, string>> = Object.create(null);
```

This prevents attacks using special keys like `__proto__`, `constructor`, or `prototype`.

**Verified:** All 5 security tests passing, confirming no pollution of `Object.prototype`.

### Immutability

Translations are frozen after loading to prevent runtime mutations:

```typescript
export function loadTranslations(locale: string, translations: Record<string, string>): void {
  translationStore[locale] = Object.freeze({
    ...(translationStore[locale] ?? {}),
    ...translations
  });
}
```

**Benefits:**

- Thread-safe for concurrent access
- Prevents accidental modifications
- Clear contract: translations are read-only after load

### Fallback Chain

Three-tier fallback prevents missing translation errors:

1. Requested locale
2. English ('en') fallback
3. Raw key as last resort

```typescript
const template =
  translationStore[normalizedLocale]?.[key] ??
  (normalizedLocale !== 'en' ? translationStore['en']?.[key] : undefined) ??
  key;
```

## Running Tests

### Running Tests

```bash
# Run tests
pnpm --filter @package/i18n test

# Watch mode
pnpm --filter @package/i18n test:watch
```

## Associated Packages

- `@package/errors` - Uses i18n for localized error messages
- `@package/constants` - Contains locale identifiers

## Documentation References

| **Document**     | **Path**                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Package Index    | [./README.md](./README.md)                                                                                             |
| Dependency Graph | [../../.agents/docs/reference/packages/dependency-graph.md](../../.agents/docs/reference/packages/dependency-graph.md) |
