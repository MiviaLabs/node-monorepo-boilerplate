//@ts-check

import { composePlugins, withNx } from '@nx/next';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  nx: {},
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..')
};

const plugins = [withNx];

export default composePlugins(...plugins)(nextConfig);
