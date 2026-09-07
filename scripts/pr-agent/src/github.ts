/**
 * GitHub Client Factory
 *
 * Creates authenticated Octokit instances and validates environment configuration.
 *
 * @packageDocumentation
 */

import { Octokit } from '@octokit/rest';

import type { IEnvConfig } from './types.js';

/**
 * Creates an authenticated Octokit instance.
 *
 * @param token - GitHub token for authentication
 * @returns Configured Octokit instance
 */
export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

/**
 * Reads and validates required environment variables.
 *
 * @returns Validated environment configuration
 * @throws {Error} When required environment variables are missing
 */
export function loadEnvConfig(): IEnvConfig {
  const required = [
    'GITHUB_TOKEN',
    'ANTHROPIC_API_KEY',
    'PR_NUMBER',
    'HEAD_SHA',
    'REPO_OWNER',
    'REPO_NAME'
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    githubToken: process.env.GITHUB_TOKEN!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    prNumber: parseInt(process.env.PR_NUMBER!, 10),
    headSha: process.env.HEAD_SHA!,
    repoOwner: process.env.REPO_OWNER!,
    repoName: process.env.REPO_NAME!
  };
}
