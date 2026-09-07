import { DEFAULT_STORAGE_CONFIG, DEFAULT_STORAGE_ENV_VAR_NAMES } from './defaults';
import { validateStorageConfig } from './validation';
import { StorageConfigurationError } from '../errors';

import type {
  IStorageConfig,
  IStorageConfigsInput,
  ResolvedStorageConfig,
  ResolvedStorageConfigs,
  StorageEnvironmentVariableNames,
  StorageProviderType
} from './interfaces';

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (!isBlank(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = firstNonBlank(value);
  return normalized === undefined ? undefined : normalized.trim();
}

function parseBoolean(value: boolean | string | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value === 'true' || value === '1';
  }

  return fallback;
}

function parseNumber(
  value: number | string | undefined,
  fallback: number,
  fieldName?: string
): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    if (fieldName) {
      throw new StorageConfigurationError(`${fieldName} must be a valid number`);
    }
  }

  return fallback;
}

function getEnvVarNames(
  customNames?: Partial<StorageEnvironmentVariableNames>
): Required<StorageEnvironmentVariableNames> {
  return {
    ...DEFAULT_STORAGE_ENV_VAR_NAMES,
    ...customNames
  };
}

function sanitizeForError(value: string): string {
  return value.slice(0, 100).replace(/[\r\n\t]/g, ' ');
}

function normalizeInstanceName(name: string): string {
  return name.trim();
}

