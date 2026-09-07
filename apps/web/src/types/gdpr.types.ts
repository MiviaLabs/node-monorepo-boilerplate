/**
 * GDPR Types
 *
 * Type definitions for GDPR data export functionality
 * (Article 15 - Right of Access)
 */

/**
 * User data export response
 *
 * Complete export of all user data matching backend UserDataExport interface
 */
export interface UserDataExport {
  user: {
    id: string;
    email: string;
    displayName: string;
    isVerified: boolean;
    isActive: boolean;
    createdAt: string;
    updatedAt: string | null;
    lastSignInAt: string | null;
  };
  identities: Array<{
    provider: string;
    displayName: string;
    emailVerified: boolean;
    createdAt: string;
  }>;
  organization: {
    id: string;
    name: string;
  };
  exportedAt: string;
  exportedBy: string;
}

/**
 * Export status for UI state management
 */
export const enum ExportStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}
