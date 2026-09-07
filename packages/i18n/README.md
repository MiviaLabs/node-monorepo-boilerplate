# @package/i18n

**Lightweight internationalization (i18n) utilities for the Node Monorepo Boilerplate.**

## What is it?

`@package/i18n` provides a minimal translation system with parameter interpolation and automatic English fallback. It's designed for applications with simple translation needs and minimal runtime dependencies.

## Features

- **Parameter Interpolation** - `{{placeholder}}` syntax for dynamic values
- **React Hook Support** - `useTranslation()` hook for React components
- **Fallback Chain** - Automatic fallback: requested locale → 'en' → raw key
- **Runtime Loading** - Load translations programmatically with `loadTranslations()`
- **Type-Safe Parameters** - TypeScript typing for interpolation parameters
- **Zero Dependencies** - No external runtime dependencies
- **Prototype Pollution Protection** - Hardened translation dictionary storage via `Object.create(null)`
- **Immutable Dictionaries** - Runtime mutations prevented via `Object.freeze()`

### Design Characteristics

- **Explicit Locale Selection** - Locale is explicitly provided or defaults to English ('en')
- **Flexible Pluralization** - Handled cleanly via conditional parameters and interpolations
- **String Keys** - Dynamic key lookup supporting nested dot notation
- **Dynamic Translation Loading** - Translations are loaded programmatically by the consuming application
- **Intl Standards Integration** - Designed to pair seamlessly with standard JavaScript `Intl` APIs for date and currency formatting

## Installation

This package is part of the Node Monorepo Boilerplate monorepo.

```bash
pnpm install @package/i18n
```

## File Structure

```text
src/
├── __tests__/
│   └── unit/
│       └── index.unit.test.ts
└── index.ts                     # All exports: t(), loadTranslations(), useTranslation(), i18n
```

**Note**: This package does NOT include built-in translation files. Translations are loaded programmatically at runtime using `loadTranslations()`.

## Quick Start

### 1. Load Translations

```typescript
import { loadTranslations } from '@package/i18n';

// Load translations for multiple locales
loadTranslations('en', {
  'greeting.hello': 'Hello, {{name}}!',
  'common.yes': 'Yes',
  'common.no': 'No'
});

loadTranslations('fr', {
  'greeting.hello': 'Bonjour, {{name}}!',
  'common.yes': 'Oui',
  'common.no': 'Non'
});
```

### 2. Use Translations

```typescript
import { t } from '@package/i18n';

// Basic translation (defaults to 'en')
t('common.yes'); // "Yes"

// With interpolation parameters
t('greeting.hello', { name: 'Alice' }); // "Hello, Alice!"

// Specific locale (3rd parameter)
t('greeting.hello', { name: 'Marie' }, 'fr'); // "Bonjour, Marie!"

// Locale only (no params)
t('common.yes', undefined, 'fr'); // "Oui"
```

### 3. React Hook

```typescript
import { useTranslation } from '@package/i18n';

function MyComponent() {
  const { t, locale } = useTranslation('fr');

  return <div>{t('greeting.hello', { name: 'User' })}</div>;
  // Renders: "Bonjour, User!"
}
```

## API Reference

### `loadTranslations(locale, translations)`

Loads translations for a specific locale. Translations are merged with existing translations for the same locale.

**Parameters:**

- `locale: string` - Locale identifier (e.g., 'en', 'fr', 'ar-SA')
- `translations: Record<string, string>` - Key-value pairs of translations

**Example:**

```typescript
loadTranslations('en', {
  'user.notFound': 'User not found',
  'user.welcome': 'Welcome, {{name}}!'
});

// Later calls merge (don't replace)
loadTranslations('en', {
  'user.goodbye': 'Goodbye, {{name}}!'
});
// Both 'user.notFound' and 'user.goodbye' are now available
```

### `t(key, params?, locale?)`

Translates a key with optional parameter interpolation.

**Fallback Chain:**

1. `translationStore[locale][key]` - Requested locale
2. `translationStore['en'][key]` - English fallback (if locale !== 'en')
3. `key` - Raw key as last resort

**Parameters:**

- `key: string` - Translation key (e.g., 'greeting.hello')
- `params?: Record<string, string | number | boolean | null | undefined>` - Optional interpolation parameters
- `locale?: string` - Target locale (defaults to 'en'). Empty string treated as 'en'.

**Returns:** `string` - Translated string with interpolated parameters

**Examples:**

```typescript
// Basic usage
t('common.yes'); // "Yes"

// With interpolation
t('greeting.hello', { name: 'Alice' }); // "Hello, Alice!"

// With locale
t('greeting.hello', { name: 'Marie' }, 'fr'); // "Bonjour, Marie!"

// Locale only
t('common.yes', undefined, 'fr'); // "Oui"

// Missing translation (falls back to English)
t('common.yes', undefined, 'de'); // "Yes" (German not loaded, falls back to English)

// Missing in all locales (returns raw key)
t('missing.key'); // "missing.key"
```

### `useTranslation(locale?)`

React hook that returns a translation function bound to a specific locale.

**Parameters:**

- `locale?: string` - Target locale (defaults to 'en')

**Returns:**

```typescript
{
  t: (key: string, params?: TranslationParams) => string;
  locale: string;
}
```

**Example:**

