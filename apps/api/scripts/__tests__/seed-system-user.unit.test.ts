import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureSeedAllowed,
  parseSeedSystemUserArgs,
  sanitizeOrganizationSlug
} from '../seed-system-user.helpers';

test('sanitizeOrganizationSlug normalizes unsafe slug input', () => {
  assert.equal(sanitizeOrganizationSlug('  Acme Admin!!  '), 'acme-admin');
});

test('ensureSeedAllowed blocks production without explicit override', () => {
  assert.throws(() => ensureSeedAllowed('production', false), /--allow-production/);
});

test('parseSeedSystemUserArgs reads required and optional flags', () => {
  const parsed = parseSeedSystemUserArgs([
    '--email',
    'OWNER@Example.com',
    '--password',
    'StrongPassword123!',
    '--org-slug',
    'Acme Admin',
    '--org-name',
    'Acme Inc',
    '--org-display-name',
    'Acme Admin',
    '--user-display-name',
    'Acme System Owner',
    '--first-name',
    'Acme',
    '--last-name',
    'Owner',
    '--allow-production'
  ]);

  assert.equal(parsed.email, 'owner@example.com');
  assert.equal(parsed.organizationSlug, 'acme-admin');
  assert.equal(parsed.organizationName, 'Acme Inc');
  assert.equal(parsed.organizationDisplayName, 'Acme Admin');
  assert.equal(parsed.userDisplayName, 'Acme System Owner');
  assert.equal(parsed.firstName, 'Acme');
  assert.equal(parsed.lastName, 'Owner');
  assert.equal(parsed.allowProduction, true);
});
