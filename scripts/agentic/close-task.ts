#!/usr/bin/env tsx

import path from 'node:path';

import { closeTaskRun, getRequiredFlag, parseCliArgs } from './task-runtime';

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../..');
  const result = await closeTaskRun({
    repoRoot,
    taskRef: getRequiredFlag(args, 'task')
  });

  console.log(result.evidenceFile);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
