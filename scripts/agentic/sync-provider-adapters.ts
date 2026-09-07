#!/usr/bin/env tsx

import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import YAML from 'yaml';

type AgentDefinition = {
  name: string;
  kind: string;
  description: string;
  capabilities?: string[];
  provider_aliases?: Record<string, string>;
};

type SkillDefinition = {
  name: string;
  category: string;
  description: string;
  canonical_path: string;
  provider_aliases?: Record<string, string>;
  mirror_paths?: Record<string, string[]>;
  risk_areas?: string[];
  lifecycle_phases?: string[];
  required_checks?: string[];
  required_reviews?: string[];
  required_e2e?: boolean;
  conflicts_with?: string[];
  replaces?: string[];
};

type SkillsRegistry = {
  operations?: Array<Record<string, unknown>>;
  skills?: SkillDefinition[];
};

type CustomAgentDefinition = {
  name: string;
  description: string;
  canonical_prompt_path: string;
  tools?: string[];
  provider_aliases?: Record<string, string>;
  mirror_paths?: Record<string, string[]>;
  required_skills?: string[];
  risk_areas?: string[];
};

type ProviderDefinition = {
  name: string;
  category: string;
  display_name?: string;
  root_adapter_path?: string;
  agent_alias_dir?: string;
  agent_file_suffix?: string;
  strengths?: string[];
  default_roles?: string[];
  instruction_entrypoints?: string[];
  tooling_expectations?: string[];
  notes?: string[];
};

type SyncResult = {
  files: string[];
};

const ALLOWED_PROVIDERS = new Set(['codex', 'claude', 'gemini', 'github-copilot']);
const ALLOWED_ROOT_ADAPTERS = new Set(['CODEX.md', 'CLAUDE.md', '.github/copilot-instructions.md']);
const ALLOWED_AGENT_ALIAS_DIRS = new Set(['.claude/agents', '.github/agents']);

function assertGeneratedTarget(configuredPath: string, kind: string): void {
  const normalized = path.posix.normalize(configuredPath);
  const allowed =
    kind === 'root adapter'
      ? ALLOWED_ROOT_ADAPTERS.has(normalized)
      : kind === 'agent directory'
        ? ALLOWED_AGENT_ALIAS_DIRS.has(normalized)
        : kind === 'skill source'
          ? normalized.startsWith('.agents/skills/') && normalized !== '.agents/skills/'
          : kind === 'skill mirror'
            ? (normalized.startsWith('.claude/skills/') && normalized !== '.claude/skills/') ||
              (normalized.startsWith('.github/skills/') && normalized !== '.github/skills/')
            : (normalized.startsWith('.claude/agents/') && normalized !== '.claude/agents/') ||
              (normalized.startsWith('.github/agents/') && normalized !== '.github/agents/');
  if (!allowed) {
    throw new Error(`Configured ${kind} is not an allowed generated target: "${configuredPath}".`);
  }
}

async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return YAML.parse(raw) as T;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function resolveRepoPath(repoRoot: string, configuredPath: string, label: string): string {
  if (path.isAbsolute(configuredPath)) {
    throw new Error(`${label} must be repository-relative: "${configuredPath}".`);
  }

  const resolvedRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(resolvedRoot, configuredPath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} escapes the repository root: "${configuredPath}".`);
  }

  return resolvedPath;
}

async function assertNoSymlinkEscape(
  repoRoot: string,
  targetPath: string,
  label: string
): Promise<void> {
  const resolvedRoot = await realpath(repoRoot);
  const relative = path.relative(resolvedRoot, targetPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the repository: "${targetPath}".`);
  }

  let currentPath = resolvedRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, component);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(`${label} cannot traverse a symlink: "${currentPath}".`);
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('ENOENT')) {
        throw error;
      }
      break;
    }
  }
}

async function ensureCleanDirectory(directoryPath: string): Promise<void> {
  await rm(directoryPath, { recursive: true, force: true });
  await mkdir(directoryPath, { recursive: true });
}

