# Adding Translations and Locales

This guide explains how to add new translations and locales to the API application.

## Overview

The i18n system uses two translation sources:

```mermaid
flowchart TD
    A[Translation System] --> B[@package/errors Package]
    A --> C[API App Translations]

    B --> D[Error Registry<br/>72 predefined codes]
    B --> E[Locale Files<br/>packages/errors/src/i18n/locales/]
    B --> F[Domains: USER, AUTH, VAL,<br/>DB, BIZ, EXT, FILE, SYS]

    C --> G[API Messages<br/>api.* namespace]
    C --> H[Locale Files<br/>apps/api/src/i18n/messages/]
    C --> I[Categories: success, error,<br/>label, tenant, validation]

    D --> J[Throw via Errors.factory]
    E --> K[Add new error registry locale]
    F --> K

    G --> L[Use via TranslationHelperService]
    H --> M[Add new API translation]
    I --> M
```

## Adding a New Translation Key

### Step 1: Add to All API Locale Files

Add the translation key to all locale files in `apps/api/src/i18n/messages/`:

**`apps/api/src/i18n/messages/en.ts`:**

```typescript
export const en: ErrorTranslations = {
  // ... existing translations
  'api.success.verified': 'Email verified successfully'
};
```

**`apps/api/src/i18n/messages/ar-SA.ts`:**

```typescript
export const arSA: ErrorTranslations = {
  // ... existing translations
  'api.success.verified': 'تم التحقق من البريد الإلكتروني بنجاح'
};
```

### Step 2: Use the Translation

Use the translation in your code:

```typescript
const message = this.translator.translate('api.success.verified');
```

## Adding a New API Locale

### Step 1: Create Translation File

Create a new message file in `apps/api/src/i18n/messages/`:

**`apps/api/src/i18n/messages/es.ts`:**

```typescript
import type { ErrorTranslations } from '@package/errors';

/**
 * Spanish translations
 *
 * Namespaces:
 * - api.success.* - Success messages
 * - api.error.* - Custom error message overrides
 * - api.label.* - UI labels
 */
export const es: ErrorTranslations = {
  // Success messages
  'api.success.created': 'Recurso creado exitosamente',
  'api.success.updated': 'Recurso actualizado exitosamente',
  'api.success.deleted': 'Recurso eliminado exitosamente',
  'api.success.welcome': '¡Bienvenido a nuestra plataforma!',
  'api.success.verified': 'Correo electrónico verificado exitosamente',

  // Info messages
  'api.info.welcome': '¡Bienvenido a nuestra plataforma!',

  // Health check messages
  'api.health.healthy': 'La API está sana',
  'api.health.degraded': 'La API está degradada',

  // Custom error overrides
  VAL_001: 'Valor proporcionado inválido: {field}',

  // API-specific error messages
  'api.error.invalidInput': 'La entrada proporcionada es inválida',
  'api.error.unauthorized': 'No estás autorizado para realizar esta acción',
  'api.error.forbidden': 'El acceso a este recurso está prohibido',
  'api.error.notFound': 'El recurso solicitado no fue encontrado',
  'api.error.conflict': 'Esta acción entra en conflicto con los datos existentes',
  'api.error.rateLimit': 'Demasiadas solicitudes, por favor intenta más tarde',
  'api.error.internal': 'Ocurrió un error interno, por favor intenta de nuevo',

  // UI labels
  'api.label.email': 'Dirección de correo electrónico',
  'api.label.password': 'Contraseña',
  'api.label.name': 'Nombre',
  'api.label.createdAt': 'Creado en',
  'api.label.updatedAt': 'Actualizado en',

  // Tenant-related messages
  'api.tenant.invalid': 'Contexto de tenant inválido proporcionado',
  'api.tenant.notFound': 'Tenant no encontrado',
  'api.tenant.unauthorized': 'Acceso no autorizado al tenant',

  // Validation messages
  'api.validation.email.required': 'El correo electrónico es requerido',
  'api.validation.email.invalid': 'El formato del correo electrónico es inválido',
  'api.validation.password.weak': 'La contraseña es demasiado débil',
  'api.validation.password.required': 'La contraseña es requerida',

  // API-specific error codes (API_001-020)
  API_001: 'Se requiere contexto de tenant para esta solicitud',
  API_002: 'Contexto de tenant inválido proporcionado',
  API_003: 'Versión de API {version} no encontrada',
  API_004: 'Versión de API {version} está obsoleta y será eliminada el {sunsetDate}',
  API_005:
    'Límite de velocidad excedido. Máximo {limit} solicitudes por {window} segundos. Reintenta después de {retryAfter} segundos',
  API_006: 'Validación de solicitud fallida para el campo {field}: {constraint}',
  API_007: 'Parámetro de consulta inválido {param}: {value}',
  API_008: 'Falta el encabezado requerido: {header}',
  API_009: 'Formato de cuerpo de solicitud inválido. Se esperaba {format}',
  API_010: 'La característica {feature} no está habilitada',
  API_011:
    'El servicio {service} no está disponible temporalmente. Reintenta después de {retryAfter} segundos',
  API_012: 'Error de configuración: {setting}',
  API_013: 'Clave de API inválida: {keyId}',
  API_014: 'La clave de API {keyId} expiró el {expiredAt}',
  API_015: 'Entrega de webhook fallida a {webhookUrl} después de {attempt} intentos: {reason}',
  API_016:
    'Solicitud por lotes demasiado grande. Máximo {maxSize} {unit}, se recibió {actualSize} {unit}',
  API_017: 'Tiempo de espera de solicitud agotado después de {timeout} segundos',
  API_018:
    'Parámetros de paginación inválidos. Página: {page}, Tamaño de página: {pageSize}. Tamaño máximo de página: {maxPageSize}',
  API_019: 'Parámetros de clasificación inválidos. Campo: {field}, Dirección: {direction}',
  API_020:
    'Conflicto de modificación concurrente para {resource} {id}. El recurso fue modificado por otro proceso'
} as const;
```