function toInstanceEnvVarNames(instanceName: string): Required<StorageEnvironmentVariableNames> {
  if (instanceName === 'default') {
    return DEFAULT_STORAGE_ENV_VAR_NAMES;
  }

  const instancePrefix = `STORAGE_${instanceName.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;

  return {
    STORAGE_INSTANCES: DEFAULT_STORAGE_ENV_VAR_NAMES.STORAGE_INSTANCES,
    STORAGE_DEFAULT_INSTANCE: DEFAULT_STORAGE_ENV_VAR_NAMES.STORAGE_DEFAULT_INSTANCE,
    STORAGE_PROVIDER: `${instancePrefix}_PROVIDER`,
    STORAGE_DEFAULT_BUCKET: `${instancePrefix}_DEFAULT_BUCKET`,
    STORAGE_S3_ENDPOINT: `${instancePrefix}_S3_ENDPOINT`,
    STORAGE_S3_REGION: `${instancePrefix}_S3_REGION`,
    STORAGE_S3_ACCESS_KEY_ID: `${instancePrefix}_S3_ACCESS_KEY_ID`,
    STORAGE_S3_SECRET_ACCESS_KEY: `${instancePrefix}_S3_SECRET_ACCESS_KEY`,
    STORAGE_S3_SESSION_TOKEN: `${instancePrefix}_S3_SESSION_TOKEN`,
    STORAGE_S3_FORCE_PATH_STYLE: `${instancePrefix}_S3_FORCE_PATH_STYLE`,
    STORAGE_S3_BUCKET: `${instancePrefix}_S3_BUCKET`,
    STORAGE_S3_PUBLIC_BASE_URL: `${instancePrefix}_S3_PUBLIC_BASE_URL`,
    STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS: `${instancePrefix}_S3_SIGNED_URL_EXPIRES_IN_SECONDS`,
    STORAGE_TEST_MODE: `${instancePrefix}_TEST_MODE`
  };
}

function resolveDefaultInstanceName(input: IStorageConfigsInput, env: NodeJS.ProcessEnv): string {
  const explicitDefaultInstance = input.defaultInstance?.trim();
  if (explicitDefaultInstance) {
    return explicitDefaultInstance;
  }

  const envDefaultInstance = env[DEFAULT_STORAGE_ENV_VAR_NAMES.STORAGE_DEFAULT_INSTANCE]?.trim();
  if (envDefaultInstance) {
    return envDefaultInstance;
  }

  return 'default';
}

function getConfiguredInstanceNames(
  input: IStorageConfigsInput,
  env: NodeJS.ProcessEnv,
  defaultInstance: string
): string[] {
  const names = new Set<string>();

  names.add(defaultInstance);

  for (const instanceName of Object.keys(input.storages ?? {})) {
    names.add(normalizeInstanceName(instanceName));
  }

  const envInstances = env[DEFAULT_STORAGE_ENV_VAR_NAMES.STORAGE_INSTANCES]
    ?.split(',')
    .map(normalizeInstanceName)
    .filter((value) => value.length > 0);

  for (const instanceName of envInstances ?? []) {
    names.add(instanceName);
  }

  return Array.from(names);
}

function resolveProvider(
  userConfig: IStorageConfig,
  env: NodeJS.ProcessEnv,
  envNames: Required<StorageEnvironmentVariableNames>
): StorageProviderType {
  const rawProvider = firstDefined(
    userConfig.provider,
    firstNonBlank(env[envNames.STORAGE_PROVIDER]) as StorageProviderType | undefined,
    DEFAULT_STORAGE_CONFIG.provider
  );

  if (rawProvider !== 's3') {
    throw new StorageConfigurationError(
      `Unsupported storage provider "${sanitizeForError(String(rawProvider))}". Valid values are: s3`
    );
  }

  return rawProvider;
}

export function resolveStorageConfig(
  userConfig: IStorageConfig = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedStorageConfig {
  const envNames = getEnvVarNames(userConfig.envVarNames);
  const provider = resolveProvider(userConfig, env, envNames);

  const providerBucket = firstNonBlank(userConfig.s3?.bucket, env[envNames.STORAGE_S3_BUCKET]);
  const defaultBucket = firstNonBlank(
    userConfig.defaultBucket,
    env[envNames.STORAGE_DEFAULT_BUCKET],
    providerBucket
  );

  const resolvedConfig: ResolvedStorageConfig = {
    provider,
    defaultBucket: defaultBucket ?? '',
    testMode: parseBoolean(
      firstDefined<boolean | string>(userConfig.testMode, env[envNames.STORAGE_TEST_MODE]),
      DEFAULT_STORAGE_CONFIG.testMode
    ),
    s3: {
      endpoint: normalizeOptionalString(
        firstNonBlank(userConfig.s3?.endpoint, env[envNames.STORAGE_S3_ENDPOINT])
      ),
      region: firstNonBlank(userConfig.s3?.region, env[envNames.STORAGE_S3_REGION]) ?? '',
      accessKeyId:
        firstNonBlank(userConfig.s3?.accessKeyId, env[envNames.STORAGE_S3_ACCESS_KEY_ID]) ?? '',
      secretAccessKey:
        firstNonBlank(userConfig.s3?.secretAccessKey, env[envNames.STORAGE_S3_SECRET_ACCESS_KEY]) ??
        '',
      forcePathStyle: parseBoolean(
        firstDefined<boolean | string>(
          userConfig.s3?.forcePathStyle,
          env[envNames.STORAGE_S3_FORCE_PATH_STYLE]
        ),
        DEFAULT_STORAGE_CONFIG.s3.forcePathStyle
      ),
      sessionToken: normalizeOptionalString(
        firstNonBlank(userConfig.s3?.sessionToken, env[envNames.STORAGE_S3_SESSION_TOKEN])
      ),
      bucket: providerBucket ?? defaultBucket ?? '',
      publicBaseUrl: normalizeOptionalString(
        firstNonBlank(userConfig.s3?.publicBaseUrl, env[envNames.STORAGE_S3_PUBLIC_BASE_URL])
      ),
      signedUrlExpiresInSeconds: parseNumber(
        firstDefined<number | string>(
          userConfig.s3?.signedUrlExpiresInSeconds,
          env[envNames.STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS]
        ),
        DEFAULT_STORAGE_CONFIG.s3.signedUrlExpiresInSeconds,
        'STORAGE_S3_SIGNED_URL_EXPIRES_IN_SECONDS'
      )
    }
  };

  return validateStorageConfig(resolvedConfig);
}

export function resolveStorageConfigs(
  input: IStorageConfigsInput = {},
  env: NodeJS.ProcessEnv = process.env
): ResolvedStorageConfigs {
  const defaultInstance = resolveDefaultInstanceName(input, env);
  const instanceNames = getConfiguredInstanceNames(input, env, defaultInstance);

  const storages = Object.fromEntries(
    instanceNames.map((instanceName) => {
      const userConfig = input.storages?.[instanceName] ?? {};
      const configWithEnvNames: IStorageConfig =
        instanceName === 'default' || userConfig.envVarNames
          ? userConfig
          : {
              ...userConfig,
              envVarNames: toInstanceEnvVarNames(instanceName)
            };

      return [instanceName, resolveStorageConfig(configWithEnvNames, env)];
    })
  );

  return {
    defaultInstance,
    storages
  };
}
