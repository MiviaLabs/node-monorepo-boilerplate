#!/usr/bin/env tsx

import {
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';

import YAML from 'yaml';

type TaskType = 'research' | 'planning' | 'implementation' | 'review' | 'validation';
type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
type EvidenceStatus = 'passed' | 'failed' | 'blocked';

type TaskRun = {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  owner_agent: string;
  preferred_provider: string | null;
  description: string;
  request_context?: {
    original_request: string;
    normalized_request: string;
    improvement_mode: 'none' | 'normalized' | 'clarification_required';
    missing_information: string[];
    execution_brief: string[];
  };
  acceptance_criteria: string[];
  risk_areas: string[];
  prior_lessons_reviewed: string[];
  preflight_checks: string[];
  memory_reference?: string;
  avoid_repeat_mistakes: string[];
  files: {
    create: string[];
    modify: string[];
    delete: string[];
  };
  dependencies: string[];
  required_checks: string[];
  required_reviews: string[];
  required_skills?: string[];
  required_e2e?: boolean;
  evidence: Record<string, unknown>;
};

type CompletionContract = {
  required: string[];
};

type Lesson = {
  id: string;
  required_prevention?: string[];
};

type LessonsCatalog = {
  lessons: Lesson[];
};

type RiskPattern = {
  risk_areas: string[];
  required_lessons?: string[];
  required_reviews?: string[];
  required_checks?: string[];
};

type RiskCatalog = {
  risk_patterns: RiskPattern[];
};

type SkillDefinition = {
  name: string;
  risk_areas?: string[];
  required_checks?: string[];
  required_reviews?: string[];
  required_e2e?: boolean;
};

type SkillsCatalog = {
  skills?: SkillDefinition[];
};

export type CreateTaskRunInput = {
  repoRoot: string;
  id: string;
  title: string;
  type?: TaskType;
  ownerAgent?: string;
  preferredProvider?: string | null;
  description?: string;
  riskAreas?: string[];
  originalRequest?: string;
  normalizedRequest?: string;
  improvementMode?: 'none' | 'normalized' | 'clarification_required';
  missingInformation?: string[];
  executionBrief?: string[];
};

export type CloseTaskRunInput = {
  repoRoot: string;
  taskRef: string;
};

export type CloseTaskRunResult = {
  taskFile: string;
  evidenceFile: string;
  status: EvidenceStatus;
};

type ParsedArgs = {
  flags: Map<string, string[]>;
  positionals: string[];
};

const TASK_ID_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const DEFAULT_OWNER_AGENT = 'backend-implementer';
const DEFAULT_TASK_TYPE: TaskType = 'implementation';
const DEFAULT_PROVIDER = 'codex';
const DEFAULT_EXECUTION_BRIEF = [
  'Preserve the original request text.',
  'Normalize only when it improves execution quality or surfaces missing constraints.'
];
const ALLOWED_CLI_FLAGS = new Set([
  'id',
  'title',
  'type',
  'owner-agent',
  'provider',
  'description',
  'risk-area',
  'original-request',
  'normalized-request',
  'improvement-mode',
  'missing-information',
  'execution-brief',
  'task'
]);
const ALLOWED_IMPROVEMENT_MODES = new Set(['none', 'normalized', 'clarification_required']);
const ALLOWED_RISK_AREAS = new Set([
  'auth',
  'audit',
  'api-contracts',
  'backend',
  'admin',
  'admin-auth',
  'admin-ui',
  'compliance',
  'contract',
  'cqrs',
  'dashboard',
  'dashboard-state',
  'session',
  'tenant-routing',
  'tenant-safety',
  'protected-flow',
  'api',
  'data',
  'database',
  'db-read-models',
  'design-system',
  'migration',
  'queue',
  'jobs',
  'reliability',
  'routing',
  'ui',
  'testing',
  'regression',
  'docs',
  'documentation',
  'config',
  'security',
  'performance',
  'latency',
  'cache',
  'storage',
  'upload',
  'tracing',
  'web',
  'frontend',
  'multi-tenancy',
  'events',
  'event-replay',
  'observability',
  'integrations',
  'packages',
  'privacy',
  'reporting',
  'react',
  'nestjs',
  'iam'
]);
const ALLOWED_REQUIRED_CHECKS = new Set([
  'lint',
  'typecheck',
  'test_unit',
  'test_integration',
  'test_e2e',
  'static_analysis',
  'review_scheduler_retries'
]);
const ALLOWED_REQUIRED_REVIEWS = new Set([
  'review_impacted_code',
  'verify_assumptions',
  'review_audit_decisions'
]);
const ALLOWED_OWNER_AGENTS = new Set([
  'orchestrator',
  'code-explorer',
  'pattern-matcher',
  'dependency-analyzer',
  'planner',
  'backend-implementer',
  'frontend-implementer',
  'test-implementer',
  'reviewer',
  'test-analyzer',
  'gate-runner',
  'api-auth-implementer',
  'api-cqrs-reviewer',
  'frontend-auth-flow-implementer',
  'runtime-alignment-maintainer'
]);
const ALLOWED_PROVIDERS = new Set(['codex', 'claude', 'gemini', 'github-copilot']);

function ensureArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function getRequestContext(taskRun: TaskRun): NonNullable<TaskRun['request_context']> {
  return {
    original_request: taskRun.request_context?.original_request ?? taskRun.title,
    normalized_request:
      taskRun.request_context?.normalized_request ??
      taskRun.request_context?.original_request ??
      taskRun.title,
    improvement_mode: taskRun.request_context?.improvement_mode ?? 'none',
    missing_information: dedupe(taskRun.request_context?.missing_information ?? []),
    execution_brief: dedupe(taskRun.request_context?.execution_brief ?? DEFAULT_EXECUTION_BRIEF)
  };
}

function toTaskStatus(status: EvidenceStatus): TaskStatus {
  if (status === 'passed') {
    return 'done';
  }

  return 'blocked';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function valueSatisfiesRequirement(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (typeof value === 'object') {
    return value !== null && Object.keys(value).length > 0;
  }

  return value !== null && value !== undefined;
}

function requireStringArray(
  value: unknown,
  field: string,
  taskId: string,
  allowEmpty = true
): string[] {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    throw new Error(`Task ${taskId} evidence.${field} must be an array of non-empty strings.`);
  }

  if (!allowEmpty && value.length === 0) {
    throw new Error(`Task ${taskId} evidence.${field} must not be empty.`);
  }

  return value;
}

function requireStatusMap(value: unknown, field: string, taskId: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Task ${taskId} evidence.${field} must be a non-empty status map.`);
  }

  const entries = Object.entries(value);
  if (
    entries.length === 0 ||
    entries.some(([, status]) => !['passed', 'failed', 'skipped'].includes(String(status)))
  ) {
    throw new Error(
      `Task ${taskId} evidence.${field} must contain only passed, failed, or skipped statuses.`
    );
  }

  return Object.fromEntries(entries.map(([key, status]) => [key, String(status)]));
}

function assertEvidenceMatchesTask(taskRun: TaskRun, evidence: Record<string, unknown>): void {
  for (const field of [
    'prior_lessons_reviewed',
    'files_changed',
    'commands_run',
    'assumptions_verified',
    'mistakes_observed',
    'lessons_captured',
    'new_or_updated_rules',
    'future_checks_required',
    'residual_risks'
  ]) {
    requireStringArray(evidence[field], field, taskRun.id);
  }

  requireStringArray(evidence.commands_run, 'commands_run', taskRun.id, false);
  requireStringArray(evidence.files_changed, 'files_changed', taskRun.id, false);
  requireStatusMap(evidence.checks, 'checks', taskRun.id);
  requireStatusMap(evidence.reviews, 'reviews', taskRun.id);

  const checks = evidence.checks as Record<string, string>;
  const reviews = evidence.reviews as Record<string, string>;
  const missingChecks = taskRun.required_checks.filter((check) => checks[check] === undefined);
  const missingReviews = taskRun.required_reviews.filter((review) => reviews[review] === undefined);

  if (missingChecks.length > 0) {
    throw new Error(
      `Task ${taskRun.id} is missing required check evidence: ${missingChecks.join(', ')}.`
    );
  }
  if (missingReviews.length > 0) {
    throw new Error(
      `Task ${taskRun.id} is missing required review evidence: ${missingReviews.join(', ')}.`
    );
  }

  if (evidence.status === 'passed') {
    const failedChecks = taskRun.required_checks.filter((check) => checks[check] !== 'passed');
    const failedReviews = taskRun.required_reviews.filter((review) => reviews[review] !== 'passed');
    if (failedChecks.length > 0 || failedReviews.length > 0) {
      throw new Error(
        `Task ${taskRun.id} cannot pass with failed or skipped required checks/reviews.`
      );
    }
  }

  if (taskRun.required_e2e === true && checks.test_e2e !== 'passed') {
    throw new Error(`Task ${taskRun.id} requires test_e2e evidence with status passed.`);
  }

  const requiredLessons = new Set(taskRun.prior_lessons_reviewed);
  const reviewedLessons = new Set(
    requireStringArray(evidence.prior_lessons_reviewed, 'prior_lessons_reviewed', taskRun.id)
  );
  const missingLessons = [...requiredLessons].filter((lesson) => !reviewedLessons.has(lesson));
  if (missingLessons.length > 0) {
    throw new Error(
      `Task ${taskRun.id} did not record all required prior lessons: ${missingLessons.join(', ')}.`
    );
  }

  if (taskRun.required_skills && taskRun.required_skills.length > 0) {
    const loadedSkills = new Set(
      requireStringArray(evidence.skills_loaded, 'skills_loaded', taskRun.id)
    );
    const missingSkills = taskRun.required_skills.filter((skill) => !loadedSkills.has(skill));
    if (missingSkills.length > 0) {
      throw new Error(
        `Task ${taskRun.id} did not record all required skills: ${missingSkills.join(', ')}.`
      );
    }
  }

  if (
    (evidence.status === 'failed' || evidence.status === 'blocked') &&
    !valueSatisfiesRequirement(evidence.blockers)
  ) {
    throw new Error(
      `Task ${taskRun.id} must record blockers when closure status is ${String(evidence.status)}.`
    );
  }
}

function assertEveryValueAllowed(
  values: string[],
  allowedValues: ReadonlySet<string>,
  field: string,
  taskId: string
): void {
  const invalid = values.filter((value) => !allowedValues.has(value));

  if (invalid.length > 0) {
    throw new Error(
      `Task ${taskId} has unsupported ${field} values: ${invalid.join(', ')}. Update .agents/tasks/schema/task.schema.yaml and task-runtime.ts together.`
    );
  }
}

function validateTaskRunShape(taskRun: TaskRun): void {
  taskRun.request_context = getRequestContext(taskRun);

  if (!TASK_ID_PATTERN.test(taskRun.id)) {
    throw new Error(
      `Task ${taskRun.id} does not satisfy the task id contract. Expected only alphanumeric segments separated by hyphens.`
    );
  }

  for (const dependency of taskRun.dependencies) {
    if (!TASK_ID_PATTERN.test(dependency)) {
      throw new Error(
        `Task ${taskRun.id} has invalid dependency "${dependency}". Dependencies must use the same task id contract.`
      );
    }
  }

  assertEveryValueAllowed(taskRun.risk_areas, ALLOWED_RISK_AREAS, 'risk_areas', taskRun.id);
  assertEveryValueAllowed(
    taskRun.required_checks,
    ALLOWED_REQUIRED_CHECKS,
    'required_checks',
    taskRun.id
  );
  if (!ALLOWED_OWNER_AGENTS.has(taskRun.owner_agent)) {
    throw new Error(`Task ${taskRun.id} has unsupported owner_agent "${taskRun.owner_agent}".`);
  }
  if (taskRun.preferred_provider !== null && !ALLOWED_PROVIDERS.has(taskRun.preferred_provider)) {
    throw new Error(
      `Task ${taskRun.id} has unsupported preferred_provider "${taskRun.preferred_provider}".`
    );
  }
  if (taskRun.preferred_provider === 'gemini' && taskRun.type !== 'research') {
    throw new Error('Gemini is restricted to read-only research tasks.');
  }
  assertEveryValueAllowed(
    taskRun.required_reviews,
    ALLOWED_REQUIRED_REVIEWS,
    'required_reviews',
    taskRun.id
  );

  if (taskRun.required_e2e === true && !taskRun.required_checks.includes('test_e2e')) {
    throw new Error(
      `Task ${taskRun.id} sets required_e2e=true without including test_e2e in required_checks.`
    );
  }

  if (!ALLOWED_IMPROVEMENT_MODES.has(taskRun.request_context.improvement_mode)) {
    throw new Error(
      `Task ${taskRun.id} has unsupported request_context.improvement_mode "${taskRun.request_context.improvement_mode}".`
    );
  }

  if (!isNonEmptyString(taskRun.request_context.original_request)) {
    throw new Error(
      `Task ${taskRun.id} must preserve a non-empty request_context.original_request.`
    );
  }

  if (!isNonEmptyString(taskRun.request_context.normalized_request)) {
    throw new Error(
      `Task ${taskRun.id} must define a non-empty request_context.normalized_request.`
    );
  }
  if (taskRun.required_skills?.some((skill) => !isNonEmptyString(skill))) {
    throw new Error(`Task ${taskRun.id} required_skills must contain non-empty names.`);
  }
}

async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return YAML.parse(raw) as T;
}

async function writeYamlFile(filePath: string, value: unknown): Promise<void> {
  const rendered = YAML.stringify(value, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0
  });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, rendered, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, filePath);
  } catch (error) {
    try {
      await rm(temporaryPath, { force: true });
    } catch {
      // The temporary file may not have been created; preserve the original error.
    }
    throw error;
  }
}

async function writeYamlFileExclusive(filePath: string, value: unknown): Promise<void> {
  const rendered = YAML.stringify(value, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0
  });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, rendered, { encoding: 'utf8', flag: 'wx' });
  try {
    await link(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function collectFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return collectFiles(fullPath);
        }

        return entry.isFile() ? [fullPath] : [];
      })
    );

    return files.flat();
  } catch {
    return [];
  }
}

async function assertNoSymlinkComponents(rootPath: string, targetPath: string): Promise<void> {
  const root = await realpath(rootPath);
  const relative = path.relative(root, targetPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Task path escapes the runs directory: "${targetPath}".`);
  }

  let currentPath = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, component);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`Task path cannot traverse a symlink: "${currentPath}".`);
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('ENOENT')) {
        throw error;
      }
      break;
    }
  }
}