### Step 2: Import and Register

Import and register in `apps/api/src/i18n/config.ts`:

```typescript
import { es } from './messages/es';

export const appTranslationsConfig: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  'ar-SA': arSA as Record<string, string>,
  es: es as Record<string, string>
};
```

### Step 3: Add to Environment Configuration

Add the locale to `API_AVAILABLE_LANGUAGES` in `.env`:

```bash
API_AVAILABLE_LANGUAGES=en,ar-SA,es
```

### Step 4: Optional: Set as Default

Set as default in `.env`:

```bash
API_DEFAULT_LANGUAGE=es
```

### Step 5: Restart the Application

Restart the application - the new locale will be automatically discovered and validated!

## Adding a New Error Registry Locale

To add a new locale to the error registry (for all 72 error codes), see the [Adding Locales guide](../../../../packages/errors/docs/adding-locales.md) in the `@package/errors` package.

## Translation File Template

Use this template when creating new translation files:

```typescript
import type { ErrorTranslations } from '@package/errors';

/**
 * [Language] Translations
 *
 * App-specific translations for the API.
 * Uses namespace prefix: 'api.*'
 */
export const [locale]: ErrorTranslations = {
  // Success messages
  'api.success.created': '[Translation]',
  'api.success.updated': '[Translation]',
  'api.success.deleted': '[Translation]',
  'api.success.welcome': '[Translation]',

  // Info messages
  'api.info.welcome': '[Translation]',

  // Health check messages
  'api.health.healthy': '[Translation]',
  'api.health.degraded': '[Translation]',

  // Custom error overrides (override error registry codes)
  VAL_001: '[Translation with {field}]',

  // API-specific error messages
  'api.error.invalidInput': '[Translation]',
  'api.error.unauthorized': '[Translation]',
  'api.error.forbidden': '[Translation]',
  'api.error.notFound': '[Translation]',
  'api.error.conflict': '[Translation]',
  'api.error.rateLimit': '[Translation]',
  'api.error.internal': '[Translation]',

  // UI labels
  'api.label.email': '[Translation]',
  'api.label.password': '[Translation]',
  'api.label.name': '[Translation]',
  'api.label.createdAt': '[Translation]',
  'api.label.updatedAt': '[Translation]',

  // Tenant-related messages
  'api.tenant.invalid': '[Translation]',
  'api.tenant.notFound': '[Translation]',
  'api.tenant.unauthorized': '[Translation]',

  // Validation messages
  'api.validation.email.required': '[Translation]',
  'api.validation.email.invalid': '[Translation]',
  'api.validation.password.weak': '[Translation]',
  'api.validation.password.required': '[Translation]',

  // API-specific error codes (API_001-020)
  API_001: '[Translation]',
  API_002: '[Translation]',
  API_003: '[Translation]',
  API_004: '[Translation with {version} and {sunsetDate}]',
  API_005: '[Translation with {limit}, {window}, {retryAfter}]',
  API_006: '[Translation with {field} and {constraint}]',
  API_007: '[Translation with {param} and {value}]',
  API_008: '[Translation with {header}]',
  API_009: '[Translation with {format}]',
  API_010: '[Translation with {feature}]',
  API_011: '[Translation with {service} and {retryAfter}]',
  API_012: '[Translation with {setting}]',
  API_013: '[Translation with {keyId}]',
  API_014: '[Translation with {keyId} and {expiredAt}]',
  API_015: '[Translation with {webhookUrl}, {attempt}, {reason}]',
  API_016: '[Translation with {maxSize}, {actualSize}, {unit}]',
  API_017: '[Translation with {timeout}]',
  API_018: '[Translation with {page}, {pageSize}, {maxPageSize}]',
  API_019: '[Translation with {field} and {direction}]',
  API_020: '[Translation with {resource} and {id}]'
} as const;
```

