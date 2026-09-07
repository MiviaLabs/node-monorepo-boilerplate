import { getDefaultConfig } from 'expo/metro-config';
import path from 'node:path';

// Minimal monorepo-aware Metro config for the Expo app inside an Nx + pnpm
// workspace rooted one level above this project.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules')
];

export default config;