```typescript
function MyComponent() {
  const { t, locale } = useTranslation('fr');

  return (
    <div>
      <p>Current locale: {locale}</p>
      <p>{t('greeting.hello', { name: 'User' })}</p>
    </div>
  );
}
```

### `i18n` Namespace

Convenience export bundling all functions.

```typescript
import { i18n } from '@package/i18n';

i18n.loadTranslations('en', { ... });
i18n.t('key');
i18n.useTranslation('fr');
```

## Loading Translations

### At Application Startup

```typescript
import { loadTranslations } from '@package/i18n';

// From external API
const translations = await fetch('/api/translations').then((r) => r.json());
Object.entries(translations).forEach(([locale, keys]) => {
  loadTranslations(locale, keys);
});

// From static imports (if you have JSON files in your app)
import en from './locales/en.json';
import fr from './locales/fr.json';

loadTranslations('en', en);
loadTranslations('fr', fr);
```

### In NestJS Application

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { loadTranslations } from '@package/i18n';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Load translations before listening
  loadTranslations('en', {
    'error.notFound': 'Resource not found',
    'error.unauthorized': 'Unauthorized access'
  });

  loadTranslations('fr', {
    'error.notFound': 'Ressource non trouvée',
    'error.unauthorized': 'Accès non autorisé'
  });

  await app.listen(3000);
}
bootstrap();
```

### In Next.js Application

```typescript
// pages/_app.tsx
import { useEffect } from 'react';
import { loadTranslations } from '@package/i18n';
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Load translations on client mount
    loadTranslations('en', {
      'common.welcome': 'Welcome!',
      'common.loading': 'Loading...'
    });

    loadTranslations('fr', {
      'common.welcome': 'Bienvenue!',
      'common.loading': 'Chargement...'
    });
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
```

## Best Practices

### 1. Key Organization

Use dot notation for nested keys:

```typescript
loadTranslations('en', {
  'user.profile.title': 'User Profile',
  'user.profile.edit': 'Edit Profile',
  'user.settings.privacy': 'Privacy Settings'
});
```

### 2. Parameter Naming

Use descriptive parameter names with `{{}}` syntax:

```typescript
loadTranslations('en', {
  'notification.count': 'You have {{count}} new notification{{plural}}',
  'user.greeting': 'Hello, {{firstName}} {{lastName}}!'
});

t('notification.count', { count: 5, plural: 's' });
// "You have 5 new notifications"
```

### 3. Pluralization Workaround

Since pluralization isn't built-in, use conditional parameters:

```typescript
loadTranslations('en', {
  'message.count': '{{count}} message{{plural}}'
});

// Helper function
function pluralSuffix(count: number): string {
  return count === 1 ? '' : 's';
}

t('message.count', { count: 1, plural: pluralSuffix(1) }); // "1 message"
t('message.count', { count: 5, plural: pluralSuffix(5) }); // "5 messages"
```

### 4. Fallback Strategy

Always provide English translations as fallback:

```typescript
// Always load English first
loadTranslations('en', { ... });

// Then load other locales
loadTranslations('fr', { ... });
loadTranslations('ar-SA', { ... });
```

### 5. Type Safety for Parameters

Define parameter types for better autocomplete:

```typescript
interface GreetingParams {
  name: string;
  time: 'morning' | 'afternoon' | 'evening';
}

loadTranslations('en', {
  'greeting.timeOfDay': 'Good {{time}}, {{name}}!'
});

function greet(params: GreetingParams) {
  return t('greeting.timeOfDay', params);
}
```

## Type Safety

This package provides type safety for **interpolation parameters**, not translation keys.

```typescript
// ✅ Type-safe: params object is typed
t('greeting.hello', { name: 'Alice' }); // { name: string }

// ❌ Not type-safe: key is plain string
t('greeting.helo'); // Typo not caught by TypeScript
```

For compile-time key validation, consider using a tool like [i18next](https://www.i18next.com/) with TypeScript key generation.

## When to Use This Package

### Good Fit

- Simple translation needs
- Small number of locales (2-5)
- Minimal runtime dependencies
- Basic parameter interpolation
- Lightweight bundle size is priority

### Consider Alternatives

If you need:

- **Pluralization** → Use [i18next](https://www.i18next.com/)
- **Automatic locale detection** → Use [next-i18next](https://github.com/i18next/next-i18next)
- **Type-safe keys** → Use [typesafe-i18n](https://github.com/ivanhofer/typesafe-i18n)
- **Date/number formatting** → Use built-in [Intl API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)

## Running Tests

Run tests:

```bash
pnpm --filter @package/i18n test
```

## Security

### Prototype Pollution Protection

This package uses `Object.create(null)` for the translation store to prevent prototype pollution attacks via malicious locale keys like `__proto__`, `constructor`, or `prototype`.

```typescript
// These are safely handled and do not pollute Object.prototype
loadTranslations('__proto__', { polluted: 'value' });
loadTranslations('constructor', { polluted: 'value' });
loadTranslations('prototype', { polluted: 'value' });
```

All security tests passing (5/5) ✅

## Associated Packages

- [`@package/errors`](../errors/) - Error handling with i18n support
- [`@package/types`](../types/) - Shared TypeScript types
- [`@package/constants`](../constants/) - Shared constants

## Links

- [Main Repository](../../README.md)
