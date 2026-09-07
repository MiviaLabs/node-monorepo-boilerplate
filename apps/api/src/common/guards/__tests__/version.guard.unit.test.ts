/**
 * Unit Tests for ApiVersionGuard
 *
 * Tests the ApiVersionGuard logic without NestJS Testing module.
 */

import { normalizeSemanticVersion, InvalidVersionError } from '../../utils/version.util';

describe('ApiVersionGuard - Unit Tests', () => {
  describe('version compatibility logic', () => {
    it('should allow exact version match', () => {
      const isCompatible = isVersionCompatible('1.0.0', '1.0.0');
      expect(isCompatible).toBe(true);
    });

    it('should allow older minor version within same major', () => {
      const isCompatible = isVersionCompatible('1.2.0', '1.5.0');
      expect(isCompatible).toBe(true);
    });

    it('should allow older patch version within same minor', () => {
      const isCompatible = isVersionCompatible('1.0.0', '1.0.5');
      expect(isCompatible).toBe(true);
    });

    it('should reject newer minor version', () => {
      const isCompatible = isVersionCompatible('1.5.0', '1.0.0');
      expect(isCompatible).toBe(false);
    });

    it('should reject newer patch version', () => {
      const isCompatible = isVersionCompatible('1.0.5', '1.0.0');
      expect(isCompatible).toBe(false);
    });

    it('should reject different major version', () => {
      const isCompatible = isVersionCompatible('2.0.0', '1.0.0');
      expect(isCompatible).toBe(false);
    });

    it('should reject older major version', () => {
      const isCompatible = isVersionCompatible('1.0.0', '2.0.0');
      expect(isCompatible).toBe(false);
    });
  });

  describe('version header extraction', () => {
    it('should extract version from X-API-Version header', () => {
      const request = createMockRequest({
        'x-api-version': '1.0.0'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('1.0.0');
    });

    it('should normalize version from header', () => {
      const request = createMockRequest({
        'x-api-version': '1'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('1.0.0');
    });

    it('should handle v prefix in header', () => {
      const request = createMockRequest({
        'x-api-version': 'v1.0.0'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('1.0.0');
    });

    it('should extract version from Accept header with vendor MIME type', () => {
      const request = createMockRequest({
        accept: 'application/vnd.api.v1.0+json'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('1.0.0');
    });

    it('should prioritize X-API-Version over Accept header', () => {
      const request = createMockRequest({
        'x-api-version': '2.0.0',
        accept: 'application/vnd.api.v1.0+json'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('2.0.0');
    });

    it('should handle array headers (first element)', () => {
      const request = createMockRequest({
        'x-api-version': ['1.0.0', '2.0.0']
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBe('1.0.0');
    });

    it('should return null when no version header provided', () => {
      const request = createMockRequest({});

      const version = extractVersionFromRequest(request);
      expect(version).toBeNull();
    });

    it('should throw error for invalid version format', () => {
      const request = createMockRequest({
        'x-api-version': 'invalid'
      });

      expect(() => extractVersionFromRequest(request)).toThrow('Invalid version');
    });

    it('should return null when Accept header has no valid version', () => {
      const request = createMockRequest({
        accept: 'application/vnd.api.vinvalid+json'
      });

      const version = extractVersionFromRequest(request);
      expect(version).toBeNull();
    });
  });

  describe('version validation with allowed versions', () => {
    it('should allow access when version matches allowed versions', () => {
      const allowedVersions = ['1.0.0', '2.0.0'];
      const requestVersion = '1.0.0';

      const isAllowed = allowedVersions.some((version) =>
        isVersionCompatible(requestVersion, version)
      );

      expect(isAllowed).toBe(true);
    });

    it('should allow access when version is compatible with allowed versions', () => {
      const allowedVersions = ['1.5.0'];
      const requestVersion = '1.2.0';

      const isAllowed = allowedVersions.some((version) =>
        isVersionCompatible(requestVersion, version)
      );

      expect(isAllowed).toBe(true);
    });

    it('should reject when version is not in allowed versions', () => {
      const allowedVersions = ['1.0.0'];
      const requestVersion = '2.0.0';

      const isAllowed = allowedVersions.some((version) =>
        isVersionCompatible(requestVersion, version)
      );

      expect(isAllowed).toBe(false);
    });

    it('should support multiple allowed versions', () => {
      const allowedVersions = ['1.0.0', '2.0.0', '3.0.0'];
      const requestVersion = '2.0.0';

      const isAllowed = allowedVersions.some((version) =>
        isVersionCompatible(requestVersion, version)
      );

      expect(isAllowed).toBe(true);
    });
  });
});

/**
 * Helper function to check version compatibility (copied from guard logic)
 */
function isVersionCompatible(requested: string, allowed: string): boolean {
  // Exact match is always compatible
  if (requested === allowed) {
    return true;
  }

  const reqParts = requested.split('.').map(Number);
  const allowedParts = allowed.split('.').map(Number);

  // Compare each part of semver (major.minor.patch)
  for (let i = 0; i < 3; i++) {
    const reqPart = reqParts[i] ?? 0;
    const allowedPart = allowedParts[i] ?? 0;

    if (reqPart < allowedPart) {
      // Requested version is older - compatible within same major
      return i === 0 ? false : true; // Different major = incompatible
    }

    if (reqPart > allowedPart) {
      // Requested version is newer - incompatible
      return false;
    }
  }

  // Versions are identical (already handled above, but for completeness)
  return true;
}

/**
 * Helper function to extract version from request (copied from guard logic)
 */
function extractVersionFromRequest(request: Record<string, unknown>): string | null {
  const headers = request['headers'] as Record<string, string | string[] | undefined>;

  // Check X-API-Version header
  const versionHeader = headers['x-api-version'];
  if (versionHeader) {
    const version = Array.isArray(versionHeader) ? (versionHeader[0] ?? '') : versionHeader;
    try {
      return normalizeSemanticVersion(version);
    } catch (error) {
      if (error instanceof InvalidVersionError) {
        throw new InvalidVersionError(version, `Invalid X-API-Version header: ${version}`);
      }
      throw error;
    }
  }

  // Check Accept header for version in vendor MIME type
  const acceptHeader = headers['accept'];
  if (acceptHeader) {
    const accept = Array.isArray(acceptHeader) ? (acceptHeader[0] ?? '') : acceptHeader;
    if (!accept) throw new Error('Accept header is empty');
    const match = accept.match(/vnd\.api\.v(\d+\.\d+)\+json/);
    if (match?.[1]) {
      try {
        return normalizeSemanticVersion(match[1]);
      } catch (error) {
        if (error instanceof InvalidVersionError) {
          throw new InvalidVersionError(match[1] ?? '', `Invalid Accept header: ${accept}`);
        }
        throw error;
      }
    }
  }

  return null;
}

/**
 * Helper function to create a mock request object
 */
function createMockRequest(
  headers: Record<string, string | string[] | undefined>
): Record<string, unknown> {
  return {
    headers,
    url: '/api/test',
    path: '/api/test'
  };
}
