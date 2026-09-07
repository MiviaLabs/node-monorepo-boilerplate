import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import YAML from 'yaml';

import { closeTaskRun, createTaskRun, parseCliArgs } from './task-runtime';

const TEMPLATE = `id: TASK-000-000
title: Replace with clear task title
type: implementation
status: todo
owner_agent: backend-implementer
preferred_provider: codex
description: |
  Describe what changes, why it matters, and what repository boundary this task owns.
request_context:
  original_request: Replace with the raw user request or task intake text.
  normalized_request: Replace with the shortest improved execution brief that preserves the user's intent.
  improvement_mode: none
  missing_information: []
  execution_brief:
    - Preserve the original request text.
    - Normalize only when it improves execution quality or surfaces missing constraints.
acceptance_criteria:
  - Behavior is implemented and matches the request.
risk_areas: []
prior_lessons_reviewed: []
preflight_checks: []
avoid_repeat_mistakes: []
files:
  create: []
  modify: []
  delete: []
dependencies: []
required_checks:
  - lint
  - typecheck
  - test_unit
required_reviews:
  - review_impacted_code
  - verify_assumptions
required_e2e: false
evidence:
  prior_lessons_reviewed: []
  status: null
  summary: null
  files_changed: []
  commands_run: []
  checks: {}
  reviews: {}
  assumptions_verified: []
  mistakes_observed: []
  lessons_captured: []
  new_or_updated_rules: []
  future_checks_required: []
  recurrence_risk: low
  residual_risks: []
  blockers: []
`;

const LEGACY_TEMPLATE = `id: TASK-000-000
title: Replace with clear task title
type: implementation
status: todo
owner_agent: backend-implementer
preferred_provider: codex
description: |
  Describe what changes, why it matters, and what repository boundary this task owns.
acceptance_criteria:
  - Behavior is implemented and matches the request.
risk_areas: []
prior_lessons_reviewed: []
preflight_checks: []
avoid_repeat_mistakes: []
files:
  create: []
  modify: []
  delete: []
dependencies: []
required_checks:
  - lint
  - typecheck
  - test_unit
required_reviews:
  - review_impacted_code
  - verify_assumptions
required_e2e: false
evidence:
  prior_lessons_reviewed: []
  status: null
  summary: null
  files_changed: []
  commands_run: []
  checks: {}
  reviews: {}
  assumptions_verified: []
  mistakes_observed: []
  lessons_captured: []
  new_or_updated_rules: []
  future_checks_required: []
  recurrence_risk: low
  residual_risks: []
  blockers: []
`;

const COMPLETION_CONTRACT = `required:
  - prior_lessons_reviewed
  - status
  - summary
  - files_changed
  - commands_run
  - checks
  - reviews
  - assumptions_verified
  - mistakes_observed
  - lessons_captured
  - new_or_updated_rules
  - future_checks_required
  - recurrence_risk
  - residual_risks
`;

const LESSONS = `lessons:
  - id: LESSON-001
    title: Auth and tenant-sensitive browser flows require real full-stack E2E
    required_prevention:
      - Mark the task with required_e2e: true.
      - Include test_e2e in required_checks.
  - id: LESSON-002
    title: Bug fixes need a failing reproduction before implementation
    required_prevention:
      - Reproduce the bug with a failing unit, integration, or E2E test before the fix when practical.
`;

const RISK_PATTERNS = `risk_patterns:
  - id: RISK-001
    risk_areas:
      - auth
      - protected-flow
    required_lessons:
      - LESSON-001
    required_reviews:
      - verify_assumptions
    required_checks:
      - test_e2e
`;

async function createRepoFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-runtime-'));
  await mkdir(path.join(repoRoot, '.agents', 'tasks', 'templates'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'governance'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'registry'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'memories'), { recursive: true });
  await writeFile(
    path.join(repoRoot, '.agents', 'tasks', 'templates', 'task.template.yaml'),
    TEMPLATE,
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'governance', 'completion-contract.yaml'),
    COMPLETION_CONTRACT,
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'memories', 'lessons-learned.yaml'),
    LESSONS,
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'memories', 'risk-patterns.yaml'),
    RISK_PATTERNS,
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'memories', 'MEMORY.md'),
    '# Repository Memory\n\nUse current source as the authority.\n',
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'registry', 'skills.yaml'),
    `skills:
  - name: auth-safety
    risk_areas: [auth, protected-flow]
    required_checks: [test_e2e]
    required_reviews: [verify_assumptions]
    required_e2e: true
`,
    'utf8'
  );

  return repoRoot;
}

