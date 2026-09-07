/**
 * KMS rotation checkpoint schema unit tests
 */

import { describe, expect, it } from '@jest/globals';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { kmsRotationCheckpoint } from '../kms-rotation-checkpoint.schema';
import { kmsRotationCheckpoint as kmsRotationCheckpointFromBarrel } from '../index';

describe('kms-rotation-checkpoint.schema', () => {
  describe('kmsRotationCheckpoint table', () => {
    it('should be defined', () => {
      expect(typeof kmsRotationCheckpoint).toBe('object');
    });

    it('should be a valid Drizzle table schema', () => {
      expect(typeof kmsRotationCheckpoint).toBe('object');
      expect(kmsRotationCheckpoint !== null).toBe(true);
    });
  });

  describe('checkpoint fields', () => {
    it('should have keyName for the logical KMS key', () => {
      const columns = Object.keys(kmsRotationCheckpoint);
      expect(columns.includes('keyName')).toBe(true);
    });

    it('should have lastSeenVersion for the observed versioned key ID', () => {
      const columns = Object.keys(kmsRotationCheckpoint);
      expect(columns.includes('lastSeenVersion')).toBe(true);
    });

    it('should have transition tracking fields for processed rotations', () => {
      const columns = Object.keys(kmsRotationCheckpoint);
      expect(columns.includes('lastProcessedFromVersion')).toBe(true);
      expect(columns.includes('lastProcessedToVersion')).toBe(true);
    });

    it('should have polling lifecycle timestamps', () => {
      const columns = Object.keys(kmsRotationCheckpoint);
      expect(columns.includes('lastCheckedAt')).toBe(true);
      expect(columns.includes('lastRotatedAt')).toBe(true);
      expect(columns.includes('updatedAt')).toBe(true);
    });
  });

  describe('exports and constraints', () => {
    it('should be exported through the schema barrel', () => {
      expect(kmsRotationCheckpointFromBarrel).toBe(kmsRotationCheckpoint);
    });

    it('should enforce one checkpoint row per logical key name', () => {
      const config = getTableConfig(kmsRotationCheckpoint);

      expect(
        config.indexes.some(
          (tableIndex) =>
            tableIndex.config.name === 'kms_rotation_checkpoint_key_name_unique_idx' &&
            tableIndex.config.unique === true
        )
      ).toBe(true);
    });
  });
});
