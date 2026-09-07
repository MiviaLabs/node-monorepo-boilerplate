// Global type declaration for argon2 to suppress TS2688
// This package doesn't use argon2 directly, but TypeScript is looking for types
// because argon2 is in the root package.json dependencies
declare module 'argon2';
