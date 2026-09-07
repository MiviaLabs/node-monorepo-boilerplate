# Adding Locales

How to add new language translations to `@package/errors`.

## Overview

The package uses a **dynamic locale discovery system** - new locales are automatically discovered at runtime without requiring code changes. Simply add a new locale file, and it will be available immediately.

## Supported Locales

Currently supported built-in locales:

- `en` - English (default)
- `ar-SA` - Arabic (Saudi Arabia)

Additional locales (e.g. `tl-PH`, `fr`, `es`) can be added dynamically using the guide below.

## Creating a New Locale

### Step 1: Create Locale File

Create a new file in `/src/i18n/locales/` directory:

```typescript
// src/i18n/locales/es.ts
import type { ErrorTranslations } from '../i18n.types';

export const es: ErrorTranslations = {
  // User errors (USER_001-010)
  USER_001: 'Usuario con ID {userId} no encontrado',
  USER_002: 'Usuario con email {email} ya existe',
  USER_003: 'Formato de email inválido: {email}',
  USER_004: 'La contraseña no cumple con los requisitos de seguridad',
  USER_005: 'Las contraseñas no coinciden',
  USER_006: 'Cuenta de usuario deshabilitada',
  USER_007: 'Cuenta de usuario suspendida: {reason}',
  USER_008: 'Formato de teléfono inválido: {phone}',
  USER_009: 'El tamaño de la imagen de perfil excede el tamaño máximo permitido de {maxSize}MB',
  USER_010: 'No puedes eliminar tu propia cuenta',

  // Authentication errors (AUTH_001-010)
  AUTH_001: 'Email o contraseña inválidos',
  AUTH_002: 'Falta el token de autenticación',
  AUTH_003: 'El token de autenticación es inválido o ha expirado',
  AUTH_004: 'Permisos insuficientes: se requiere {requiredPermission}',
  AUTH_005: 'Código 2FA inválido',
  AUTH_006:
    'Demasiados intentos de inicio de sesión fallidos. Cuenta bloqueada por {lockoutMinutes} minutos',
  AUTH_007: 'El token de restablecimiento de contraseña es inválido o ha expirado',
  AUTH_008: 'Sesión expirada. Por favor, inicie sesión nuevamente',
  AUTH_009: 'Acceso denegado desde: {country}',
  AUTH_010: 'Asignación de rol inválida: el usuario no puede tener el rol {role}',

  // Validation errors (VAL_001-009)
  VAL_001: 'Validación fallida: {field} es requerido',
  VAL_002: 'Valor inválido para {field}: se esperaba {expectedType}',
  VAL_003: 'El valor para {field} debe estar entre {min} y {max}',
  VAL_004: 'El texto para {field} debe tener entre {minLength} y {maxLength} caracteres',
  VAL_005: 'Formato UUID inválido: {value}',
  VAL_006: 'Formato de fecha inválido: {date}. Formato esperado: {expectedFormat}',
  VAL_007: 'Formato de URL inválido: {url}',
  VAL_008: 'La fecha {field} debe ser en el futuro',
  VAL_009: 'La fecha {field} debe ser en el pasado',

  // Database errors (DB_001-010)
  DB_001: 'Fallo al conectar a la base de datos',
  DB_002: 'Conexión a la base de datos perdida',
  DB_003: 'Registro ya existe: {entity}',
  DB_004: 'Registro no encontrado en la base de datos',
  DB_005: 'Consulta de base de datos fallida',
  DB_006: 'Violación de restricción de clave foránea',
  DB_007: 'Transacción de base de datos fallida',
  DB_008: 'Demasiadas conexiones a la base de datos',
  DB_009: 'Parámetro de consulta inválido: {parameter}',
  DB_010: 'Violación de restricción única',

  // Business errors (BIZ_001-008)
  BIZ_001: 'Operación no permitida: {reason}',
  BIZ_002: 'No se puede modificar {entity} en estado {status}',
  BIZ_003: 'Saldo insuficiente: requerido {required}, disponible {available}',
  BIZ_004: 'El recurso ya está {action}',
  BIZ_005: 'Límite máximo de {limit} {entity} alcanzado',
  BIZ_006: 'Se requiere suscripción para esta función',
  BIZ_007: 'El período de prueba ha expirado',
  BIZ_008: 'Transición de flujo de trabajo inválida de {currentStatus} a {newStatus}',

  // External service errors (EXT_001-007)
  EXT_001: 'Fallo al conectar con {service}',
  EXT_002: '{service} devolvió un error: {errorMessage}',
  EXT_003: 'Solicitud a {service} agotó el tiempo de espera',
  EXT_004: 'Clave API inválida para {service}',
  EXT_005:
    'Límite de velocidad excedido para {service}. Reintente después de {retryAfter} segundos',
  EXT_006: '{service} no está disponible actualmente',
  EXT_007: 'Fallo en la entrega del webhook: {reason}',

  // File errors (FILE_001-008)
  FILE_001: 'Fallo en la subida de archivo: {reason}',
  FILE_002: 'Tipo de archivo inválido: {fileType}. Tipos permitidos: {allowedTypes}',
  FILE_003: 'El tamaño del archivo {size}MB excede el tamaño máximo permitido de {maxSize}MB',
  FILE_004: 'Archivo no encontrado: {filename}',
  FILE_005: 'Permiso denegado para acceder al archivo: {filename}',
  FILE_006: 'Error de almacenamiento de archivo: {reason}',
  FILE_007: 'Archivo corrupto o inválido: {filename}',
  FILE_008: 'Espacio de almacenamiento insuficiente',

  // System errors (SYS_001-010)
  SYS_001: 'Error interno del servidor',
  SYS_002: 'Servicio temporalmente no disponible',
  SYS_003: 'Error de configuración: {configKey}',
  SYS_004: 'La función {feature} no está habilitada',
  SYS_005: 'Límite de velocidad excedido. Intente nuevamente en {retryAfter} segundos',
  SYS_006: 'Error del servicio de caché',
  SYS_007: 'Fallo en el procesamiento de trabajo: {jobType}',
  SYS_008: 'Error de cola de mensajes',
  SYS_009: 'Fallo en el envío de correo',
  SYS_010: 'Error del programador: {task}'
};
```

