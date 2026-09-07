/**
 * Admin credentials configuration for Keycloak Admin REST API
 *
 * Provides optional admin credentials for accessing Keycloak's Admin REST API.
 * Used by getUserInfo(), getRoles(), and other admin operations.
 */

import { InvalidAuthProviderConfigError } from '../errors';

/**
 * Admin credentials interface
 */
export interface AdminCredentials {
  /** Admin username for Keycloak Admin REST API */
  username: string;
  /** Admin password for Keycloak Admin REST API */
  password: string;
}

/**
 * Default admin credentials configuration
 */
export const DEFAULT_ADMIN_CREDENTIALS: AdminCredentials | undefined = undefined;

/**
 * Resolve admin credentials from user config and environment variables
 *
 * Priority order:
 * 1. User-provided credentials (highest priority)
 * 2. Environment variables (KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD)
 * 3. Default value (undefined - optional)
 *
 * @param userCredentials - User-provided admin credentials
 * @param env - Environment variables (defaults to process.env)
 * @param envVarNames - Custom environment variable names
 * @returns Resolved admin credentials or undefined
 * @throws InvalidAuthProviderConfigError if only username or password is provided
 */
export function resolveAdminCredentials(
  userCredentials: AdminCredentials | undefined,
  env: NodeJS.ProcessEnv = process.env,
  envVarNames: {
    keycloakAdminUsername?: string;
    keycloakAdminPassword?: string;
  } = {}
): AdminCredentials | undefined {
  const usernameEnvVar = envVarNames.keycloakAdminUsername ?? 'KEYCLOAK_ADMIN_USERNAME';
  const passwordEnvVar = envVarNames.keycloakAdminPassword ?? 'KEYCLOAK_ADMIN_PASSWORD';

  // Get username from user config or environment
  const username = userCredentials?.username ?? env[usernameEnvVar];
  const password = userCredentials?.password ?? env[passwordEnvVar];

  // If neither username nor password is provided, return undefined (optional)
  if (!username && !password) {
    return DEFAULT_ADMIN_CREDENTIALS;
  }

  // Validate: Both username and password must be provided together
  if (!username || !password) {
    throw new InvalidAuthProviderConfigError(
      'Admin credentials must include both username and password. ' +
        `Provide both ${usernameEnvVar} and ${passwordEnvVar} environment variables, ` +
        'or omit both to disable Admin REST API access.'
    );
  }

  return { username, password };
}
