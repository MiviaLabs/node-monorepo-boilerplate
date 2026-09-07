/**
 * Key Rotation Service
 *
 * Provides JWT key rotation with graceful key transition periods.
 * Supports current and previous keys to avoid token invalidation during rotation.
 *
 * @packageDocumentation
 */

import { Injectable, Logger } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';

import type { ConfigService } from '@nestjs/config';

/**
 * Key metadata
 */
interface KeyMetadata {
  /** Key ID */
  kid: string;
  /** Key value */
  key: string;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Key provider interface
 *
 * Abstraction for key retrieval to support different storage backends
 */
export interface IKeyProvider {
  /**
   * Get the current active key
   */
  getCurrentKey(): Promise<string>;

  /**
   * Get a key by ID
   */
  getKeyById(kid: string): Promise<string | null>;

  /**
   * Rotate to a new key
   */
  rotateKey(): Promise<{ kid: string; key: string }>;

  /**
   * Get all active keys (current + previous)
   */
  getActiveKeys(): Promise<KeyMetadata[]>;
}

/**
 * Environment-based key provider (default implementation)
 */
class EnvironmentKeyProvider implements IKeyProvider {
  private readonly logger = new Logger(EnvironmentKeyProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async getCurrentKey(): Promise<string> {
    const key = this.configService.get<string>('JWT_SECRET');
    if (!key) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    return key;
  }

  async getKeyById(kid: string): Promise<string | null> {
    // For environment-based provider, we only have one key
    // If kid matches the current key, return it
    const currentKey = await this.getCurrentKey();
    const currentKid = this.generateKid(currentKey);
    return kid === currentKid ? currentKey : null;
  }

  async rotateKey(): Promise<{ kid: string; key: string }> {
    // Environment-based provider cannot rotate keys
    // This would require updating JWT_SECRET and restarting
    this.logger.warn(
      'EnvironmentKeyProvider cannot rotate keys. ' +
        'Use a custom IKeyProvider implementation for dynamic key rotation.'
    );
    const key = await this.getCurrentKey();
    return { kid: this.generateKid(key), key };
  }

  async getActiveKeys(): Promise<KeyMetadata[]> {
    const key = await this.getCurrentKey();
    return [
      {
        kid: this.generateKid(key),
        key,
        createdAt: Date.now()
      }
    ];
  }

  /**
   * Generate a key ID from the key value
   */
  private generateKid(key: string): string {
    // Use SHA-256 hash of the key as the key ID
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto');
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 16);
  }
}

/**
 * Rotating JWT Service
 *
 * Wraps NestJS JwtService to support key rotation with grace period.
 *
 * Features:
 * - Adds `kid` (Key ID) header to all tokens
 * - Verifies tokens signed with current or previous keys
 * - Supports graceful key rotation with configurable grace period
 */
@Injectable()
export class RotatingJwtService {
  private readonly logger = new Logger(RotatingJwtService.name);

  private currentKey: KeyMetadata | null = null;
  private previousKeys: Map<string, KeyMetadata> = new Map();
  private gracePeriodMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly keyProvider?: IKeyProvider,
    private readonly nestJwtService?: NestJwtService
  ) {
    // Grace period: 7 days (default)
    const gracePeriodDays =
      this.configService.get<number>('JWT_KEY_ROTATION_GRACE_PERIOD_DAYS') ?? 7;
    this.gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Initialize the service
   */
  async onModuleInit(): Promise<void> {
    await this.loadKeys();
  }

  /**
   * Load current and active keys
   */
  private async loadKeys(): Promise<void> {
    const provider = this.keyProvider ?? new EnvironmentKeyProvider(this.configService);
    const activeKeys = await provider.getActiveKeys();

    if (activeKeys.length === 0) {
      throw new Error('No active keys found');
    }

    // Sort by creation time (newest first)
    activeKeys.sort((a, b) => b.createdAt - a.createdAt);

    // Current key is the newest
    this.currentKey = activeKeys[0] ?? null;

    // Previous keys are the rest (within grace period)
    this.previousKeys.clear();
    const now = Date.now();
    for (const key of activeKeys.slice(1)) {
      if (now - key.createdAt < this.gracePeriodMs) {
        this.previousKeys.set(key.kid, key);
      }
    }

    const currentKeyId = this.currentKey?.kid ?? 'none';
    this.logger.log(
      `Loaded ${activeKeys.length} active key(s) (current: ${currentKeyId}, ` +
        `previous: ${Array.from(this.previousKeys.keys()).join(', ') || 'none'})`
    );
  }

  /**
   * Sign a payload with the current key
   *
   * @param payload - Token payload
   * @param options - JWT signing options
   * @returns Signed JWT token
   */
  async signAsync(
    payload: Record<string, unknown>,
    options?: { expiresIn?: string | number }
  ): Promise<string> {
    if (!this.currentKey) {
      await this.loadKeys();
    }

    // After loadKeys(), currentKey should exist
    if (!this.currentKey) {
      throw new Error('No current key available for signing');
    }

    const jwt = this.nestJwtService ?? new NestJwtService();

    // Parse string expiresIn to seconds (e.g., '1h' -> 3600)
    const expiresInStr =
      options?.expiresIn ?? this.configService.get<string>('JWT_EXPIRES_IN') ?? '1h';
    const expiresIn =
      typeof expiresInStr === 'string' ? this.parseExpirationToSeconds(expiresInStr) : expiresInStr;

    return jwt.signAsync(payload, {
      secret: this.currentKey.key,
      keyid: this.currentKey.kid, // Add kid header
      expiresIn
    });
  }

  /**
   * Parse expiration string to seconds
   * @param expiresIn - Expiration string (e.g., "1h", "30d")
   * @returns Expiration in seconds
   */
  private parseExpirationToSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([hdm])$/);
    if (!match) return 3600; // Default to 1 hour

