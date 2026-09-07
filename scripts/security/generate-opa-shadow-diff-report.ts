import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  Project,
  SyntaxKind,
  type ClassDeclaration,
  type Decorator,
  type Expression
} from 'ts-morph';

import {
  OPA_ACTIONS,
  OPA_RESOURCES
} from '../../apps/api/src/common/constants/opa-policy.constants';
import { ROLE_PERMISSIONS } from '../../packages/constants/src/domain/role-permissions';
import {
  SYSTEM_PERMISSIONS,
  TENANT_PERMISSIONS
} from '../../packages/constants/src/domain/permissions';

type DecisionMode = 'allow' | 'deny';

interface EndpointPolicyMapping {
  readonly filePath: string;
  readonly className: string;
  readonly methodName: string;
  readonly httpMethod: string;
  readonly route: string;
  readonly resource?: string;
  readonly scope?: string;
  readonly action?: string;
  readonly requiredPermissions: readonly string[];
}

interface RoleDecision {
  readonly role: string;
  readonly legacy: DecisionMode;
  readonly opa: DecisionMode;
}

interface MismatchEntry {
  readonly endpoint: string;
  readonly role: string;
  readonly reason: string;
  readonly legacy?: DecisionMode;
  readonly opa?: DecisionMode;
  readonly resource?: string;
  readonly action?: string;
  readonly requiredPermissions?: readonly string[];
}

interface SkippedEntry {
  readonly endpoint: string;
  readonly reason: string;
}

const HTTP_DECORATORS = [
  'Get',
  'Post',
  'Patch',
  'Delete',
  'Put',
  'Head',
  'Options',
  'All'
] as const;
const AUTH_GUARD_PATTERN = /\b(JwtAuthGuard|JwtTenantGuard)\b/;
const EXCLUDED_FILES = new Set(['auth-test.controller.ts']);
const API_PREFIX = '/api';
const OPA_POLICY_QUERY = 'data.authz.allow';
const OPA_DATA_DIR = 'packages/opa/policies/authz';

const PERMISSION_GROUPS = {
  SYSTEM_PERMISSIONS,
  TENANT_PERMISSIONS
} as const;

const OPA_GROUPS = {
  OPA_ACTIONS,
  OPA_RESOURCES
} as const;

function getDecoratorByName(decorators: readonly Decorator[], name: string): Decorator | undefined {
  return decorators.find((decorator) => decorator.getName() === name);
}

function hasDecorator(decorators: readonly Decorator[], name: string): boolean {
  return getDecoratorByName(decorators, name) !== undefined;
}

function hasAuthGuards(decorators: readonly Decorator[]): boolean {
  const useGuards = getDecoratorByName(decorators, 'UseGuards');
  if (!useGuards) {
    return false;
  }
  return AUTH_GUARD_PATTERN.test(useGuards.getText());
}

function isHttpMethodDecorator(decorators: readonly Decorator[]): Decorator | undefined {
  return decorators.find((decorator) => HTTP_DECORATORS.includes(decorator.getName() as never));
}

function readStringValue(expression: Expression | undefined): string | undefined {
  if (!expression) return undefined;

  if (expression.getKind() === SyntaxKind.StringLiteral) {
    return expression.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
  }

  if (expression.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return expression.asKind(SyntaxKind.NoSubstitutionTemplateLiteral)?.getLiteralValue();
  }

  if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
    const propertyAccess = expression.asKind(SyntaxKind.PropertyAccessExpression);
    if (!propertyAccess) return undefined;

    const objectName = propertyAccess.getExpression().getText();
    const propertyName = propertyAccess.getName();

    if (objectName in OPA_GROUPS) {
      const value =
        OPA_GROUPS[objectName as keyof typeof OPA_GROUPS][
          propertyName as keyof (typeof OPA_GROUPS)[keyof typeof OPA_GROUPS]
        ];
      return typeof value === 'string' ? value : undefined;
    }

    if (objectName in PERMISSION_GROUPS) {
      const value =
        PERMISSION_GROUPS[objectName as keyof typeof PERMISSION_GROUPS][
          propertyName as keyof (typeof PERMISSION_GROUPS)[keyof typeof PERMISSION_GROUPS]
        ];
      return typeof value === 'string' ? value : undefined;
    }
  }

  return undefined;
}

