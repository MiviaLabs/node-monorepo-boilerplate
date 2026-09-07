import { describe, expect, it } from '@jest/globals';

import { PROJECT_VISIBILITY_ENUM, projects } from '../projects.schema';

describe('projects.schema', () => {
  it('should expose the projects table', () => {
    expect(typeof projects).toBe('object');
    expect(projects).not.toBeNull();
  });

  it('should expose the supported visibility values', () => {
    expect(PROJECT_VISIBILITY_ENUM).toEqual(['public', 'private']);
  });
});
