import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
/* eslint-disable @nx/enforce-module-boundaries -- workspace storage library is consumed via tsconfig path aliases */
import { StorageModule as StarterStorageModule } from '@package/storage/nest';

import { ObjectsController } from './controllers';
import {
  CompleteFileUploadHandler,
  CreateFileUploadHandler,
  DeleteFileHandler,
  GetFileDownloadUrlHandler,
  GetFileHandler,
  PurgeDeletedFilesHandler,
  UploadFileContentHandler
} from './handlers';
import { PurgeDeletedFilesJob } from './jobs/purge-deleted-files.job';
import { FileRepository } from './repositories';
import { DetachedFileCleanupService, FileRoutingService, StorageFilesService } from './services';

import type { IStorageConfig, IStorageModuleOptions } from '@package/storage';

import { DatabaseModule } from '@/common/database/database.module';
import { AuditOutboxPublisher } from '@/common/events/audit-outbox.publisher';
import { configServiceFromFactoryArgs } from '@/common/utils/config-factory.util';
import { AuthModule } from '@/modules/auth/auth.module';
/* eslint-enable @nx/enforce-module-boundaries */

const STORAGE_MODULE_LOG_CONTEXT = 'ApiStorageModule';

function normalizeStorageInstanceName(instanceName: string): string {
  return stripWrappingQuotes(instanceName).trim();
}

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function getStorageEnvPrefix(instanceName: string): string {
  const normalizedInstanceName = normalizeStorageInstanceName(instanceName);

  return normalizedInstanceName === 'default'
    ? 'STORAGE'
    : `STORAGE_${normalizedInstanceName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;
}

function readStorageEnv(
  config: ConfigService,
  instanceName: string,
  key: string
): string | undefined {
  const value = config.get<string>(`${getStorageEnvPrefix(instanceName)}_${key}`);
  return typeof value === 'string' ? stripWrappingQuotes(value) : value;
}

export function getConfiguredInstanceNames(
  config: ConfigService,
  defaultInstance: string
): string[] {
  const names = new Set<string>([normalizeStorageInstanceName(defaultInstance)]);
  const rawValue = config.get<string>('STORAGE_INSTANCES');
  if (!rawValue?.trim()) {
    return Array.from(names);
  }

  rawValue
    .split(',')
    .map((value) => normalizeStorageInstanceName(value))
    .filter((value) => value.length > 0)
    .forEach((value) => names.add(value));

  for (const key of Object.keys(process.env)) {
    const match =
      /^STORAGE_([A-Z0-9_]+)_(?:PROVIDER|DEFAULT_BUCKET|S3_BUCKET|S3_REGION|S3_ENDPOINT|S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|S3_SESSION_TOKEN|S3_FORCE_PATH_STYLE|S3_PUBLIC_BASE_URL|S3_SIGNED_URL_EXPIRES_IN_SECONDS|TEST_MODE)$/.exec(
        key
      );

    if (!match) {
      continue;
    }

    const [, rawInstanceName] = match;
    if (!rawInstanceName) {
      continue;
    }

    const instanceName = normalizeStorageInstanceName(rawInstanceName.toLowerCase());
    if (instanceName !== 'default') {
      names.add(instanceName);
    }
  }

  return Array.from(names);
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}

function parseOptionalPositiveInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function createStorageConfig(
  config: ConfigService,
  instanceName: string,
  isTest: boolean
): IStorageConfig {
  return {
    provider: 's3',
    testMode: isTest,
    defaultBucket: isTest
      ? (readStorageEnv(config, instanceName, 'DEFAULT_BUCKET') ??
        `${instanceName}-test-storage-bucket`)
      : readStorageEnv(config, instanceName, 'DEFAULT_BUCKET'),
    s3: {
      endpoint: readStorageEnv(config, instanceName, 'S3_ENDPOINT'),
      region: isTest
        ? (readStorageEnv(config, instanceName, 'S3_REGION') ?? 'us-east-1')
        : readStorageEnv(config, instanceName, 'S3_REGION'),
      accessKeyId: isTest
        ? (readStorageEnv(config, instanceName, 'S3_ACCESS_KEY_ID') ?? 'test-access-key')
        : readStorageEnv(config, instanceName, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: isTest
        ? (readStorageEnv(config, instanceName, 'S3_SECRET_ACCESS_KEY') ?? 'test-secret-key')
        : readStorageEnv(config, instanceName, 'S3_SECRET_ACCESS_KEY'),
      sessionToken: readStorageEnv(config, instanceName, 'S3_SESSION_TOKEN'),
      forcePathStyle: parseBoolean(
        readStorageEnv(config, instanceName, 'S3_FORCE_PATH_STYLE'),
        false
      ),
      bucket: readStorageEnv(config, instanceName, 'S3_BUCKET'),
      publicBaseUrl: readStorageEnv(config, instanceName, 'S3_PUBLIC_BASE_URL'),
      signedUrlExpiresInSeconds: parseOptionalPositiveInteger(
        readStorageEnv(config, instanceName, 'S3_SIGNED_URL_EXPIRES_IN_SECONDS')
      )
    }
  };
}

export function createStorageModuleOptions(config: ConfigService): IStorageModuleOptions {
  const logger = new Logger(STORAGE_MODULE_LOG_CONTEXT);
  const isTest = config.get<string>('NODE_ENV', 'development') === 'test';
  const defaultInstance = normalizeStorageInstanceName(
    config.get<string>('STORAGE_DEFAULT_INSTANCE') ?? 'default'
  );
  const instanceNames = getConfiguredInstanceNames(config, defaultInstance);
  const storages = Object.fromEntries(
    instanceNames.map((instanceName) => [
      instanceName,
      createStorageConfig(config, instanceName, isTest)
    ])
  );

  return {
    defaultInstance,
    storages,
    invalidConfigBehavior: isTest ? 'throw' : 'warn-and-disable',
    warningLogger: logger
  };
}

@Module({
  imports: [
    CqrsModule,
    DatabaseModule,
    AuthModule,
    StarterStorageModule.forRootAsync({
      imports: [ConfigModule],
      global: true,
      inject: [ConfigService],
      useFactory: (...args: unknown[]) => {
        const config = configServiceFromFactoryArgs(args);
        return createStorageModuleOptions(config);
      }
    })
  ],
  controllers: [ObjectsController],
  providers: [
    FileRepository,
    DetachedFileCleanupService,
    FileRoutingService,
    StorageFilesService,
    AuditOutboxPublisher,
    CreateFileUploadHandler,
    CompleteFileUploadHandler,
    UploadFileContentHandler,
    DeleteFileHandler,
    GetFileHandler,
    GetFileDownloadUrlHandler,
    PurgeDeletedFilesJob,
    PurgeDeletedFilesHandler
  ],
  exports: [
    StarterStorageModule,
    FileRepository,
    DetachedFileCleanupService,
    FileRoutingService,
    StorageFilesService
  ]
})
export class StorageModule {}