function readResourceMetadata(
  methodDecorators: readonly Decorator[],
  classDecorators: readonly Decorator[]
): { type?: string; scope?: string } {
  const resourceDecorator =
    getDecoratorByName(methodDecorators, 'Resource') ??
    getDecoratorByName(classDecorators, 'Resource');
  const argument = resourceDecorator?.getCallExpression()?.getArguments()[0];
  if (!argument) {
    return {};
  }

  const stringResource = readStringValue(argument);
  if (stringResource) {
    return { type: stringResource, scope: 'tenant' };
  }

  if (argument.getKind() === SyntaxKind.ObjectLiteralExpression) {
    const objectLiteral = argument.asKind(SyntaxKind.ObjectLiteralExpression);
    if (!objectLiteral) return {};

    const typeProperty = objectLiteral.getProperty('type');
    const scopeProperty = objectLiteral.getProperty('scope');

    const typeInitializer =
      typeProperty?.getKind() === SyntaxKind.PropertyAssignment
        ? typeProperty.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
        : undefined;
    const scopeInitializer =
      scopeProperty?.getKind() === SyntaxKind.PropertyAssignment
        ? scopeProperty.asKind(SyntaxKind.PropertyAssignment)?.getInitializer()
        : undefined;

    return {
      type: readStringValue(typeInitializer),
      scope: readStringValue(scopeInitializer) ?? 'tenant'
    };
  }

  return {};
}

function readActionMetadata(
  methodDecorators: readonly Decorator[],
  classDecorators: readonly Decorator[]
): string | undefined {
  const actionDecorator =
    getDecoratorByName(methodDecorators, 'Action') ?? getDecoratorByName(classDecorators, 'Action');
  const argument = actionDecorator?.getCallExpression()?.getArguments()[0];
  return readStringValue(argument);
}

function readPermissions(decorators: readonly Decorator[]): string[] {
  const permissionDecorator = getDecoratorByName(decorators, 'RequirePermissions');
  if (!permissionDecorator) {
    return [];
  }

  const args = permissionDecorator.getCallExpression()?.getArguments() ?? [];
  return args
    .map((arg) => readStringValue(arg))
    .filter((value): value is string => typeof value === 'string');
}

function parseControllerPath(controllerClass: ClassDeclaration): {
  version: string;
  basePath: string;
} {
  const decorators = controllerClass.getDecorators();
  const versioned = getDecoratorByName(decorators, 'VersionedController');
  if (versioned) {
    const args = versioned.getCallExpression()?.getArguments() ?? [];
    const version = readStringValue(args[0]) ?? 'v1';
    const basePath = readStringValue(args[1]) ?? '';
    return { version, basePath };
  }

  const controller = getDecoratorByName(decorators, 'Controller');
  const controllerArg = controller?.getCallExpression()?.getArguments()[0];
  return { version: 'v1', basePath: readStringValue(controllerArg) ?? '' };
}

function normalizePath(...parts: readonly string[]): string {
  const filtered = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part.replace(/^\/+|\/+$/g, ''));

  return '/' + filtered.join('/');
}

function buildMappings(): EndpointPolicyMapping[] {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.app.json',
    skipAddingFilesFromTsConfig: true
  });
  project.addSourceFilesAtPaths('apps/api/src/modules/**/*.controller.ts');

  const mappings: EndpointPolicyMapping[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const fileName = sourceFile.getBaseName();
    if (EXCLUDED_FILES.has(fileName)) {
      continue;
    }

    for (const classDeclaration of sourceFile.getClasses()) {
      const classDecorators = classDeclaration.getDecorators();
      const controllerDecorator =
        getDecoratorByName(classDecorators, 'VersionedController') ??
        getDecoratorByName(classDecorators, 'Controller');
      if (!controllerDecorator) {
        continue;
      }

      const { version, basePath } = parseControllerPath(classDeclaration);
      const classPermissions = readPermissions(classDecorators);
      const classHasAuthGuards = hasAuthGuards(classDecorators);
      const classHasPublic = hasDecorator(classDecorators, 'Public');

      for (const method of classDeclaration.getMethods()) {
        const methodDecorators = method.getDecorators();
        const httpDecorator = isHttpMethodDecorator(methodDecorators);
        if (!httpDecorator) {
          continue;
        }

        const methodIsPublic = hasDecorator(methodDecorators, 'Public') || classHasPublic;
        const methodHasAuthGuards = hasAuthGuards(methodDecorators);
        const isProtected = !methodIsPublic && (methodHasAuthGuards || classHasAuthGuards);
        if (!isProtected) {
          continue;
        }

        const routeArg = httpDecorator.getCallExpression()?.getArguments()[0];
        const routePath = readStringValue(routeArg) ?? '';

        const resourceMetadata = readResourceMetadata(methodDecorators, classDecorators);
        const actionMetadata = readActionMetadata(methodDecorators, classDecorators);
        const methodPermissions = readPermissions(methodDecorators);
        const requiredPermissions =
          methodPermissions.length > 0 ? methodPermissions : classPermissions;

        mappings.push({
          filePath,
          className: classDeclaration.getName() ?? '<anonymous-class>',
          methodName: method.getName(),
          httpMethod: httpDecorator.getName().toUpperCase(),
          route: normalizePath(API_PREFIX, version, basePath, routePath),
          resource: resourceMetadata.type,
          scope: resourceMetadata.scope,
          action: actionMetadata,
          requiredPermissions
        });
      }
    }
  }

  return mappings.sort((a, b) =>
    `${a.httpMethod} ${a.route}`.localeCompare(`${b.httpMethod} ${b.route}`)
  );
}

