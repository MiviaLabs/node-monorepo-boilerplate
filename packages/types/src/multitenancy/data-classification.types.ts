/**
 * Data Classification Types
 *
 * Provides data classification levels and categories for PII protection
 * following KSA PDPL, GDPR, ISO 27001:2022 compliance requirements.
 */

/**
 * Storage classification for data at rest
 */
export const StorageType = {
  /** Standard storage - unencrypted */
  STANDARD: 'standard',
  /** Encrypted storage - at rest encryption required */
  ENCRYPTED: 'encrypted'
} as const;

/** Storage type */
export type StorageType = (typeof StorageType)[keyof typeof StorageType];

/**
 * Data classification levels based on sensitivity
 */
export const DataClassification = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
  CONFIDENTIAL: 'confidential',
  RESTRICTED: 'restricted'
} as const;

/** Data classification level type */
export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification];

/**
 * Data category for PII classification
 */
export const DataCategory = {
  NONE: 'none',
  PERSONAL: 'personal',
  SENSITIVE: 'sensitive',
  HEALTH: 'health',
  BIOMETRIC: 'biometric'
} as const;

/** Data category type */
export type DataCategory = (typeof DataCategory)[keyof typeof DataCategory];

/**
 * Classified data wrapper
 */
export interface ClassifiedData<T = unknown> {
  readonly data: T;
  readonly classification: DataClassification;
  readonly category: DataCategory;
  readonly tenantId: string;
}

/**
 * Manual classification override
 */
export interface ManualClassification {
  readonly classification: DataClassification;
  readonly category: DataCategory;
  readonly reason?: string;
}

/**
 * Data classification rules per level
 */
export const ClassificationRules: Record<
  DataClassification,
  {
    readonly storage: StorageType;
    readonly retention: string;
    readonly access: string;
    readonly audit: boolean;
  }
> = {
  [DataClassification.PUBLIC]: {
    storage: StorageType.STANDARD,
    retention: '7 years',
    access: 'all users',
    audit: false
  },
  [DataClassification.INTERNAL]: {
    storage: StorageType.STANDARD,
    retention: '7 years',
    access: 'employees only',
    audit: true
  },
  [DataClassification.CONFIDENTIAL]: {
    storage: StorageType.ENCRYPTED,
    retention: '7 years',
    access: 'authorized users',
    audit: true
  },
  [DataClassification.RESTRICTED]: {
    storage: StorageType.ENCRYPTED,
    retention: 'legal requirement',
    access: 'named individuals',
    audit: true
  }
} as const;

/**
 * Classification result
 */
export interface ClassificationResult {
  readonly classification: DataClassification;
  readonly category: DataCategory;
}

/**
 * Field patterns for automatic classification
 */
const FIELD_PATTERNS: Record<
  string,
  { classification: DataClassification; category: DataCategory }
> = {
  // RESTRICTED - SENSITIVE
  ssn: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  socialSecurityNumber: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.SENSITIVE
  },
  creditCard: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  creditCardNumber: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.SENSITIVE
  },
  bankAccount: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  bankAccountNumber: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.SENSITIVE
  },
  iban: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  routingNumber: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.SENSITIVE
  },

  // RESTRICTED - HEALTH
  medicalRecord: { classification: DataClassification.RESTRICTED, category: DataCategory.HEALTH },
  healthInfo: { classification: DataClassification.RESTRICTED, category: DataCategory.HEALTH },
  medicalInfo: { classification: DataClassification.RESTRICTED, category: DataCategory.HEALTH },
  diagnosis: { classification: DataClassification.RESTRICTED, category: DataCategory.HEALTH },
  treatment: { classification: DataClassification.RESTRICTED, category: DataCategory.HEALTH },

  // RESTRICTED - BIOMETRIC
  fingerprint: { classification: DataClassification.RESTRICTED, category: DataCategory.BIOMETRIC },
  faceId: { classification: DataClassification.RESTRICTED, category: DataCategory.BIOMETRIC },
  biometricData: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.BIOMETRIC
  },

  // RESTRICTED - Regional identifiers
  nationalId: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  saudiId: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },
  passportNumber: {
    classification: DataClassification.RESTRICTED,
    category: DataCategory.SENSITIVE
  },
  passport: { classification: DataClassification.RESTRICTED, category: DataCategory.SENSITIVE },

  // CONFIDENTIAL - PERSONAL
  email: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  emailAddress: {
    classification: DataClassification.CONFIDENTIAL,
    category: DataCategory.PERSONAL
  },
  phone: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  phoneNumber: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  mobile: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  mobileNumber: {
    classification: DataClassification.CONFIDENTIAL,
    category: DataCategory.PERSONAL
  },
  name: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  fullName: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  firstName: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  lastName: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  address: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  streetAddress: {
    classification: DataClassification.CONFIDENTIAL,
    category: DataCategory.PERSONAL
  },
  dateOfBirth: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  dob: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  birthDate: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL },
  gender: { classification: DataClassification.CONFIDENTIAL, category: DataCategory.PERSONAL }
};

