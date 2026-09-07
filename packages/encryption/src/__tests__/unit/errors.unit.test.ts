/**
 * Unit tests for errors.ts
 */

import { describe, it, expect } from '@jest/globals';

import {
  EncryptionError,
  EncryptionOperationError,
  DecryptionOperationError,
  KmsProviderNotFoundError,
  InvalidKmsConfigError,
  KeyNotFoundError,
  DataKeyGenerationError,
  EnvelopeEncryptionError,
  EntityTransformError,
  EncryptedMetadataNotFoundError
} from '../../errors';

describe('errors', () => {
  describe('EncryptionError', () => {
    it('should create base error', () => {
      const error = new EncryptionError('Test error');
      expect(error.name).toBe('EncryptionError');
      expect(error.message).toBe('Test error');
    });
  });

  describe('EncryptionOperationError', () => {
    it('should create error with operation name', () => {
      const error = new EncryptionOperationError('encrypt-data');
      expect(error.name).toBe('EncryptionOperationError');
      expect(error.message).toContain('encrypt-data');
    });

    it('should include cause when Error provided', () => {
      const cause = new Error('Connection failed');
      const error = new EncryptionOperationError('encrypt-data', cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('Connection failed');
    });

    it('should handle non-Error causes', () => {
      const error = new EncryptionOperationError('encrypt-data', 'string cause');
      expect(error.name).toBe('EncryptionOperationError');
    });
  });

  describe('DecryptionOperationError', () => {
    it('should create error with operation name', () => {
      const error = new DecryptionOperationError('decrypt-data');
      expect(error.name).toBe('DecryptionOperationError');
      expect(error.message).toContain('decrypt-data');
    });

    it('should include cause when Error provided', () => {
      const cause = new Error('Invalid ciphertext');
      const error = new DecryptionOperationError('decrypt-data', cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('Invalid ciphertext');
    });
  });

  describe('KmsProviderNotFoundError', () => {
    it('should create error with provider name', () => {
      const error = new KmsProviderNotFoundError('aws-kms');
      expect(error.name).toBe('KmsProviderNotFoundError');
      expect(error.message).toContain('aws-kms');
      expect(error.message).toContain('not found');
    });
  });

  describe('InvalidKmsConfigError', () => {
    it('should create error with message', () => {
      const error = new InvalidKmsConfigError('Missing region');
      expect(error.name).toBe('InvalidKmsConfigError');
      expect(error.message).toContain('Missing region');
      expect(error.message).toContain('Invalid KMS configuration');
    });
  });

  describe('KeyNotFoundError', () => {
    it('should create error with key ID', () => {
      const error = new KeyNotFoundError('my-key-id');
      expect(error.name).toBe('KeyNotFoundError');
      expect(error.message).toContain('my-key-id');
      expect(error.message).toContain('not found');
    });
  });

  describe('DataKeyGenerationError', () => {
    it('should create error without cause', () => {
      const error = new DataKeyGenerationError();
      expect(error.name).toBe('DataKeyGenerationError');
      expect(error.message).toContain('Data key generation failed');
    });

    it('should include cause when Error provided', () => {
      const cause = new Error('KMS unavailable');
      const error = new DataKeyGenerationError(cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('KMS unavailable');
    });
  });

  describe('EnvelopeEncryptionError', () => {
    it('should create error with operation name', () => {
      const error = new EnvelopeEncryptionError('generate-key');
      expect(error.name).toBe('EnvelopeEncryptionError');
      expect(error.message).toContain('generate-key');
      expect(error.message).toContain('Envelope encryption');
    });

    it('should include cause when Error provided', () => {
      const cause = new Error('IV generation failed');
      const error = new EnvelopeEncryptionError('encrypt', cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('IV generation failed');
    });
  });

  describe('EntityTransformError', () => {
    it('should create error with entity name', () => {
      const error = new EntityTransformError('User');
      expect(error.name).toBe('EntityTransformError');
      expect(error.message).toContain('User');
      expect(error.message).toContain('Entity transformation failed');
    });

    it('should include cause when Error provided', () => {
      const cause = new Error('Field not found');
      const error = new EntityTransformError('User', cause);
      expect(error.cause).toBe(cause);
      expect(error.message).toContain('Field not found');
    });
  });

  describe('EncryptedMetadataNotFoundError', () => {
    it('should create error with target and property', () => {
      const error = new EncryptedMetadataNotFoundError('User', 'email');
      expect(error.name).toBe('EncryptedMetadataNotFoundError');
      expect(error.message).toContain('User');
      expect(error.message).toContain('email');
      expect(error.message).toContain('@Encrypted');
    });
  });
});