async function collectDirectoryFiles(rootPath: string, relativeRoot: string): Promise<string[]> {
  if (!(await pathExists(rootPath))) {
    return [];
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return collectDirectoryFiles(fullPath, relativeRoot);
      }

      return [path.relative(relativeRoot, fullPath)];
    })
  );

  return nested.flat();
}

function renderRootAdapter(rootAdapterPath: string): string {
  // Keep provider entrypoints as imports, not generated policy copies. This
  // makes AGENTS.md the only repository-wide instruction authority.
  return rootAdapterPath.startsWith('.github/') ? '@../AGENTS.md\n' : '@AGENTS.md\n';
}

function renderClaudeAgent(agent: AgentDefinition): string {
  const alias = agent.provider_aliases?.claude ?? agent.name;
  const capabilities = (agent.capabilities ?? []).map((value) => `- \`${value}\``).join('\n');

  return `---
name: ${alias}
description: ${agent.description}
---

# ${alias}

This file is generated from \`.agents/registry/agents.yaml\`.

Logical role: \`${agent.name}\`
Kind: \`${agent.kind}\`

## Responsibilities

${capabilities || '- No explicit capabilities listed.'}

## Source of truth

- [AGENTS.md](../../AGENTS.md)
- [.agents/README.md](../../.agents/README.md)
- [.agents/providers/claude.md](../../.agents/providers/claude.md)
- [.agents/governance/routing-policy.yaml](../../.agents/governance/routing-policy.yaml)

Stay within this logical role. Do not invent provider-specific rules that conflict with \`.agents\`.
`;
}

function renderCopilotAgent(agent: AgentDefinition): string {
  const alias = agent.provider_aliases?.['github-copilot'] ?? agent.name;
  const capabilities = (agent.capabilities ?? []).map((value) => `- \`${value}\``).join('\n');

  return `# ${alias}

This custom agent is generated from \`.agents/registry/agents.yaml\`.

Logical role: \`${agent.name}\`
Kind: \`${agent.kind}\`

## Responsibilities

${capabilities || '- No explicit capabilities listed.'}

## Source of truth

- [AGENTS.md](../../AGENTS.md)
- [.agents/README.md](../../.agents/README.md)
- [.agents/providers/github-copilot.md](../../.agents/providers/github-copilot.md)

Stay within this logical role and defer to path-specific instructions when they apply.
`;
}

function renderCustomAgent(
  customAgent: CustomAgentDefinition,
  providerName: string,
  prompt: string
): string {
  const alias = customAgent.provider_aliases?.[providerName] ?? customAgent.name;
  const toolLine = `tools: [${(customAgent.tools ?? []).map((tool) => `'${tool}'`).join(', ')}]\n`;

  return `---
name: ${alias}
description: ${customAgent.description}
${toolLine}---

# ${alias}

${providerName === 'github-copilot' ? 'This custom agent' : 'This specialized agent'} is generated from \`.agents/registry/custom-agents.yaml\` and \`.agents/agents/\`.

${prompt.trim()}

## Source of truth

- [AGENTS.md](../../AGENTS.md)
- [.agents/README.md](../../.agents/README.md)
- [.agents/registry/custom-agents.yaml](../../.agents/registry/custom-agents.yaml)
`;
}

async function copySkillDirectory(
  repoRoot: string,
  sourceRelativePath: string,
  targetRelativePath: string
) {
  const sourcePath = resolveRepoPath(repoRoot, sourceRelativePath, 'Skill source path');
  const targetPath = resolveRepoPath(repoRoot, targetRelativePath, 'Skill mirror path');
  await assertNoSymlinkEscape(repoRoot, sourcePath, 'Skill source path');
  await assertNoSymlinkEscape(repoRoot, targetPath, 'Skill mirror path');

  await rm(targetPath, { recursive: true, force: true });
  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });

  if (targetRelativePath.startsWith('.github/skills/')) {
    const legacySkillPath = path.join(targetPath, 'SKILL.md');
    const githubSkillPath = path.join(targetPath, 'skill.md');
    if (await pathExists(legacySkillPath)) {
      await writeFile(githubSkillPath, await readFile(legacySkillPath, 'utf8'), 'utf8');
    }
  }
}