## Overriding Error Registry Translations

You can override error registry translations by using the same error code in your API translations:

```typescript
// In apps/api/src/i18n/messages/en.ts
export const en: ErrorTranslations = {
  // Override VAL_001 from error registry
  VAL_001: 'Custom message: Invalid value for {field}'
  // ... other translations
};
```

This allows you to customize error messages for your specific application while keeping the same error codes.

## Parameter Placeholders

All parameters use `{parameterName}` syntax and must match the error definition or usage:

```typescript
// Error definition has parameter: userId
USER_001: 'User with ID {userId} not found'; // ✅ Correct

// Usage
throw Errors.useruserWithId001({ userId: '123' }); // ✅ Correct

// Wrong parameter name
USER_001: 'User not found'; // ❌ Missing {userId}
USER_001: 'User with ID {id} not found'; // ❌ Wrong parameter name
```

## Translation Guidelines

### Parameter Placeholders

1. Use `{parameterName}` syntax for interpolation
2. Parameter names must match the error definition
3. Provide meaningful parameter names (e.g., `{field}` not `{x}`)

### Cultural Considerations

- **Formal vs Informal**: Some languages have formal/informal address (e.g., Spanish "usted" vs "tú")
- **Date/Number Formats**: Consider locale-specific formatting
- **Text Direction**: RTL languages (Arabic) require proper CSS support
- **Character Encoding**: Ensure UTF-8 encoding for all locale files

### Gender and Pluralization

Some languages require gender or pluralization handling. Currently, the package uses simple string interpolation. For complex grammatical rules:

1. Provide multiple error codes for different genders/plurals
2. Include gender/plurality as parameters
3. Use conditional logic in your error handler

Example:

```typescript
// Instead of one complex error
USER_001: '{gender} user with ID {userId} not found';

// Use separate errors
USER_001_MALE: 'The user with ID {userId} not found';
USER_001_FEMALE: 'The user with ID {userId} not found';
```

## Validating Translations

Use the `validateTranslations` method to ensure all locales have consistent translations:

```typescript
import { TranslationService } from '@package/errors';

async validate() {
  const appTranslations = await import('../src/i18n/config');
  const keys = Object.keys(appTranslations.appTranslationsConfig.en);

  const result = await TranslationService.validateTranslationsAsync(keys);

  if (!result.valid) {
    console.error('Missing translations:', result.missing);
    console.error('Extra translations:', result.extra);
  }

  console.log(`Total translation keys: ${result.totalCodes}`);
  console.log(`Total locales: ${result.totalLocales}`);
}
```

## Testing New Translations

### Manual Testing

```bash
# Test with query parameter
curl http://localhost:3000/api/v1/users?locale=es

# Test with Accept-Language header
curl -H "Accept-Language: es" http://localhost:3000/api/v1/users
```

### Automated Testing

```typescript
describe('Spanish Translations', () => {
  it('should translate all API messages to Spanish', async () => {
    const result = await TranslationService.translateAsync(
      'api.success.created',
      {},
      { locale: 'es' }
    );

    expect(result.message).toBe('Recurso creado exitosamente');
    expect(result.locale).toBe('es');
    expect(result.usedFallback).toBe(false);
  });
});
```

## Documentation References

- [Overview](./overview.md) - Architecture and component overview
- [Configuration](./configuration.md) - Environment setup and validation
- [Usage](./usage.md) - How to use i18n in your code
- [Adding Error Locales](../../../../packages/errors/docs/adding-locales.md) - How to add error registry locales
- [@package/errors Package](../../../../packages/errors/README.md) - Core error handling package documentation