describe('agentic task runtime', () => {
  it('creates a task run with lessons and checks loaded from matching risk areas', async () => {
    const repoRoot = await createRepoFixture();

    const taskFile = await createTaskRun({
      repoRoot,
      id: 'TASK-999-001',
      title: 'Protect dashboard tenant routing',
      riskAreas: ['auth', 'protected-flow']
    });

    const created = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(created.prior_lessons_reviewed, ['LESSON-001']);
    assert.equal(created.required_e2e, true);
    assert.deepEqual(created.required_skills, ['auth-safety']);
    assert.ok((created.required_checks as string[]).includes('test_e2e'));
    assert.ok(
      (created.avoid_repeat_mistakes as string[]).includes('Include test_e2e in required_checks.')
    );
    assert.deepEqual(created.request_context, {
      original_request: 'Protect dashboard tenant routing',
      normalized_request: 'Protect dashboard tenant routing',
      improvement_mode: 'none',
      missing_information: [],
      execution_brief: [
        'Preserve the original request text.',
        'Normalize only when it improves execution quality or surfaces missing constraints.'
      ]
    });
  });

  it('stores a normalized execution brief without losing the original request', async () => {
    const repoRoot = await createRepoFixture();

    const taskFile = await createTaskRun({
      repoRoot,
      id: 'TASK-999-004',
      title: 'Improve auth middleware',
      originalRequest: 'fix auth middleware maybe',
      normalizedRequest:
        'Investigate and fix the auth middleware regression, then verify the protected route behavior with targeted tests.',
      improvementMode: 'normalized',
      missingInformation: ['Exact failing route is not specified.'],
      executionBrief: [
        'Start by reproducing the middleware failure.',
        'Keep the original request visible in the task artifact.'
      ]
    });

    const created = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(created.request_context, {
      original_request: 'fix auth middleware maybe',
      normalized_request:
        'Investigate and fix the auth middleware regression, then verify the protected route behavior with targeted tests.',
      improvement_mode: 'normalized',
      missing_information: ['Exact failing route is not specified.'],
      execution_brief: [
        'Start by reproducing the middleware failure.',
        'Keep the original request visible in the task artifact.'
      ]
    });
  });

  it('accepts repository-style task ids instead of the old numeric-only pattern', async () => {
    const repoRoot = await createRepoFixture();

    const taskFile = await createTaskRun({
      repoRoot,
      id: 'TASK-storage-files-phase-6-deletion-and-hardening',
      title: 'Create the storage lifecycle task run',
      riskAreas: ['storage', 'api']
    });

    const created = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    assert.equal(created.id, 'TASK-storage-files-phase-6-deletion-and-hardening');
  });

  it('rejects unsupported risk areas during task creation', async () => {
    const repoRoot = await createRepoFixture();

    await assert.rejects(
      () =>
        createTaskRun({
          repoRoot,
          id: 'TASK-invalid-risk-area',
          title: 'Reject unsupported risk areas',
          riskAreas: ['not-a-real-risk-area']
        }),
      /unsupported risk_areas values/
    );
  });

  it('writes persisted evidence and marks the task done on successful closure', async () => {
    const repoRoot = await createRepoFixture();
    const taskFile = path.join(
      repoRoot,
      '.agents',
      'tasks',
      'runs',
      '2026',
      '03',
      '12',
      'TASK-999-002',
      'task.yaml'
    );
    const taskDirectory = path.dirname(taskFile);
    await mkdir(taskDirectory, { recursive: true });

    const taskRun = YAML.parse(TEMPLATE) as Record<string, unknown>;
    taskRun.id = 'TASK-999-002';
    taskRun.title = 'Close an auth task';
    taskRun.description = 'Close an auth task and persist completion evidence for future runs.';
    taskRun.required_skills = ['auth-safety'];
    taskRun.evidence = {
      prior_lessons_reviewed: ['LESSON-001'],
      skills_loaded: ['auth-safety'],
      status: 'passed',
      summary: 'Completed the auth-safe change with evidence.',
      files_changed: ['apps/api/src/auth.ts'],
      commands_run: ['pnpm test:web:e2e'],
      checks: { lint: 'passed', typecheck: 'passed', test_unit: 'passed' },
      reviews: { review_impacted_code: 'passed', verify_assumptions: 'passed' },
      assumptions_verified: ['Tenant middleware still guards protected pages.'],
      mistakes_observed: [],
      lessons_captured: ['LESSON-001'],
      new_or_updated_rules: [],
      future_checks_required: ['Re-run web E2E for protected pages on related auth changes.'],
      recurrence_risk: 'low',
      residual_risks: []
    };
    await writeFile(taskFile, YAML.stringify(taskRun), 'utf8');

    const result = await closeTaskRun({
      repoRoot,
      taskRef: taskFile
    });

    const closedTask = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    const evidenceSnapshot = YAML.parse(await readFile(result.evidenceFile, 'utf8')) as Record<
      string,
      unknown
    >;

    assert.equal(closedTask.status, 'done');
    assert.equal(evidenceSnapshot.task_id, 'TASK-999-002');
    assert.equal((evidenceSnapshot.evidence as Record<string, unknown>).status, 'passed');
  });

  it('backfills request context when closing a legacy task run', async () => {
    const repoRoot = await createRepoFixture();
    const taskFile = path.join(
      repoRoot,
      '.agents',
      'tasks',
      'runs',
      '2026',
      '03',
      '12',
      'TASK-999-005',
      'task.yaml'
    );
    const taskDirectory = path.dirname(taskFile);
    await mkdir(taskDirectory, { recursive: true });

    const taskRun = YAML.parse(LEGACY_TEMPLATE) as Record<string, unknown>;
    taskRun.id = 'TASK-999-005';
    taskRun.title = 'Close a legacy task';
    taskRun.description = 'Close a legacy task run created before request intake normalization.';
    taskRun.evidence = {
      prior_lessons_reviewed: [],
      status: 'passed',
      summary: 'Closed a legacy task after backfilling intake context.',
      files_changed: ['scripts/agentic/task-runtime.ts'],
      commands_run: ['pnpm test:agentic'],
      checks: { lint: 'passed', typecheck: 'passed', test_unit: 'passed' },
      reviews: { review_impacted_code: 'passed', verify_assumptions: 'passed' },
      assumptions_verified: ['Legacy task runs can still close.'],
      mistakes_observed: [],
      lessons_captured: [],
      new_or_updated_rules: [],
      future_checks_required: [],
      recurrence_risk: 'low',
      residual_risks: []
    };
    await writeFile(taskFile, YAML.stringify(taskRun), 'utf8');

    await closeTaskRun({
      repoRoot,
      taskRef: taskFile
    });

    const closedTask = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(closedTask.request_context, {
      original_request: 'Close a legacy task',
      normalized_request: 'Close a legacy task',
      improvement_mode: 'none',
      missing_information: [],
      execution_brief: [
        'Preserve the original request text.',
        'Normalize only when it improves execution quality or surfaces missing constraints.'
      ]
    });
  });

  it('fails closure when claimed lessons are missing from the memory catalog', async () => {
    const repoRoot = await createRepoFixture();
    const taskFile = path.join(
      repoRoot,
      '.agents',
      'tasks',
      'runs',
      '2026',
      '03',
      '12',
      'TASK-999-003',
      'task.yaml'
    );
    const taskDirectory = path.dirname(taskFile);
    await mkdir(taskDirectory, { recursive: true });

    const taskRun = YAML.parse(TEMPLATE) as Record<string, unknown>;
    taskRun.id = 'TASK-999-003';
    taskRun.title = 'Reject missing lesson references';
    taskRun.description =
      'Reject closure when lessons were claimed but never stored in the shared memory catalog.';
    taskRun.evidence = {
      prior_lessons_reviewed: [],
      status: 'passed',
      summary: 'Tried to close without updating the lesson catalog.',
      files_changed: ['scripts/agentic/task-runtime.ts'],
      commands_run: ['pnpm test:agentic'],
      checks: { lint: 'passed', typecheck: 'passed', test_unit: 'passed' },
      reviews: { review_impacted_code: 'passed', verify_assumptions: 'passed' },
      assumptions_verified: [],
      mistakes_observed: ['A new lesson was discovered.'],
      lessons_captured: ['LESSON-999'],
      new_or_updated_rules: [],
      future_checks_required: [],
      recurrence_risk: 'medium',
      residual_risks: []
    };
    await writeFile(taskFile, YAML.stringify(taskRun), 'utf8');

    await assert.rejects(
      () =>
        closeTaskRun({
          repoRoot,
          taskRef: taskFile
        }),
      /references uncaptured lessons/
    );
  });

  it('rejects empty or incomplete completion evidence', async () => {
    const repoRoot = await createRepoFixture();
    const taskFile = path.join(
      repoRoot,
      '.agents',
      'tasks',
      'runs',
      '2026',
      '03',
      '12',
      'TASK-999-006',
      'task.yaml'
    );
    await mkdir(path.dirname(taskFile), { recursive: true });
    const taskRun = YAML.parse(TEMPLATE) as Record<string, unknown>;
    taskRun.id = 'TASK-999-006';
    taskRun.evidence = {
      prior_lessons_reviewed: [],
      status: 'passed',
      summary: 'Looks done',
      files_changed: [],
      commands_run: [],
      checks: {},
      reviews: {},
      assumptions_verified: [],
      mistakes_observed: [],
      lessons_captured: [],
      new_or_updated_rules: [],
      future_checks_required: [],
      recurrence_risk: 'low',
      residual_risks: []
    };
    await writeFile(taskFile, YAML.stringify(taskRun), 'utf8');

    await assert.rejects(
      () => closeTaskRun({ repoRoot, taskRef: taskFile }),
      /must be an array|status map|must not be empty/
    );
  });

  it('rejects task references outside the repository runs directory', async () => {
    const repoRoot = await createRepoFixture();
    await assert.rejects(
      () => closeTaskRun({ repoRoot, taskRef: path.join(os.tmpdir(), 'outside-task.yaml') }),
      /beneath .agents\/tasks\/runs/
    );
  });

  it('does not replace the default execution brief when the CLI flag is omitted', async () => {
    const repoRoot = await createRepoFixture();
    const taskFile = await createTaskRun({ repoRoot, id: 'TASK-999-007', title: 'Keep defaults' });
    const created = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, any>;
    assert.equal(created.request_context.execution_brief.length, 2);
  });

  it('rejects duplicate task ids instead of overwriting task history', async () => {
    const repoRoot = await createRepoFixture();
    await createTaskRun({ repoRoot, id: 'TASK-999-008', title: 'First task' });
    await assert.rejects(
      () => createTaskRun({ repoRoot, id: 'TASK-999-008', title: 'Second task' }),
      /already exists/
    );
  });

  it('rejects closure while a dependency is incomplete', async () => {
    const repoRoot = await createRepoFixture();
    const dependency = await createTaskRun({ repoRoot, id: 'TASK-999-009', title: 'Dependency' });
    const taskFile = await createTaskRun({
      repoRoot,
      id: 'TASK-999-010',
      title: 'Dependent task'
    });
    const taskRun = YAML.parse(await readFile(taskFile, 'utf8')) as Record<string, unknown>;
    taskRun.dependencies = ['TASK-999-009'];
    await writeFile(taskFile, YAML.stringify(taskRun), 'utf8');
    await assert.rejects(
      () => closeTaskRun({ repoRoot, taskRef: taskFile }),
      /dependency TASK-999-009 is todo/
    );
    assert.ok(dependency.endsWith('TASK-999-009/task.yaml'));
  });

  it('rejects unknown CLI flags instead of silently dropping user intent', () => {
    assert.throws(() => parseCliArgs(['--risk-are', 'security']), /Unknown CLI flag/);
  });
});
