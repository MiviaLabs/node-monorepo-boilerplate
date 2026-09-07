//@ts-check

import { composePlugins, withNx } from '@nx/next';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  experimental: {
    webpackBuildWorker: false
  },
  // Enable standalone output for Docker
  output: 'standalone',
  // Set workspace root to avoid lockfile warnings - use relative path from monorepo root
  outputFileTracingRoot: path.resolve(__dirname, '../..')
  // Server configuration
  // HOST is set via environment variable (defaults to 0.0.0.0)
  // Next.js automatically reads HOST and PORT environment variables
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx
];

export default composePlugins(...plugins)(nextConfig);
