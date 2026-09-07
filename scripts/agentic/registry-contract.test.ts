import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

import YAML from 'yaml';

const repoRoot = path.resolve(__dirname, '../..');

async function readYaml<T>(relativePath: string): Promise<T> {
  return YAML.parse(await readFile(path.join(repoRoot, relativePath), 'utf8')) as T;
}

type Provider = { name: string };
type Skill = {
  name: string;
  canonical_path: string;
  risk_areas?: string[];
  lifecycle_phases?: string[];
  required_checks?: string[];
  required_reviews?: string[];
  provider_aliases?: Record<string, string>;
  mirror_paths?: Record<string, string[]>;
};
type CustomAgent = {
  name: string;
  canonical_prompt_path: string;
  tools?: string[];
  required_skills?: string[];
  mirror_paths?: Record<string, string[]>;
};

describe('live agent registry contract', () => {
  it('keeps canonical skills complete and provider-scoped', async () => {
    const providers = await readYaml<Provider[]>('.agents/registry/providers.yaml');
    const { skills = [] } = await readYaml<{ skills: Skill[] }>('.agents/registry/skills.yaml');
    const providerNames = new Set(providers.map((provider) => provider.name));
    const skillNames = new Set(skills.map((skill) => skill.name));

    assert.equal(skillNames.size, skills.length, 'skill names must be unique');
    for (const skill of skills) {
      assert.ok(skill.risk_areas?.length, `${skill.name} needs risk_areas`);
      assert.ok(skill.lifecycle_phases?.length, `${skill.name} needs lifecycle_phases`);
      assert.ok(skill.required_checks?.length, `${skill.name} needs required_checks`);
      assert.ok(skill.required_reviews?.length, `${skill.name} needs required_reviews`);
      await stat(path.join(repoRoot, skill.canonical_path, 'SKILL.md'));

      for (const providerName of Object.keys(skill.provider_aliases ?? {})) {
        assert.ok(
          providerNames.has(providerName),
          `${skill.name} has unknown provider ${providerName}`
        );
      }
      for (const mirrorPath of Object.values(skill.mirror_paths ?? {}).flat()) {
        assert.match(mirrorPath, /^(?:\.agents\/skills|\.claude\/skills|\.github\/skills)\//);
      }
    }

    const customAgents = await readYaml<CustomAgent[]>('.agents/registry/custom-agents.yaml');
    for (const agent of customAgents) {
      await stat(path.join(repoRoot, agent.canonical_prompt_path));
      assert.ok(!agent.tools?.includes('*'), `${agent.name} cannot use wildcard tools`);
      for (const skillName of agent.required_skills ?? []) {
        assert.ok(skillNames.has(skillName), `${agent.name} has unknown skill ${skillName}`);
      }
      for (const mirrorPath of Object.values(agent.mirror_paths ?? {}).flat()) {
        assert.match(mirrorPath, /^(?:\.claude\/agents|\.github\/agents)\//);
      }
    }
  });

  it('uses rule identifiers that exist in the canonical catalog', async () => {
    const { rules = [] } = await readYaml<{ rules: Array<{ id: string }> }>(
      '.agents/governance/rule-catalog.yaml'
    );
    const ruleIds = new Set(rules.map((rule) => rule.id));
    const teams = await readYaml<Array<{ name: string; rules: string[] }>>(
      '.agents/registry/teams.yaml'
    );

    for (const team of teams) {
      for (const rule of team.rules) {
        assert.ok(ruleIds.has(rule), `${team.name} references unknown rule ${rule}`);
      }
    }
  });
});