export async function findTaskFile(repoRoot: string, taskRef: string): Promise<string> {
  const runsRoot = path.resolve(repoRoot, '.agents', 'tasks', 'runs');
  const directPath = path.resolve(repoRoot, taskRef);
  const relativeToRuns = path.relative(runsRoot, directPath);
  const isInsideRuns =
    relativeToRuns === '' || (!relativeToRuns.startsWith('..') && !path.isAbsolute(relativeToRuns));

  if (!isInsideRuns) {
    if (path.isAbsolute(taskRef) || taskRef.includes('/') || taskRef.includes('\\')) {
      throw new Error(`Task reference must resolve beneath .agents/tasks/runs: "${taskRef}".`);
    }
  }

  try {
    if (!isInsideRuns) throw new Error('not a task path');
    await assertNoSymlinkComponents(repoRoot, directPath);
    const fileStat = await lstat(directPath);
    if (fileStat.isFile()) {
      return directPath;
    }
  } catch {
    // Fall through to task id lookup.
  }

  await assertNoSymlinkComponents(repoRoot, runsRoot);
  const files = await collectFiles(runsRoot);
  const matches = files.filter(
    (filePath) =>
      path.basename(filePath) === 'task.yaml' && path.basename(path.dirname(filePath)) === taskRef
  );

  if (matches.length === 0) {
    throw new Error(`Task run not found for reference "${taskRef}".`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple task runs matched "${taskRef}". Use an explicit file path.`);
  }

  return matches[0];
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const key = token.slice(2);
    if (!ALLOWED_CLI_FLAGS.has(key)) {
      throw new Error(`Unknown CLI flag --${key}.`);
    }
    const next = argv[index + 1];
    const value = next && !next.startsWith('--') ? next : 'true';

    flags.set(key, [...(flags.get(key) ?? []), value]);

    if (value !== 'true') {
      index += 1;
    }
  }

  if (positionals.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positionals.join(', ')}.`);
  }

  return { flags, positionals };
}

