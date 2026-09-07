import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { redactAuditFields } from '../patterns';

describe('redactAuditFields', () => {
  it('removes sensitive top-level fields', () => {
    const result = redactAuditFields({
      actorId: '42',
      email: 'hidden@example.com',
      invitationToken: 'secret-token',
      passwordHash: 'hash',
      safeValue: 'kept'
    });

    assert.deepStrictEqual(result, {
      actorId: '42',
      safeValue: 'kept'
    });
  });

  it('recursively removes sensitive nested fields', () => {
    const result = redactAuditFields({
      target: {
        userId: '7',
        phoneNumber: '+1234',
        nested: {
          accessKeyId: 'abc',
          status: 'active'
        }
      },
      details: {
        flags: ['a', 'b'],
        metadata: {
          encryptedEmail: 'ciphertext',
          result: 'ok'
        }
      }
    });

    assert.deepStrictEqual(result, {
      target: {
        userId: '7',
        nested: {
          status: 'active'
        }
      },
      details: {
        flags: ['a', 'b'],
        metadata: {
          result: 'ok'
        }
      }
    });
  });

  it('returns an empty object for undefined input', () => {
    assert.deepStrictEqual(redactAuditFields(undefined), {});
  });

  it('preserves safe boolean metadata but drops mis-typed values', () => {
    const result = redactAuditFields({
      emailDispatched: true,
      emailVerified: 'user@example.com'
    });

    assert.deepStrictEqual(result, {
      emailDispatched: true
    });
  });
});
