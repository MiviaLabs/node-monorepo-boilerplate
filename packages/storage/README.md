# @package/storage

Reusable object storage abstraction for AWS S3 and S3-compatible providers with NestJS integration and a deterministic mock provider for tests.

## Features

- **S3-compatible first**: AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces, and other endpoint-compatible providers
- **Unified interface**: Stable provider contract for object operations and signed URLs
- **Custom endpoints**: Explicit support for endpoint overrides and path-style mode
- **NestJS ready**: Dynamic module with `forRoot()` and `forRootAsync()`
- **Multiple named storages**: One default storage plus optional named instances behind a registry service
- **Configurable bootstrap policy**: Either fail fast on invalid config or warn and install a disabled provider
- **Test-friendly**: In-memory mock provider for unit and integration tests
- **Type-safe config**: Deterministic config resolution from explicit options and environment variables

## Installation

This package is part of the monorepo workspace.

```bash
pnpm install
```

## Public API

```typescript
import {
  type IStorageProvider,
  type IStorageConfig,
  type PutObjectInput,
  type GetObjectResult,
  type GetSignedUploadUrlInput,
  type GetSignedDownloadUrlInput
} from '@package/storage';
```

Core operations:

- `putObject()`
- `getObject()`
- `deleteObject()`
- `headObject()`
- `objectExists()`
- `copyObject()`
- `getSignedUploadUrl()`
- `getSignedDownloadUrl()`

## Configuration

The package resolves configuration from explicit input first, environment variables second, and defaults last.

```bash
STORAGE_PROVIDER=s3
STORAGE_DEFAULT_BUCKET=app-assets
STORAGE_S3_ENDPOINT=http://localhost:9000
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY_ID=minioadmin
STORAGE_S3_SECRET_ACCESS_KEY=minioadmin
STORAGE_S3_FORCE_PATH_STYLE=true
STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS=900
```

For multiple named storages, declare the instances and use the `STORAGE_<NAME>_*` pattern:

```bash
STORAGE_INSTANCES=default,private
STORAGE_DEFAULT_INSTANCE=default

STORAGE_DEFAULT_BUCKET=public-assets
STORAGE_S3_REGION=us-east-1
STORAGE_S3_ACCESS_KEY_ID=minioadmin
STORAGE_S3_SECRET_ACCESS_KEY=minioadmin

STORAGE_PRIVATE_DEFAULT_BUCKET=private-assets
STORAGE_PRIVATE_S3_REGION=us-east-1
STORAGE_PRIVATE_S3_ACCESS_KEY_ID=minioadmin
STORAGE_PRIVATE_S3_SECRET_ACCESS_KEY=minioadmin
```

```typescript
interface IStorageConfig {
  provider?: 's3';
  defaultBucket?: string;
  s3?: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
    sessionToken?: string;
    bucket?: string;
    publicBaseUrl?: string;
    signedUrlExpiresInSeconds?: number;
  };
  envVarNames?: Partial<StorageEnvironmentVariableNames>;
  testMode?: boolean;
}
```

```typescript
interface IStorageConfigsInput {
  defaultInstance?: string;
  storages?: Record<string, IStorageConfig>;
}
```

Use `resolveStorageConfig()` to turn partial input plus environment variables into a validated `ResolvedStorageConfig`.
Use `resolveStorageConfigs()` to resolve a default instance plus any named storage instances.

## Usage

### NestJS module

```typescript
import { Module } from '@nestjs/common';
import { StorageModule } from '@package/storage/nest';

@Module({
  imports: [
    StorageModule.forRoot({
      global: true,
      storage: {
        provider: 's3',
        defaultBucket: 'uploads',
        s3: {
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          accessKeyId: 'minioadmin',
          secretAccessKey: 'minioadmin',
          forcePathStyle: true
        }
      }
    })
  ]
})
export class AppModule {}
```

`global` belongs on the top-level `forRoot()` or `forRootAsync()` options. Do not return `global` from an async factory result.