export async function syncProviderAdapters(repoRoot: string): Promise<SyncResult> {
  const resolvedRoot = path.resolve(repoRoot);
  const agents = await readYamlFile<AgentDefinition[]>(
    path.join(resolvedRoot, '.agents', 'registry', 'agents.yaml')
  );
  const skillsRegistry = await readYamlFile<SkillsRegistry>(
    path.join(resolvedRoot, '.agents', 'registry', 'skills.yaml')
  );
  const providers = await readYamlFile<ProviderDefinition[]>(
    path.join(resolvedRoot, '.agents', 'registry', 'providers.yaml')
  );
  const customAgentsPath = path.join(resolvedRoot, '.agents', 'registry', 'custom-agents.yaml');
  const customAgents = (await pathExists(customAgentsPath))
    ? await readYamlFile<CustomAgentDefinition[]>(customAgentsPath)
    : [];
  const skills = skillsRegistry.skills ?? [];
  const providerNames = new Set(providers.map((provider) => provider.name));
  const skillNames = new Set(skills.map((skill) => skill.name));

  for (const provider of providers) {
    if (!ALLOWED_PROVIDERS.has(provider.name)) {
      throw new Error(`Provider registry contains unsupported provider "${provider.name}".`);
    }
  }

  if (skillNames.size !== skills.length) {
    throw new Error('Skill registry contains duplicate names.');
  }
  if (new Set(agents.map((agent) => agent.name)).size !== agents.length) {
    throw new Error('Agent registry contains duplicate names.');
  }
  if (new Set(customAgents.map((agent) => agent.name)).size !== customAgents.length) {
    throw new Error('Custom-agent registry contains duplicate names.');
  }

  const files: string[] = [];
  const customAgentDirs = [
    ...new Set(
      providers
        .filter((provider) => provider.agent_alias_dir)
        .map((provider) => provider.agent_alias_dir as string)
    )
  ];

  for (const provider of providers) {
    if (provider.root_adapter_path) {
      assertGeneratedTarget(provider.root_adapter_path, 'root adapter');
      resolveRepoPath(resolvedRoot, provider.root_adapter_path, 'Provider root adapter path');
    }
    if (provider.agent_alias_dir) {
      assertGeneratedTarget(provider.agent_alias_dir, 'agent directory');
      resolveRepoPath(resolvedRoot, provider.agent_alias_dir, 'Provider agent alias directory');
    }
  }
  for (const agent of agents) {
    for (const providerName of Object.keys(agent.provider_aliases ?? {})) {
      if (!providers.some((provider) => provider.name === providerName)) {
        throw new Error(`Agent "${agent.name}" references unknown provider "${providerName}".`);
      }
    }
  }
  for (const skill of skills) {
    if (
      skill.provider_aliases &&
      [...Object.keys(skill.provider_aliases)].some((name) => !providerNames.has(name))
    ) {
      throw new Error(`Skill "${skill.name}" references an unknown provider.`);
    }
    assertGeneratedTarget(skill.canonical_path, 'skill source');
    resolveRepoPath(resolvedRoot, skill.canonical_path, `Skill "${skill.name}" canonical path`);
    for (const mirrorPath of Object.values(skill.mirror_paths ?? {}).flat()) {
      if (mirrorPath !== skill.canonical_path) {
        assertGeneratedTarget(mirrorPath, 'skill mirror');
      }
      resolveRepoPath(resolvedRoot, mirrorPath, `Skill "${skill.name}" mirror path`);
    }
  }
  for (const customAgent of customAgents) {
    if (customAgent.tools?.includes('*')) {
      throw new Error(`Custom agent "${customAgent.name}" cannot request wildcard tools.`);
    }
    if (customAgent.tools?.some((tool) => !['read', 'search', 'edit'].includes(tool))) {
      throw new Error(`Custom agent "${customAgent.name}" requests an unsupported tool.`);
    }
    if (customAgent.required_skills?.some((skillName) => !skillNames.has(skillName))) {
      throw new Error(`Custom agent "${customAgent.name}" references an unknown skill.`);
    }
    if (Object.keys(customAgent.mirror_paths ?? {}).some((name) => !providerNames.has(name))) {
      throw new Error(`Custom agent "${customAgent.name}" references an unknown provider.`);
    }
    resolveRepoPath(
      resolvedRoot,
      customAgent.canonical_prompt_path,
      `Custom agent "${customAgent.name}" prompt path`
    );
    for (const mirrorPath of Object.values(customAgent.mirror_paths ?? {}).flat()) {
      assertGeneratedTarget(mirrorPath, 'agent mirror');
      resolveRepoPath(resolvedRoot, mirrorPath, `Custom agent "${customAgent.name}" mirror path`);
    }
  }

  await Promise.all([
    ensureCleanDirectory(path.join(resolvedRoot, '.claude', 'skills')),
    ensureCleanDirectory(path.join(resolvedRoot, '.github', 'skills')),
    ...customAgentDirs.map(async (directory) => {
      const target = resolveRepoPath(resolvedRoot, directory, 'Provider agent alias directory');
      await assertNoSymlinkEscape(resolvedRoot, target, 'Provider agent alias directory');
      return ensureCleanDirectory(target);
    })
  ]);

  const expectedRootAdapters = new Set(
    providers
      .filter((provider) => provider.name !== 'gemini')
      .map((provider) => provider.root_adapter_path ?? `${provider.name.toUpperCase()}.md`)
  );
  for (const rootAdapterPath of ALLOWED_ROOT_ADAPTERS) {
    if (!expectedRootAdapters.has(rootAdapterPath)) {
      await rm(resolveRepoPath(resolvedRoot, rootAdapterPath, 'Stale provider root adapter'), {
        force: true
      });
    }
  }

  for (const provider of providers) {
    if (provider.name === 'gemini') {
      continue;
    }

    const configuredRootAdapterPath =
      provider.root_adapter_path ?? `${provider.name.toUpperCase()}.md`;
    const rootAdapterPath = resolveRepoPath(
      resolvedRoot,
      configuredRootAdapterPath,
      `Provider "${provider.name}" root adapter path`
    );
    await assertNoSymlinkEscape(resolvedRoot, rootAdapterPath, 'Provider root adapter path');
    await mkdir(path.dirname(rootAdapterPath), { recursive: true });
    const rendered = renderRootAdapter(configuredRootAdapterPath);
    await writeFile(rootAdapterPath, rendered, 'utf8');
    files.push(path.relative(resolvedRoot, rootAdapterPath));
  }

  for (const provider of providers) {
    if (!provider.agent_alias_dir) {
      continue;
    }

    const agentDir = resolveRepoPath(
      resolvedRoot,
      provider.agent_alias_dir,
      `Provider "${provider.name}" agent alias directory`
    );
    await ensureCleanDirectory(agentDir);

    for (const agent of agents) {
      const alias = agent.provider_aliases?.[provider.name];
      if (!alias) {
        continue;
      }
      const targetPath = resolveRepoPath(
        resolvedRoot,
        path.relative(
          resolvedRoot,
          path.join(agentDir, `${alias}${provider.agent_file_suffix ?? '.md'}`)
        ),
        `Provider "${provider.name}" agent output path`
      );
      await assertNoSymlinkEscape(resolvedRoot, targetPath, 'Provider agent output path');
      const content =
        provider.name === 'github-copilot' ? renderCopilotAgent(agent) : renderClaudeAgent(agent);
      await writeFile(targetPath, content, 'utf8');
      files.push(path.relative(resolvedRoot, targetPath));
    }
  }

  for (const skill of skills) {
    const mirrors = skill.mirror_paths ?? {};
    for (const mirrorGroup of Object.values(mirrors)) {
      for (const mirrorPath of mirrorGroup) {
        if (mirrorPath === skill.canonical_path) {
          continue;
        }
        await copySkillDirectory(resolvedRoot, skill.canonical_path, mirrorPath);
        files.push(
          ...(await collectDirectoryFiles(path.join(resolvedRoot, mirrorPath), resolvedRoot))
        );
      }
    }
  }

  for (const customAgent of customAgents) {
    const prompt = await readFile(
      resolveRepoPath(
        resolvedRoot,
        customAgent.canonical_prompt_path,
        `Custom agent "${customAgent.name}" prompt path`
      ),
      'utf8'
    );
    const mirrors = customAgent.mirror_paths ?? {};
    for (const [providerName, mirrorGroup] of Object.entries(mirrors)) {
      for (const mirrorPath of mirrorGroup) {
        const targetPath = resolveRepoPath(
          resolvedRoot,
          mirrorPath,
          `Custom agent "${customAgent.name}" mirror path`
        );
        await assertNoSymlinkEscape(resolvedRoot, targetPath, 'Custom agent mirror path');
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, renderCustomAgent(customAgent, providerName, prompt), 'utf8');
        files.push(path.relative(resolvedRoot, targetPath));
      }
    }
  }

  return { files: [...new Set(files)].sort() };
}

