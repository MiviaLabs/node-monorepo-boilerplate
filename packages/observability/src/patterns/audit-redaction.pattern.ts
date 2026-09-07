const AUDIT_SENSITIVE_KEY_FRAGMENTS = [
  'email',
  'token',
  'password',
  'secret',
  'authorization',
  'cookie',
  'phone',
  'ssn',
  'address',
  'encrypted',
  'accesskey',
  'privatekey'
] as const;

const AUDIT_SAFE_BOOLEAN_METADATA_KEYS = ['emaildispatched', 'emailverified'] as const;

function shouldDropAuditKey(key: string, value: unknown): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (
    AUDIT_SAFE_BOOLEAN_METADATA_KEYS.includes(
      normalizedKey as (typeof AUDIT_SAFE_BOOLEAN_METADATA_KEYS)[number]
    )
  ) {
    return typeof value !== 'boolean';
  }
  return AUDIT_SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalizedKey.includes(fragment));
}

function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item));
  }

  if (value && typeof value === 'object') {
    return redactAuditFields(value as Record<string, unknown>);
  }

  return value;
}

export function redactAuditFields(input?: Record<string, unknown>): Record<string, unknown> {
  if (!input) {
    return {};
  }

  return Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (value === undefined || shouldDropAuditKey(key, value)) {
      return acc;
    }

    acc[key] = redactAuditValue(value);
    return acc;
  }, {});
}