### Step 2: Export from Index

Add the locale export to `/src/i18n/locales/index.ts`:

```typescript
// src/i18n/locales/index.ts
export { en } from './en';
export { arSA } from './ar-SA';
export { tlPH } from './tl-PH';
export { fr } from './fr';
export { es } from './es'; // Add this line
```

### Step 3: Update Locale Type

Add the locale code to the `Locale` type in `/src/i18n/i18n.types.ts`:

```typescript
// src/i18n/i18n.types.ts
export type Locale = 'en' | 'ar-SA' | 'tl-PH' | 'fr' | 'es'; // Add 'es'
```

### Step 4: Rebuild the Package

```bash
pnpm nx build @package/errors
```

That's it! The new locale is now available for use.

## Using the New Locale

```typescript
import { TranslationService } from '@package/errors';

await TranslationService.initialize();

// Use the new locale
const translation = await TranslationService.translateAsync(
  'USER_001',
  { userId: '123' },
  { locale: 'es' }
);

console.log(translation.message);
// Output: "Usuario con ID 123 no encontrado"
```

## Locale Discovery

The package automatically discovers all locales at runtime:

```typescript
import { TranslationService } from '@package/errors';

// Get all available locales
const locales = await TranslationService.getAvailableLocales();
console.log(locales);
// Output: ['en', 'ar-SA', 'tl-PH', 'fr', 'es']

// Check if a locale is supported
const hasSpanish = await TranslationService.isLocaleSupportedAsync('es');
console.log(hasSpanish); // true
```

## Translation Guidelines

### Parameter Placeholders

All parameters use `{parameterName}` syntax and must match the error definition:

```typescript
// Error definition has parameter: userId
USER_001: 'Usuario con ID {userId} no encontrado'; // ✅ Correct
USER_001: 'Usuario no encontrado'; // ❌ Missing {userId}
USER_001: 'Usuario con ID {id} no encontrado'; // ❌ Wrong parameter name
```

### Gender and Pluralization

Some languages require gender or pluralization handling. Currently, the package uses simple string interpolation. For complex grammatical rules, consider:

1. Providing multiple error codes for different genders/plurals
2. Including gender/plurality as parameters
3. Using conditional logic in your error handler

Example:

```typescript
// Instead of one complex error
USER_001: '{gender} usuario con ID {userId} no encontrado';

// Use separate errors
USER_001_MALE: 'El usuario con ID {userId} no encontrado';
USER_001_FEMALE: 'La usuaria con ID {userId} no encontrada';
```

### Cultural Considerations

- **Formal vs Informal**: Some languages have formal/informal address (e.g., Spanish "usted" vs "tú")
- **Date/Number Formats**: Consider locale-specific formatting
- **Text Direction**: RTL languages (Arabic) require proper CSS support
- **Character Encoding**: Ensure UTF-8 encoding for all locale files

## Running Tests Translations

Validate translations for completeness:

```typescript
import { TranslationService, ERROR_REGISTRY } from '@package/errors';

await TranslationService.initialize();

// Validate all translations
const validation = await TranslationService.validateTranslationsAsync(Object.keys(ERROR_REGISTRY));

if (!validation.valid) {
  console.error('Missing translations:', validation.missing);
  console.error('Extra translations:', validation.extra);
}

console.log(`Total error codes: ${validation.totalCodes}`);
```

## Updating Existing Translations

To update an existing translation:

1. Edit the locale file directly
2. Rebuild the package
3. Test the updated translation

No code changes required - translations are loaded at runtime.

## Contributing Translations

If you contribute a new locale:

1. Follow the naming convention: `{language-code}-{COUNTRY-CODE}` (e.g., `pt-BR` for Portuguese in Brazil)
2. Translate all 72 error codes
3. Test with `TranslationService.validateTranslationsAsync()`
4. Consider cultural nuances and formal/informal address
5. Update this documentation with the new locale

## Need Help?

- See [Error Codes Reference](./error-codes.md) for all error code messages
- See [API Reference](./api-reference.md) for TranslationService API
- Check existing locale files for examples
