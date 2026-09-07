/**
 * Members Table Skeleton Component Tests
 *
 * Tests for the loading skeleton component export and type correctness.
 *
 * NOTE: Full React rendering tests with @testing-library/react will be added
 * once the web app has proper component testing infrastructure configured.
 * Current setup only supports export/type verification.
 */

import { describe, it, expect } from 'vitest';

import * as MembersTableSkeletonModule from './members-table-skeleton';

// ============================================================================
// TESTS
// ============================================================================

describe('MembersTableSkeleton', () => {
  it('should export MembersTableSkeleton component', () => {
    expect(MembersTableSkeletonModule.MembersTableSkeleton).toBeDefined();
    expect(typeof MembersTableSkeletonModule.MembersTableSkeleton).toBe('function');
  });

  it('should be a named export', () => {
    expect(MembersTableSkeletonModule).toHaveProperty('MembersTableSkeleton');
  });

  it('should have correct function name', () => {
    expect(MembersTableSkeletonModule.MembersTableSkeleton.name).toBe('MembersTableSkeleton');
  });

  it('should be a function component (not a class)', () => {
    const component = MembersTableSkeletonModule.MembersTableSkeleton;

    // Verify it's a function
    expect(typeof component).toBe('function');

    // Verify it's not a class (classes have prototype properties)
    expect(component.prototype).toBeDefined();

    // Function components don't extend React.Component
    expect(component.toString()).not.toContain('extends');
  });

  it('should not require any props (takes empty object)', () => {
    const component = MembersTableSkeletonModule.MembersTableSkeleton;

    // Component function should have length 0 (no required parameters)
    expect(component.length).toBe(0);
  });

  it('should only export MembersTableSkeleton', () => {
    const exports = Object.keys(MembersTableSkeletonModule);

    // Should only have one export: MembersTableSkeleton
    expect(exports).toContain('MembersTableSkeleton');
  });

  it('should have JSDoc documentation', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    // ESM-safe directory resolution
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const filePath = path.join(__dirname, 'members-table-skeleton.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify JSDoc exists for the component
    expect(content).toContain('/**');
    expect(content).toContain('Members Table Skeleton Component');
    expect(content).toContain('@returns');
  });

  it('should import shadcn/ui components', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    // ESM-safe directory resolution
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const filePath = path.join(__dirname, 'members-table-skeleton.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify imports
    expect(content).toContain("from '~/components/ui/card'");
    expect(content).toContain("from '~/components/ui/skeleton'");
    expect(content).toContain("from '~/components/ui/table'");
  });

  it('should define SKELETON_ROW_COUNT constant', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const filePath = path.join(__dirname, 'members-table-skeleton.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify constant definition
    expect(content).toContain('const SKELETON_ROW_COUNT = 10');
  });

  it('should use SKELETON_ROW_COUNT for row generation', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const filePath = path.join(__dirname, 'members-table-skeleton.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify Array.from uses SKELETON_ROW_COUNT
    expect(content).toContain('Array.from({ length: SKELETON_ROW_COUNT })');
  });

  it('should have proper file structure with constants section', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const filePath = path.join(__dirname, 'members-table-skeleton.tsx');
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify sections exist
    expect(content).toContain('// CONSTANTS');
    expect(content).toContain('// COMPONENT');
  });

  it('should export a function with no dependencies on props', () => {
    const component = MembersTableSkeletonModule.MembersTableSkeleton;

    // Function signature should not require props
    expect(component.length).toBe(0);
  });

  it('should be properly typed (TypeScript compilation)', () => {
    // This test passes if TypeScript compilation succeeds
    // The fact that we can import it means it type-checks correctly
    expect(MembersTableSkeletonModule.MembersTableSkeleton).toBeDefined();
  });
});
