export interface SeedSystemUserOptions {
  email: string;
  password: string;
  organizationSlug: string;
  organizationName: string;
  organizationDisplayName: string;
  userDisplayName: string;
  firstName?: string;
  lastName?: string;
  allowProduction: boolean;
}

const REQUIRED_FLAGS = ['email', 'password', 'org-slug', 'org-name'] as const;

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === `--${flag}`);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for --${flag}`);
  }

  return value.trim();
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(`--${flag}`);
}

export function sanitizeOrganizationSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

export function ensureSeedAllowed(nodeEnv: string | undefined, allowProduction: boolean): void {
  if (nodeEnv === 'production' && !allowProduction) {
    throw new Error(
      'Refusing to seed in production without --allow-production. Rerun only if this is intentional.'
    );
  }
}

export function parseSeedSystemUserArgs(argv: string[]): SeedSystemUserOptions {
  const missingFlags = REQUIRED_FLAGS.filter((flag) => !hasFlag(argv, flag));
  if (missingFlags.length > 0) {
    throw new Error(
      `Missing required flags: ${missingFlags.map((flag) => `--${flag}`).join(', ')}`
    );
  }

  const email = readFlagValue(argv, 'email');
  const password = readFlagValue(argv, 'password');
  const orgSlugInput = readFlagValue(argv, 'org-slug');
  const orgName = readFlagValue(argv, 'org-name');

  if (!email || !password || !orgSlugInput || !orgName) {
    throw new Error('Missing required seed inputs');
  }

  const organizationSlug = sanitizeOrganizationSlug(orgSlugInput);
  if (!organizationSlug) {
    throw new Error('Organization slug is empty after sanitization');
  }

  return {
    email: email.toLowerCase(),
    password,
    organizationSlug,
    organizationName: orgName,
    organizationDisplayName: readFlagValue(argv, 'org-display-name') ?? orgName,
    userDisplayName: readFlagValue(argv, 'user-display-name') ?? `${orgName} System Owner`,
    firstName: readFlagValue(argv, 'first-name'),
    lastName: readFlagValue(argv, 'last-name'),
    allowProduction: hasFlag(argv, 'allow-production')
  };
}

export function buildUsageText(): string {
  return [
    'Usage:',
    '  pnpm --dir apps/api exec tsx scripts/seed-system-user.ts \\',
    '    --email owner@example.com \\',
    '    --password "StrongPassword123!" \\',
    '    --org-slug acme-admin \\',
    '    --org-name "Acme Admin" \\',
    '    [--org-display-name "Acme Admin"] \\',
    '    [--user-display-name "Acme System Owner"] \\',
    '    [--first-name Acme] \\',
    '    [--last-name Owner] \\',
    '    [--allow-production]'
  ].join('\n');
}