export function getRequiredFlag(args: ParsedArgs, name: string): string {
  const values = args.flags.get(name);
  const value = values?.at(-1);

  if (!isNonEmptyString(value)) {
    throw new Error(`Missing required flag --${name}.`);
  }

  return value;
}

export function getOptionalFlag(args: ParsedArgs, name: string): string | undefined {
  const values = args.flags.get(name);
  const value = values?.at(-1);

  return isNonEmptyString(value) ? value : undefined;
}

export function getListFlag(args: ParsedArgs, name: string): string[] {
  const values = args.flags.get(name) ?? [];
  return dedupe(
    values
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export async function createTaskRun(input: CreateTaskRunInput): Promise<string> {
  const repoRoot = path.resolve(input.repoRoot);
  const templatePath = path.join(repoRoot, '.agents', 'tasks', 'templates', 'task.template.yaml');
  const lessonsPath = path.join(repoRoot, '.agents', 'memories', 'lessons-learned.yaml');
  const riskPatternsPath = path.join(repoRoot, '.agents', 'memories', 'risk-patterns.yaml');
  const memoryPath = path.join(repoRoot, '.agents', 'memories', 'MEMORY.md');
  const skillsPath = path.join(repoRoot, '.agents', 'registry', 'skills.yaml');

  const template = await readYamlFile<TaskRun>(templatePath);
  const memory = await readFile(memoryPath, 'utf8');
  if (!isNonEmptyString(memory)) {
    throw new Error('Repository memory is missing or empty at .agents/memories/MEMORY.md.');
  }
  const lessonsCatalog = await readYamlFile<LessonsCatalog>(lessonsPath);
  const riskCatalog = await readYamlFile<RiskCatalog>(riskPatternsPath);
  const skillsCatalog = (await pathExists(skillsPath))
    ? await readYamlFile<SkillsCatalog>(skillsPath)
    : { skills: [] };

  const riskAreas = dedupe(input.riskAreas ?? []);
  const matchingPatterns = riskCatalog.risk_patterns.filter((pattern) =>
    pattern.risk_areas.some((riskArea) => riskAreas.includes(riskArea))
  );

  const requiredLessons = dedupe(
    matchingPatterns.flatMap((pattern) => ensureArray(pattern.required_lessons))
  );
  const lessonMap = new Map(lessonsCatalog.lessons.map((lesson) => [lesson.id, lesson]));
  const avoidRepeatMistakes = dedupe(
    requiredLessons.flatMap((lessonId) => lessonMap.get(lessonId)?.required_prevention ?? [])
  );
  let requiredChecks = dedupe([
    ...ensureArray(template.required_checks),
    ...matchingPatterns.flatMap((pattern) => ensureArray(pattern.required_checks))
  ]);
  let requiredReviews = dedupe([
    ...ensureArray(template.required_reviews),
    ...matchingPatterns.flatMap((pattern) => ensureArray(pattern.required_reviews))
  ]);
  const matchingSkills = (skillsCatalog.skills ?? []).filter((skill) =>
    ensureArray(skill.risk_areas).some((riskArea) => riskAreas.includes(riskArea))
  );
  const requiredSkills = dedupe(matchingSkills.map((skill) => skill.name));
  requiredChecks.push(...matchingSkills.flatMap((skill) => ensureArray(skill.required_checks)));
  requiredReviews.push(...matchingSkills.flatMap((skill) => ensureArray(skill.required_reviews)));
  requiredChecks = dedupe(requiredChecks);
  requiredReviews = dedupe(requiredReviews);
  const originalRequest = input.originalRequest ?? input.title;
  const normalizedRequest = input.normalizedRequest ?? originalRequest;
  const improvementMode =
    input.improvementMode ?? (normalizedRequest !== originalRequest ? 'normalized' : 'none');

  const now = new Date();
  const existingTaskFiles = await collectFiles(path.join(repoRoot, '.agents', 'tasks', 'runs'));
  if (
    existingTaskFiles.some(
      (filePath) =>
        path.basename(filePath) === 'task.yaml' &&
        path.basename(path.dirname(filePath)) === input.id
    )
  ) {
    throw new Error(`Task ${input.id} already exists. Choose a unique task id.`);
  }

  const taskDirectory = path.join(
    repoRoot,
    '.agents',
    'tasks',
    'runs',
    `${now.getUTCFullYear()}`,
    `${`${now.getUTCMonth() + 1}`.padStart(2, '0')}`,
    `${`${now.getUTCDate()}`.padStart(2, '0')}`,
    input.id
  );

  await assertNoSymlinkComponents(repoRoot, taskDirectory);
  await mkdir(taskDirectory, { recursive: true });

  const taskRun: TaskRun = {
    ...template,
    id: input.id,
    title: input.title,
    type: input.type ?? DEFAULT_TASK_TYPE,
    status: 'todo',
    owner_agent: input.ownerAgent ?? DEFAULT_OWNER_AGENT,
    preferred_provider: input.preferredProvider ?? DEFAULT_PROVIDER,
    description:
      input.description ??
      `Implement ${input.title} and capture the required evidence, checks, and lessons before closure.`,
    request_context: {
      original_request: originalRequest,
      normalized_request: normalizedRequest,
      improvement_mode: improvementMode,
      missing_information: dedupe(input.missingInformation ?? []),
      execution_brief: dedupe(input.executionBrief ?? DEFAULT_EXECUTION_BRIEF)
    },
    risk_areas: riskAreas,
    prior_lessons_reviewed: requiredLessons,
    preflight_checks: [
      'Read .agents/memories/MEMORY.md before edits begin.',
      ...requiredLessons.map((lessonId) => `Review ${lessonId} before edits begin.`)
    ],
    memory_reference: '.agents/memories/MEMORY.md',
    avoid_repeat_mistakes: avoidRepeatMistakes,
    required_checks: requiredChecks,
    required_reviews: requiredReviews,
    required_skills: requiredSkills,
    required_e2e:
      requiredChecks.includes('test_e2e') ||
      matchingSkills.some((skill) => skill.required_e2e === true)
        ? true
        : template.required_e2e
  };

  validateTaskRunShape(taskRun);

  const taskFile = path.join(taskDirectory, 'task.yaml');
  try {
    await stat(taskFile);
    throw new Error(`Task ${input.id} already exists. Choose a unique task id.`);
  } catch (error) {
    if (error instanceof Error && !error.message.includes('ENOENT')) throw error;
  }
  await writeYamlFile(taskFile, taskRun);

  return taskFile;
}

export async function closeTaskRun(input: CloseTaskRunInput): Promise<CloseTaskRunResult> {
  const repoRoot = path.resolve(input.repoRoot);
  const taskFile = await findTaskFile(repoRoot, input.taskRef);
  const completionContractPath = path.join(
    repoRoot,
    '.agents',
    'governance',
    'completion-contract.yaml'
  );
  const lessonsPath = path.join(repoRoot, '.agents', 'memories', 'lessons-learned.yaml');

  const completionContract = await readYamlFile<CompletionContract>(completionContractPath);
  const lessonsCatalog = await readYamlFile<LessonsCatalog>(lessonsPath);
  const taskRun = await readYamlFile<TaskRun>(taskFile);
  validateTaskRunShape(taskRun);

  for (const dependency of taskRun.dependencies) {
    const dependencyFile = await findTaskFile(repoRoot, dependency);
    const dependencyRun = await readYamlFile<TaskRun>(dependencyFile);
    if (dependencyRun.status !== 'done') {
      throw new Error(
        `Task ${taskRun.id} cannot close while dependency ${dependency} is ${String(dependencyRun.status)}.`
      );
    }
    const dependencyEvidence = path.join(path.dirname(dependencyFile), 'evidence.yaml');
    try {
      const dependencySnapshot = await readYamlFile<{
        task_id?: string;
        source_task?: string;
        evidence?: Record<string, unknown>;
      }>(dependencyEvidence);
      if (dependencySnapshot.task_id !== dependencyRun.id || !dependencySnapshot.evidence) {
        throw new Error('identity mismatch');
      }
      assertEvidenceMatchesTask(dependencyRun, dependencySnapshot.evidence);
      if (dependencySnapshot.evidence.status !== 'passed') {
        throw new Error('evidence is not passed');
      }
    } catch {
      throw new Error(
        `Task ${taskRun.id} cannot trust dependency ${dependency} without valid passed evidence.`
      );
    }
  }

  const evidence = ensureRecord(taskRun.evidence);

  for (const field of completionContract.required) {
    if (
      [
        'prior_lessons_reviewed',
        'files_changed',
        'commands_run',
        'checks',
        'reviews',
        'assumptions_verified',
        'mistakes_observed',
        'lessons_captured',
        'new_or_updated_rules',
        'future_checks_required',
        'residual_risks'
      ].includes(field)
    ) {
      continue;
    }
    if (!valueSatisfiesRequirement(evidence[field])) {
      throw new Error(`Task ${taskRun.id} is missing completion evidence field "${field}".`);
    }
  }

  const status = evidence.status;
  if (status !== 'passed' && status !== 'failed' && status !== 'blocked') {
    throw new Error(`Task ${taskRun.id} has invalid evidence.status "${String(status)}".`);
  }

  assertEvidenceMatchesTask(taskRun, evidence);

  const lessonIds = new Set(lessonsCatalog.lessons.map((lesson) => lesson.id));
  const capturedLessons = ensureArray(evidence.lessons_captured);
  const missingLessons = capturedLessons.filter((lessonId) => !lessonIds.has(lessonId));

  if (missingLessons.length > 0) {
    throw new Error(
      `Task ${taskRun.id} references uncaptured lessons: ${missingLessons.join(', ')}. Update .agents/memories/lessons-learned.yaml before closure.`
    );
  }

  const evidenceDirectory = path.dirname(taskFile);
  await mkdir(evidenceDirectory, { recursive: true });
  const evidenceFile = path.join(evidenceDirectory, 'evidence.yaml');
  try {
    await stat(evidenceFile);
    const existingSnapshot = await readYamlFile<{
      task_id?: string;
      evidence?: Record<string, unknown>;
    }>(evidenceFile);
    if (existingSnapshot.task_id !== taskRun.id || !existingSnapshot.evidence) {
      throw new Error(`Evidence for task ${taskRun.id} already exists; closure is immutable.`);
    }
    assertEvidenceMatchesTask(taskRun, existingSnapshot.evidence);
    const existingStatus = existingSnapshot.evidence.status;
    if (
      existingStatus !== 'passed' &&
      existingStatus !== 'failed' &&
      existingStatus !== 'blocked'
    ) {
      throw new Error(`Evidence for task ${taskRun.id} has an invalid status.`);
    }
    taskRun.status = toTaskStatus(existingStatus);
    await writeYamlFile(taskFile, taskRun);
    return { taskFile, evidenceFile, status: existingStatus };
  } catch (error) {
    if (error instanceof Error && !error.message.includes('ENOENT')) {
      throw error;
    }
  }

  await writeYamlFileExclusive(evidenceFile, {
    task_id: taskRun.id,
    source_task: path.relative(repoRoot, taskFile),
    closed_at: new Date().toISOString(),
    evidence
  });
  taskRun.status = toTaskStatus(status);
  await writeYamlFile(taskFile, taskRun);

  return {
    taskFile,
    evidenceFile,
    status
  };
}
