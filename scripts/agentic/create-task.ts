#!/usr/bin/env tsx

import path from 'node:path';

import {
  createTaskRun,
  getListFlag,
  getOptionalFlag,
  getRequiredFlag,
  parseCliArgs
} from './task-runtime';

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../..');

  const taskFile = await createTaskRun({
    repoRoot,
    id: getRequiredFlag(args, 'id'),
    title: getRequiredFlag(args, 'title'),
    type: getOptionalFlag(args, 'type') as
      | 'research'
      | 'planning'
      | 'implementation'
      | 'review'
      | 'validation'
      | undefined,
    ownerAgent: getOptionalFlag(args, 'owner-agent'),
    preferredProvider: getOptionalFlag(args, 'provider'),
    description: getOptionalFlag(args, 'description'),
    riskAreas: getListFlag(args, 'risk-area'),
    originalRequest: getOptionalFlag(args, 'original-request'),
    normalizedRequest: getOptionalFlag(args, 'normalized-request'),
    improvementMode: getOptionalFlag(args, 'improvement-mode') as
      | 'none'
      | 'normalized'
      | 'clarification_required'
      | undefined,
    missingInformation: getListFlag(args, 'missing-information'),
    executionBrief: args.flags.has('execution-brief')
      ? getListFlag(args, 'execution-brief')
      : undefined
  });

  console.log(taskFile);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
