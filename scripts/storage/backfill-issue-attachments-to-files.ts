#!/usr/bin/env tsx

import { and, asc, db, eq, files, isNull, issueAttachments, resetPool } from '@package/db-core';

type BackfillArgs = {
  apply: boolean;
  storageInstance: string;
  bucket: string;
  organizationId?: number;
  limit?: number;
};

type CandidateRow = {
  id: number;
  organizationId: number;
  issueId: number;
  uploadedByUserId: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string | null;
  byteSize: number;
  createdAt: Date;
};

function parsePositiveInteger(value: string, flagName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} must be a positive integer`);
  }

  return parsed;
}

function parseArgs(argv: string[]): BackfillArgs {
  let apply = false;
  let storageInstance: string | undefined;
  let bucket: string | undefined;
  let organizationId: number | undefined;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--storage-instance') {
      storageInstance = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--bucket') {
      bucket = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--organization-id') {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        throw new Error('--organization-id requires a value');
      }
      organizationId = parsePositiveInteger(rawValue, '--organization-id');
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        throw new Error('--limit requires a value');
      }
      limit = parsePositiveInteger(rawValue, '--limit');
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!storageInstance?.trim()) {
    throw new Error('--storage-instance is required');
  }
  if (!bucket?.trim()) {
    throw new Error('--bucket is required');
  }

  return {
    apply,
    storageInstance: storageInstance.trim(),
    bucket: bucket.trim(),
    organizationId,
    limit
  };
}

async function loadCandidates(args: BackfillArgs): Promise<CandidateRow[]> {
  const filters = [isNull(issueAttachments.deletedAt), isNull(issueAttachments.fileId)];
  if (args.organizationId !== undefined) {
    filters.push(eq(issueAttachments.organizationId, args.organizationId));
  }

  let query = db
    .select({
      id: issueAttachments.id,
      organizationId: issueAttachments.organizationId,
      issueId: issueAttachments.issueId,
      uploadedByUserId: issueAttachments.uploadedByUserId,
      storageKey: issueAttachments.storageKey,
      originalFilename: issueAttachments.originalFilename,
      mimeType: issueAttachments.mimeType,
      byteSize: issueAttachments.byteSize,
      createdAt: issueAttachments.createdAt
    })
    .from(issueAttachments)
    .where(and(...filters))
    .orderBy(asc(issueAttachments.id));

  if (args.limit !== undefined) {
    query = query.limit(args.limit);
  }

  return query;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const candidates = await loadCandidates(args);

  console.log(
    JSON.stringify(
      {
        mode: args.apply ? 'apply' : 'dry-run',
        storageInstance: args.storageInstance,
        bucket: args.bucket,
        organizationId: args.organizationId ?? null,
        limit: args.limit ?? null,
        candidates: candidates.length
      },
      null,
      2
    )
  );

  if (candidates.length === 0) {
    console.log('No issue attachments require backfill.');
    return;
  }

  console.table(
    candidates.slice(0, 10).map((candidate) => ({
      id: candidate.id,
      organizationId: candidate.organizationId,
      issueId: candidate.issueId,
      uploadedByUserId: candidate.uploadedByUserId,
      originalFilename: candidate.originalFilename,
      storageKey: candidate.storageKey,
      byteSize: candidate.byteSize
    }))
  );

  if (!args.apply) {
    console.log(
      'Dry run only. Re-run with --apply to create file rows and link issue attachments.'
    );
    return;
  }

  for (const candidate of candidates) {
    await db.transaction(async (tx) => {
      const [createdFile] = await tx
        .insert(files)
        .values({
          organizationId: candidate.organizationId,
          uploadedByUserId: candidate.uploadedByUserId,
          storageInstance: args.storageInstance,
          bucket: args.bucket,
          objectKey: candidate.storageKey,
          originalFilename: candidate.originalFilename,
          mimeType: candidate.mimeType,
          byteSize: candidate.byteSize,
          checksumSha256: null,
          etag: null,
          status: 'ready',
          visibility: 'private',
          purpose: 'issue_attachment',
          metadata: {
            backfilledFrom: 'issue_attachments',
            issueAttachmentId: candidate.id,
            issueId: candidate.issueId
          },
          uploadedAt: candidate.createdAt,
          lastAccessedAt: null,
          deletedAt: null,
          purgedAt: null,
          createdAt: candidate.createdAt,
          updatedAt: candidate.createdAt
        })
        .returning({ id: files.id });

      if (!createdFile) {
        throw new Error(`Failed to create file row for issue attachment ${candidate.id}`);
      }

      await tx
        .update(issueAttachments)
        .set({ fileId: createdFile.id })
        .where(eq(issueAttachments.id, candidate.id));
    });
  }

  console.log(`Backfilled ${candidates.length} issue attachment rows into files.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await resetPool();
  });
