import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { checkProviderAdapters, syncProviderAdapters } from './sync-provider-adapters';

async function createFixture(): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-sync-'));
  await mkdir(path.join(repoRoot, '.agents', 'registry'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'providers'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'agents'), { recursive: true });
  await mkdir(path.join(repoRoot, '.agents', 'skills', 'demo-skill'), { recursive: true });

  await writeFile(
    path.join(repoRoot, '.agents', 'registry', 'agents.yaml'),
    `- name: planner
  kind: planning
  description: Plans work.
  provider_aliases:
    codex: planner
    claude: planner
    github-copilot: planner
  capabilities:
    - task-breakdown
`,
    'utf8'
  );

  await writeFile(
    path.join(repoRoot, '.agents', 'registry', 'custom-agents.yaml'),
    `- name: runtime-governor
  description: Governs runtime.
  canonical_prompt_path: .agents/agents/runtime-governor.md
  tools:
    - read
    - search
    - edit
  provider_aliases:
    claude: runtime-governor
    github-copilot: runtime-governor
  mirror_paths:
    claude:
      - .claude/agents/runtime-governor.md
    github-copilot:
      - .github/agents/runtime-governor.agent.md
`,
    'utf8'
  );

  await writeFile(
    path.join(repoRoot, '.agents', 'registry', 'providers.yaml'),
    `- name: codex
  category: provider
  display_name: Codex
  root_adapter_path: CODEX.md
  strengths:
    - code-editing
  default_roles:
    - planner
  notes:
    - Codex is primary.
- name: claude
  category: provider
  display_name: Claude Code
  root_adapter_path: CLAUDE.md
  agent_alias_dir: .claude/agents
  agent_file_suffix: .md
  strengths:
    - synthesis
  default_roles:
    - planner
  notes:
    - Claude uses generated subagents.
- name: github-copilot
  category: provider
  display_name: GitHub Copilot
  root_adapter_path: .github/copilot-instructions.md
  strengths:
    - custom-agents
    - custom-skills
  default_roles:
    - planner
  notes:
    - Copilot uses generated agents and skills.
`,
    'utf8'
  );

  await writeFile(
    path.join(repoRoot, '.agents', 'registry', 'skills.yaml'),
    `operations: []
skills:
  - name: demo-skill
    category: design
    description: Demo skill.
    canonical_path: .agents/skills/demo-skill
    provider_aliases:
      codex: demo-skill
      claude: demo-skill
      github-copilot: demo-skill
    mirror_paths:
      codex:
        - .agents/skills/demo-skill
      claude:
        - .claude/skills/demo-skill
      github-copilot:
        - .github/skills/demo-skill
`,
    'utf8'
  );

  await writeFile(path.join(repoRoot, '.agents', 'providers', 'codex.md'), '# codex\n', 'utf8');
  await writeFile(path.join(repoRoot, '.agents', 'providers', 'claude.md'), '# claude\n', 'utf8');
  await writeFile(
    path.join(repoRoot, '.agents', 'providers', 'github-copilot.md'),
    '# github-copilot\n',
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'agents', 'runtime-governor.md'),
    '# Runtime Governor\n\nFollow runtime rules.\n',
    'utf8'
  );
  await writeFile(
    path.join(repoRoot, '.agents', 'skills', 'demo-skill', 'SKILL.md'),
    '# Demo\n',
    'utf8'
  );
  await writeFile(path.join(repoRoot, 'AGENTS.md'), '# AGENTS\n', 'utf8');

  return repoRoot;
}