/**
 * Check if object has nested field
 *
 * @internal This function is intended for internal use only within the data classification module.
 * The double-underscore prefix indicates it should not be used by external consumers.
 * @param obj - Object to search
 * @param field - Field name to look for
 * @returns True if the field exists in the object or any nested object
 */
export function __hasNestedField(obj: unknown, field: string): boolean {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null) {
      if (field in value) {
        return true;
      }
      if (__hasNestedField(value, field)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get field pattern classification
 */

function getFieldClassification(fieldName: string): {
  classification: DataClassification;
  category: DataCategory;
} | null {
  const normalizedName = fieldName.toLowerCase();

  if (normalizedName in FIELD_PATTERNS) {
    return FIELD_PATTERNS[normalizedName] ?? null;
  }

  return null;
}

/**
 * Classify data based on content analysis
 *
 * Analyzes field names and values to determine classification level.
 * Supports nested object detection.
 *
 * @param data - Data object to classify
 * @returns Classification result with level and category
 */
export function classifyData(data: Record<string, unknown>): ClassificationResult {
  let highestClassification: DataClassification = DataClassification.PUBLIC;
  let highestCategory: DataCategory = DataCategory.NONE;

  // Check field names
  for (const fieldName of Object.keys(data)) {
    const fieldClassification = getFieldClassification(fieldName);

    if (fieldClassification) {
      if (
        fieldClassification.classification === DataClassification.RESTRICTED ||
        fieldClassification.classification === DataClassification.CONFIDENTIAL
      ) {
        return {
          classification: fieldClassification.classification,
          category: fieldClassification.category
        };
      }

      if (fieldClassification.classification === DataClassification.INTERNAL) {
        highestClassification = DataClassification.INTERNAL;
        highestCategory = fieldClassification.category;
      }
    }
  }

  // Check nested objects
  for (const value of Object.values(data)) {
    if (typeof value === 'object' && value !== null) {
      const nestedResult = classifyData(value as Record<string, unknown>);

      if (
        nestedResult.classification === DataClassification.RESTRICTED ||
        nestedResult.classification === DataClassification.CONFIDENTIAL
      ) {
        return nestedResult;
      }

      if (nestedResult.classification === DataClassification.INTERNAL) {
        highestClassification = DataClassification.INTERNAL;
        highestCategory = nestedResult.category;
      }
    }
  }

  return {
    classification: highestClassification,
    category: highestCategory
  };
}

/**
 * Classify data with manual override
 *
 * Allows manual classification override with optional reason.
 *
 * @param data - Data object to classify
 * @param override - Manual classification override
 * @returns Classification result
 */
export function classifyDataWithOverride(
  data: Record<string, unknown>,
  override?: ManualClassification
): ClassificationResult {
  if (override) {
    return {
      classification: override.classification,
      category: override.category
    };
  }

  return classifyData(data);
}

/**
 * Check if data classification requires encryption
 *
 * @param classification - Data classification level
 * @returns True if encryption is required
 */
export function requiresEncryption(classification: DataClassification): boolean {
  return ClassificationRules[classification].storage === StorageType.ENCRYPTED;
}

/**
 * Check if data access requires audit logging
 *
 * @param classification - Data classification level
 * @returns True if audit logging is required
 */
export function requiresAudit(classification: DataClassification): boolean {
  return ClassificationRules[classification].audit;
}

/**
 * Get storage requirements for classification
 *
 * @param classification - Data classification level
 * @returns Storage requirements
 */
export function getStorageRequirements(classification: DataClassification): {
  readonly encrypted: boolean;
  readonly retention: string;
  readonly access: string;
} {
  const rules = ClassificationRules[classification];
  return {
    encrypted: rules.storage === 'encrypted',
    retention: rules.retention,
    access: rules.access
  };
}
