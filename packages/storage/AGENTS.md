# @package/storage

S3-compatible object storage package with a provider abstraction, deterministic mock provider, and optional-global NestJS module integration.

## Purpose

This package provides a reusable storage abstraction for object operations and signed URLs without coupling consuming apps directly to AWS SDK types. The initial provider is S3-compatible and must work with custom endpoints and path-style mode.

## Structure

```text
src/
├── config/                      # Config contracts, defaults, resolution, validation
│   ├── interfaces.ts
│   ├── defaults.ts
│   ├── config-resolver.ts
│   └── validation.ts
├── providers/                   # Provider contract and implementations
│   ├── storage-provider.interface.ts
│   ├── mock-storage.provider.ts
│   ├── s3-storage.provider.ts
│   └── provider-factory.ts
├── storage/                     # NestJS module integration
│   ├── interfaces.ts
│   ├── tokens.ts
│   ├── storage.service.ts
│   └── storage.module.ts
├── errors.ts                    # Typed package errors
└── index.ts                     # Public exports
```

## Locked Contract Decisions

- Provider type is `s3`.
- Per-operation `bucket?: string` overrides are part of the contract.
- Public body types are Node-first: `Buffer | Uint8Array | string | Readable`.
- `getObject()` returns a `Readable`, not SDK-specific stream unions.
- Signed URL inputs are split into upload and download types.
- `StorageService` stays a thin pass-through over `IStorageProvider`.
- `StorageModule` supports optional global registration instead of hard-coded `@Global()`.

## Exports

### Config

- `resolveStorageConfig`
- `validateStorageConfig`
- `StorageProviderType`
- `IStorageConfig`
- `IS3StorageConfig`
- `ResolvedStorageConfig`
- `ResolvedS3StorageConfig`
- `StorageEnvironmentVariableNames`

### Providers

- `IStorageProvider`
- `StorageBodyInput`
- `SignedUrlMethod`
- `createStorageProvider`
- `MockStorageProvider`
- `S3StorageProvider`

### NestJS

- `StorageModule`
- `StorageService`
- `STORAGE_PROVIDER_TOKEN`
- `STORAGE_MODULE_OPTIONS`
- `IStorageModuleOptions`
- `IStorageRootModuleOptions`
- `IStorageModuleAsyncOptions`
- `IStorageModuleOptionsFactory`

### Errors

- `StorageError`
- `StorageConfigurationError`
- `StorageObjectNotFoundError`
- `StorageOperationError`
- `StorageProviderError`

## Usage Direction

- Prefer explicit config for tests and local infrastructure.
- Use environment-driven resolution in applications when configuration is centralized.
- Keep tenant key-prefix conventions in application code, not inside this package.
- Keep the public API free of AWS SDK request and response types.
- Set `global` on the top-level `forRootAsync(...)` options, not inside factory-returned module options.

## Documentation References

- [./README.md](./README.md)
- See the [storage package documentation](README.md) for the current implementation.