describe('syncProviderAdapters', () => {
  it('generates provider adapters, claude role aliases, custom agents, and provider skill mirrors from .agents', async () => {
    const repoRoot = await createFixture();

    const result = await syncProviderAdapters(repoRoot);

    const codex = await readFile(path.join(repoRoot, 'CODEX.md'), 'utf8');
    const claude = await readFile(path.join(repoRoot, 'CLAUDE.md'), 'utf8');
    const copilot = await readFile(
      path.join(repoRoot, '.github', 'copilot-instructions.md'),
      'utf8'
    );
    const claudeRoleAgent = await readFile(
      path.join(repoRoot, '.claude', 'agents', 'planner.md'),
      'utf8'
    );
    const claudeCustomAgent = await readFile(
      path.join(repoRoot, '.claude', 'agents', 'runtime-governor.md'),
      'utf8'
    );
    const copilotCustomAgent = await readFile(
      path.join(repoRoot, '.github', 'agents', 'runtime-governor.agent.md'),
      'utf8'
    );
    const mirroredCodexSkill = await readFile(
      path.join(repoRoot, '.agents', 'skills', 'demo-skill', 'SKILL.md'),
      'utf8'
    );
    const mirroredClaudeSkill = await readFile(
      path.join(repoRoot, '.claude', 'skills', 'demo-skill', 'SKILL.md'),
      'utf8'
    );
    const mirroredCopilotSkill = await readFile(
      path.join(repoRoot, '.github', 'skills', 'demo-skill', 'skill.md'),
      'utf8'
    );

    assert.equal(codex, '@AGENTS.md\n');
    assert.equal(claude, '@AGENTS.md\n');
    assert.equal(copilot, '@../AGENTS.md\n');
    assert.match(claudeRoleAgent, /Logical role: `planner`/);
    assert.match(claudeCustomAgent, /Runtime Governor/);
    assert.match(copilotCustomAgent, /tools: \['read', 'search', 'edit'\]/);
    assert.equal(mirroredCodexSkill, '# Demo\n');
    assert.equal(mirroredClaudeSkill, '# Demo\n');
    assert.equal(mirroredCopilotSkill, '# Demo\n');
    assert.ok(result.files.includes('CODEX.md'));
    assert.ok(result.files.includes('.claude/agents/planner.md'));
    assert.ok(result.files.includes('.claude/agents/runtime-governor.md'));
    assert.ok(result.files.includes('.github/agents/runtime-governor.agent.md'));
    assert.ok(result.files.includes('.github/skills/demo-skill/skill.md'));
    await checkProviderAdapters(repoRoot);
  });

  it('rejects registry paths that escape the repository', async () => {
    const repoRoot = await createFixture();
    await writeFile(
      path.join(repoRoot, '.agents', 'registry', 'skills.yaml'),
      `skills:
  - name: unsafe
    category: test
    description: Unsafe skill.
    canonical_path: ../outside
`,
      'utf8'
    );

    await assert.rejects(
      () => syncProviderAdapters(repoRoot),
      /Configured skill source is not an allowed generated target/
    );
  });

  it('rejects in-repository paths that are not generated surfaces', async () => {
    const repoRoot = await createFixture();
    await writeFile(
      path.join(repoRoot, '.agents', 'registry', 'providers.yaml'),
      `- name: codex
  category: provider
  root_adapter_path: package.json
`,
      'utf8'
    );

    await assert.rejects(
      () => syncProviderAdapters(repoRoot),
      /Configured root adapter is not an allowed generated target/
    );
  });

  it('does not generate roles for providers without an advertised alias', async () => {
    const repoRoot = await createFixture();
    await writeFile(
      path.join(repoRoot, '.agents', 'registry', 'agents.yaml'),
      `- name: planner
  kind: planning
  description: Plans work.
  provider_aliases:
    codex: planner
    github-copilot: planner
`,
      'utf8'
    );

    await syncProviderAdapters(repoRoot);
    await assert.rejects(
      () => readFile(path.join(repoRoot, '.claude', 'agents', 'planner.md'), 'utf8'),
      /ENOENT/
    );
  });

  it('checkProviderAdapters does not fail when a generated surface is absent (fresh-clone shape)', async () => {
    // Reproduces: agentic:check fails with ENOENT for .github/agents on a
    // fresh clone where some surfaces (.github/agents, .claude/skills, etc.)
    // have not been generated yet. The check should skip absent surfaces,
    // not treat them as stale.
    const repoRoot = await createFixture();
    // Run sync so generated content that DOES exist (CODEX.md, .claude/agents, .github/skills)
    // matches the staging output — then delete one surface to simulate the
    // fresh-clone shape where only some surfaces have been generated.
    await syncProviderAdapters(repoRoot);
    await rm(path.join(repoRoot, '.github', 'agents'), { recursive: true, force: true });
    // Pre-fix: ENOENT on stat('.github/agents'). Post-fix: passes.
    await checkProviderAdapters(repoRoot);
  });
});