const GENERATED_SURFACES = [
  'CODEX.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  '.claude/agents',
  '.claude/skills',
  '.github/agents',
  '.github/skills'
];

async function copyIfPresent(source: string, target: string): Promise<void> {
  if (await pathExists(source)) {
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true });
  }
}

export async function checkProviderAdapters(repoRoot: string): Promise<void> {
  const resolvedRoot = path.resolve(repoRoot);
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-sync-check-'));
  try {
    await copyIfPresent(path.join(resolvedRoot, '.agents'), path.join(stagingRoot, '.agents'));
    for (const surface of GENERATED_SURFACES) {
      await copyIfPresent(path.join(resolvedRoot, surface), path.join(stagingRoot, surface));
    }
    await syncProviderAdapters(stagingRoot);

    for (const surface of GENERATED_SURFACES) {
      const surfacePath = path.join(resolvedRoot, surface);
      const stagedPath = path.join(stagingRoot, surface);
      // A generated surface that does not yet exist on disk (e.g. a fresh
      // clone before the first `agentic:sync` run) is not stale; the
      // generator creates it, the check only verifies existing ones.
      if (!(await pathExists(surfacePath))) {
        continue;
      }
      const sourceInfo = await stat(surfacePath);
      if (sourceInfo.isDirectory()) {
        const sourceFiles = await collectDirectoryFiles(surfacePath, resolvedRoot);
        const stagedFiles = await collectDirectoryFiles(stagedPath, stagingRoot);
        for (const file of [...new Set([...sourceFiles, ...stagedFiles])]) {
          const sourceFile = path.join(resolvedRoot, file);
          const stagedFile = path.join(stagingRoot, file);
          if (
            !(await pathExists(sourceFile)) ||
            !(await pathExists(stagedFile)) ||
            (await readFile(sourceFile, 'utf8')) !== (await readFile(stagedFile, 'utf8'))
          ) {
            throw new Error(`Generated provider surface is stale: ${file}`);
          }
        }
      } else {
        if ((await readFile(surfacePath, 'utf8')) !== (await readFile(stagedPath, 'utf8'))) {
          throw new Error(`Generated provider surface is stale: ${surface}`);
        }
      }
    }
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '../..');
  if (process.argv.includes('--check')) {
    await checkProviderAdapters(repoRoot);
    console.log('Generated provider surfaces are current.');
    return;
  }
  const result = await syncProviderAdapters(repoRoot);
  console.log(result.files.join('\n'));
}

const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = path.resolve(__filename);

if (entrypointPath === modulePath) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