    const value = parseInt(match[1] ?? '0', 10);
    const unit = match[2];

    switch (unit) {
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      case 'm':
        return value * 60;
      default:
        return 3600;
    }
  }

  /**
   * Verify a token signed with current or previous keys
   *
   * @param token - JWT token to verify
   * @returns Decoded payload
   * @throws Error if token is invalid or signed with unknown key
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async verifyAsync(token: string): Promise<any> {
    if (!this.currentKey) {
      await this.loadKeys();
    }

    // After loadKeys(), currentKey should exist
    if (!this.currentKey) {
      throw new Error('No current key available for verification');
    }

    // Decode first to get kid
    const jwt = this.nestJwtService ?? new NestJwtService();
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const kid = decoded.header?.kid;

    // Try current key
    if (kid === this.currentKey.kid || !kid) {
      return jwt.verifyAsync(token, { secret: this.currentKey.key });
    }

    // Try previous keys
    const previousKey = this.previousKeys.get(kid);
    if (previousKey) {
      this.logger.debug(`Verifying token with previous key: ${kid}`);
      return jwt.verifyAsync(token, { secret: previousKey.key });
    }

    // Key not found
    throw new Error(`Token signed with unknown key: ${kid}`);
  }

  /**
   * Decode a token without verification
   *
   * @param token - JWT token to decode
   * @returns Decoded payload
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decode(token: string): any {
    const jwt = this.nestJwtService ?? new NestJwtService();
    return jwt.decode(token);
  }

  /**
   * Rotate to a new key
   *
   * @returns New key metadata
   */
  async rotateKeys(): Promise<KeyMetadata> {
    if (!this.keyProvider) {
      throw new Error(
        'Key rotation requires a custom IKeyProvider implementation. ' +
          'EnvironmentKeyProvider does not support dynamic rotation.'
      );
    }

    this.logger.log('Rotating JWT signing keys...');

    // Store current key as previous
    if (this.currentKey) {
      this.previousKeys.set(this.currentKey.kid, this.currentKey);
    }

    // Get new key
    const newKey = await this.keyProvider.rotateKey();
    this.currentKey = {
      kid: newKey.kid,
      key: newKey.key,
      createdAt: Date.now()
    };

    // Clean up expired previous keys
    const now = Date.now();
    for (const [kid, key] of this.previousKeys.entries()) {
      if (now - key.createdAt > this.gracePeriodMs) {
        this.previousKeys.delete(kid);
        this.logger.debug(`Removed expired previous key: ${kid}`);
      }
    }

    this.logger.log(`Key rotation complete. New key: ${this.currentKey.kid}`);

    return this.currentKey;
  }

  /**
   * Get current key metadata
   */
  getCurrentKeyMetadata(): KeyMetadata | null {
    return this.currentKey;
  }

  /**
   * Get all active key metadata
   */
  getActiveKeyMetadata(): KeyMetadata[] {
    const keys: KeyMetadata[] = [];
    if (this.currentKey) {
      keys.push(this.currentKey);
    }
    keys.push(...Array.from(this.previousKeys.values()));
    return keys;
  }
}

/**
 * Token for injection
 */
export const ROTATING_JWT_SERVICE_TOKEN = Symbol('ROTATING_JWT_SERVICE');