The Nest module options support three main configuration paths:

- `storage`: partial storage config that will be resolved and validated by the package
- `storages`: map of named storage configs for multi-instance setups
- `provider`: a fully constructed custom provider instance
- `providers`: map of fully constructed custom provider instances
- `providerOptions`: extra options forwarded to `createStorageProvider(...)`

`StorageService` always targets the default storage instance. For named instances, inject `StorageRegistryService` and call `registry.get('<name>')`.

### NestJS async configuration

```typescript
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@package/storage/nest';

StorageModule.forRootAsync({
  imports: [ConfigModule],
  global: true,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => ({
    storage: {
      provider: 's3',
      defaultBucket: config.getOrThrow<string>('STORAGE_DEFAULT_BUCKET'),
      s3: {
        endpoint: config.get<string>('STORAGE_S3_ENDPOINT'),
        region: config.getOrThrow<string>('STORAGE_S3_REGION'),
        accessKeyId: config.getOrThrow<string>('STORAGE_S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('STORAGE_S3_SECRET_ACCESS_KEY'),
        forcePathStyle: config.get<boolean>('STORAGE_S3_FORCE_PATH_STYLE') ?? false
      }
    }
  })
});
```

### NestJS multi-storage access

```typescript
import { Injectable } from '@nestjs/common';
import { StorageRegistryService } from '@package/storage/nest';

@Injectable()
export class AssetsService {
  constructor(private readonly storageRegistry: StorageRegistryService) {}

  getPrivateStorage() {
    return this.storageRegistry.get('private');
  }
}
```

### NestJS invalid-config policy

By default, the module fails during bootstrap if storage config is invalid.

If an app should still start and defer failure until a storage operation is attempted, opt into `warn-and-disable`:

```typescript
import { Logger } from '@nestjs/common';
import { StorageModule } from '@package/storage/nest';

StorageModule.forRootAsync({
  useFactory: async () => ({
    invalidConfigBehavior: 'warn-and-disable',
    warningLogger: new Logger('ApiStorageModule'),
    storage: {
      provider: 's3',
      defaultBucket: process.env.STORAGE_DEFAULT_BUCKET,
      s3: {
        region: process.env.STORAGE_S3_REGION,
        accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY
      }
    }
  })
});
```

In `warn-and-disable` mode, the app logs one startup warning and registers a disabled provider. Any later storage call throws `StorageOperationError`.

### Direct provider usage

```typescript
import { createStorageProvider, resolveStorageConfig } from '@package/storage';

const config = resolveStorageConfig({
  provider: 's3',
  defaultBucket: 'uploads',
  s3: {
    endpoint: 'http://localhost:9000',
    region: 'us-east-1',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    forcePathStyle: true
  }
});

const provider = createStorageProvider(config);
```

If you need NestJS integration, import it from the dedicated subpath:

```typescript
import { StorageModule, StorageService } from '@package/storage/nest';
```

### Mock provider usage

```typescript
import { MockStorageProvider, resolveStorageConfig } from '@package/storage';

const config = resolveStorageConfig({
  testMode: true,
  defaultBucket: 'test-bucket',
  s3: {
    region: 'us-east-1',
    accessKeyId: 'key',
    secretAccessKey: 'secret'
  }
});

const provider = new MockStorageProvider(config);
await provider.putObject({ key: 'avatar.png', body: 'data' });
```

### Custom provider injection

```typescript
import { StorageModule } from '@package/storage/nest';

StorageModule.forRoot({
  provider: customStorageProvider
});
```

## Running Tests

Execute package tests:

```bash
pnpm nx test storage
```

## Notes

- Bucket resolution order is `input.bucket`, then `defaultBucket`, then `s3.bucket`.
- Upload and download URL helpers return a package-level `SignedUrlResult`; they do not expose AWS SDK types.
- `deleteObject()` is idempotent across mock and S3 providers to match native S3 behavior.

## Associated Packages

- `@package/core`
- `@package/email`
- `@package/encryption`
- `@package/secrets`
