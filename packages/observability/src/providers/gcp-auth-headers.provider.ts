/**
 * Google Auth Headers Provider for OTLP HTTP exporters
 *
 * Provides OAuth2 access tokens via HTTP headers for authentication
 * with GCP Cloud Monitoring OTLP endpoint.
 *
 * This is a shared utility used by both GCP Metrics and Trace providers
 * to avoid code duplication.
 */

import { GoogleAuth } from 'google-auth-library';

/**
 * Google Auth Headers Provider
 *
 * Manages OAuth2 access token lifecycle including retrieval, caching,
 * and automatic refresh for GCP OTLP endpoints.
 */
export class GoogleAuthHeadersProvider {
  private auth: GoogleAuth;
  // private _credentials?: Record<string, unknown>;
  private cachedAccessToken?: string;
  private tokenExpiryTime?: number;

  constructor(credentials?: Record<string, unknown>) {
    // this._credentials = credentials;
    this.auth = credentials
      ? new GoogleAuth({ credentials: credentials as Record<string, string> })
      : new GoogleAuth();
  }

  /**
   * Get headers with authorization for HTTP requests
   * This is called as a function to allow dynamic token refresh
   */
  async getHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.getAccessToken();
    return {
      Authorization: `Bearer ${accessToken}`
    };
  }

  /**
   * Allow the class to be called as a function
   */
  async(): Promise<Record<string, string>> {
    return this.getHeaders();
  }

  /**
   * Get access token with caching and automatic refresh
   */
  private async getAccessToken(): Promise<string> {
    // Check if cached token is still valid (with 5 minute buffer)
    if (this.cachedAccessToken && this.tokenExpiryTime) {
      const now = Date.now();
      const fiveMinutesInMillis = 5 * 60 * 1000;

      if (now < this.tokenExpiryTime - fiveMinutesInMillis) {
        return this.cachedAccessToken;
      }
    }

    // Fetch new access token
    const accessToken = await this.auth.getAccessToken();

    if (!accessToken) {
      throw new Error('Failed to retrieve access token from Google Auth');
    }

    // Parse token to get expiry time (JWT tokens have exp claim)
    const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
    try {
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        // Convert base64url to base64 for proper decoding
        let base64 = parts[1];
        if (!base64) {
          throw new Error('Invalid token: missing payload');
        }
        base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        while (base64.length % 4) {
          base64 += '=';
        }
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString());
        if (payload.exp) {
          this.tokenExpiryTime = payload.exp * 1000; // Convert to milliseconds
        } else {
          // JWT without exp claim: set default expiry
          this.tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
        }
      } else {
        // Non-JWT token (opaque): set default expiry
        this.tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
      }
    } catch {
      // If we can't parse the token, set expiry to 1 hour from now
      this.tokenExpiryTime = Date.now() + DEFAULT_TOKEN_LIFETIME_MS;
    }

    this.cachedAccessToken = accessToken;
    return accessToken;
  }
}