function getRolePermissions(role: string): readonly string[] {
  return ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] ?? [];
}

function evaluateLegacy(requiredPermissions: readonly string[], role: string): DecisionMode {
  if (requiredPermissions.length === 0) {
    return 'allow';
  }

  const rolePermissions = getRolePermissions(role);
  const wildcard = rolePermissions.includes('*');
  const granted = requiredPermissions.every((permission) =>
    wildcard ? true : rolePermissions.includes(permission)
  );
  return granted ? 'allow' : 'deny';
}

function createOpaEvaluator(): {
  decide: (role: string, resource: string, action: string, scope?: string) => DecisionMode;
  cleanup: () => void;
} {
  const cache = new Map<string, DecisionMode>();
  const workspace = mkdtempSync(join(tmpdir(), 'opa-shadow-report-'));
  const inputPath = join(workspace, 'input.json');

  const decide = (
    role: string,
    resource: string,
    action: string,
    scope = 'tenant'
  ): DecisionMode => {
    const cacheKey = `${role}|${resource}|${action}|${scope}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const isSystemRole = role.startsWith('system_');
    const userId = isSystemRole ? 'system-user' : 'tenant-user';
    const tenantId = 'org-123';

    const input = {
      user: {
        id: userId,
        system_roles: isSystemRole ? [role] : [],
        tenant_roles: isSystemRole ? [] : [role],
        organization_id: isSystemRole ? null : tenantId,
        permissions: [...getRolePermissions(role)]
      },
      resource: {
        type: resource,
        scope,
        id: userId,
        owner_id: userId,
        organization_id: scope === 'system' ? undefined : tenantId
      },
      action
    };

    writeFileSync(inputPath, JSON.stringify(input), 'utf8');
    const result = spawnSync(
      'opa',
      ['eval', '--format', 'json', '--data', OPA_DATA_DIR, '--input', inputPath, OPA_POLICY_QUERY],
      {
        encoding: 'utf8'
      }
    );

    const hasUsableOutput = typeof result.stdout === 'string' && result.stdout.trim().length > 0;
    const shouldFail =
      result.status !== 0 ||
      Boolean(result.signal) ||
      (Boolean(result.error) && (!hasUsableOutput || result.status === null));

    if (shouldFail) {
      const details = [
        `status=${String(result.status)}`,
        result.signal ? `signal=${result.signal}` : undefined,
        result.error ? `error=${result.error.message}` : undefined,
        result.stderr?.trim() ? `stderr=${result.stderr.trim()}` : undefined,
        result.stdout?.trim() ? `stdout=${result.stdout.trim()}` : undefined
      ]
        .filter(Boolean)
        .join(', ');

      throw new Error(
        `OPA eval failed (opa eval --format json --data ${OPA_DATA_DIR} --input <tmp> ${OPA_POLICY_QUERY}): ${details || 'unknown failure'}`.trim()
      );
    }

    const parsed = JSON.parse(result.stdout) as {
      result?: Array<{ expressions?: Array<{ value?: boolean }> }>;
    };
    const value = parsed.result?.[0]?.expressions?.[0]?.value;
    const decision: DecisionMode = value ? 'allow' : 'deny';
    cache.set(cacheKey, decision);
    return decision;
  };

  const cleanup = (): void => {
    rmSync(workspace, { recursive: true, force: true });
  };

  return { decide, cleanup };
}

function ensureOpaAvailable(): void {
  const check = spawnSync('opa', ['version'], { encoding: 'utf8' });
  const hasUsableOutput = typeof check.stdout === 'string' && check.stdout.trim().length > 0;
  if (!check.error || hasUsableOutput || check.status === 0) {
    return;
  }

  if ((check.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error(
      'OPA CLI not found in PATH. Install it with `bash scripts/dev/opa-cli.sh --install` (or run `pnpm opa:install`) before generating the shadow diff report.'
    );
  }

  throw new Error(`Unable to execute OPA CLI: ${check.error.message}`);
}

function buildReport(): {
  mappings: EndpointPolicyMapping[];
  mismatches: MismatchEntry[];
  roleDecisions: Record<string, RoleDecision[]>;
  skipped: SkippedEntry[];
} {
  const mappings = buildMappings();
  const roles = Object.keys(ROLE_PERMISSIONS).sort();
  const mismatches: MismatchEntry[] = [];
  const roleDecisions: Record<string, RoleDecision[]> = {};
  const skipped: SkippedEntry[] = [];
  const opaEvaluator = createOpaEvaluator();

  try {
    for (const mapping of mappings) {
      const endpointKey = `${mapping.httpMethod} ${mapping.route}`;
      roleDecisions[endpointKey] = [];

      if (mapping.requiredPermissions.length === 0) {
        skipped.push({
          endpoint: endpointKey,
          reason: 'no_require_permissions'
        });
        continue;
      }

      if (!mapping.resource || !mapping.action) {
        for (const role of roles) {
          roleDecisions[endpointKey].push({
            role,
            legacy: evaluateLegacy(mapping.requiredPermissions, role),
            opa: 'deny'
          });
        }
        mismatches.push({
          endpoint: endpointKey,
          role: '*',
          reason: 'missing_resource_or_action_metadata',
          requiredPermissions: mapping.requiredPermissions
        });
        continue;
      }

      for (const role of roles) {
        const legacy = evaluateLegacy(mapping.requiredPermissions, role);
        const opa = opaEvaluator.decide(
          role,
          mapping.resource,
          mapping.action,
          mapping.scope ?? 'tenant'
        );
        roleDecisions[endpointKey].push({ role, legacy, opa });

        if (legacy !== opa) {
          mismatches.push({
            endpoint: endpointKey,
            role,
            reason: 'decision_mismatch',
            legacy,
            opa,
            resource: mapping.resource,
            action: mapping.action,
            requiredPermissions: mapping.requiredPermissions
          });
        }
      }
    }
  } finally {
    opaEvaluator.cleanup();
  }

  return { mappings, mismatches, roleDecisions, skipped };
}

function toMarkdown(
  generatedAt: string,
  mappings: readonly EndpointPolicyMapping[],
  mismatches: readonly MismatchEntry[],
  skipped: readonly SkippedEntry[]
): string {
  const lines: string[] = [];
  lines.push('# OPA Shadow Diff Report');
  lines.push('');
  lines.push(`Generated at: ${generatedAt}`);
  lines.push(`Protected endpoints scanned: ${mappings.length}`);
  lines.push(`Endpoints skipped (no @RequirePermissions): ${skipped.length}`);
  lines.push(`Mismatches: ${mismatches.length}`);
  lines.push('');

  if (mismatches.length === 0) {
    lines.push('No mismatches detected.');
    return lines.join('\n');
  }

  lines.push(
    '| Endpoint | Role | Reason | Legacy | OPA | Resource | Action | Required Permissions |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const mismatch of mismatches) {
    lines.push(
      `| ${mismatch.endpoint} | ${mismatch.role} | ${mismatch.reason} | ${mismatch.legacy ?? '-'} | ${mismatch.opa ?? '-'} | ${mismatch.resource ?? '-'} | ${mismatch.action ?? '-'} | ${(mismatch.requiredPermissions ?? []).join(', ') || '-'} |`
    );
  }

  return lines.join('\n');
}

function main(): void {
  ensureOpaAvailable();
  const generatedAt = new Date().toISOString();
  const { mappings, mismatches, roleDecisions, skipped } = buildReport();

  const outputDir = join('docs', 'security', 'reports');
  mkdirSync(outputDir, { recursive: true });

  const jsonPath = join(outputDir, 'opa-shadow-diff-report.json');
  const mdPath = join(outputDir, 'opa-shadow-diff-report.md');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt,
        endpointCount: mappings.length,
        skippedCount: skipped.length,
        mismatchCount: mismatches.length,
        endpoints: mappings,
        skipped,
        mismatches,
        roleDecisions
      },
      null,
      2
    ),
    'utf8'
  );

  writeFileSync(mdPath, toMarkdown(generatedAt, mappings, mismatches, skipped), 'utf8');

  console.log(`Shadow diff report written: ${mdPath}`);
  console.log(`Shadow diff report written: ${jsonPath}`);
  console.log(`Protected endpoints: ${mappings.length}`);
  console.log(`Skipped endpoints (no @RequirePermissions): ${skipped.length}`);
  console.log(`Mismatches: ${mismatches.length}`);

  if (process.argv.includes('--fail-on-mismatch') && mismatches.length > 0) {
    process.exit(1);
  }
}

main();
