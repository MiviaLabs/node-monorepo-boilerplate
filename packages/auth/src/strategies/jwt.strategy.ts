/**
 * JWT Strategy
 *
 * Passport-JWT strategy for JWT authentication
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { TenantContextError } from '../errors';

import type { JwtPayload } from '../types/jwt.types';

/**
 * JWT strategy options
 */
export interface JwtStrategyOptions {
  /** JWT secret (for HS256) or public key (for RS256) */
  secretOrKey: string;
  /** Allowed JWT algorithms - defaults to ['HS256'] for secrets */
  algorithms?: ('HS256' | 'RS256' | 'ES256' | 'PS256')[];
  /** JWT secret or public key provider (async) */
  secretOrKeyProvider?: (
    request: unknown,
    rawJwtToken: string,
    done: (err: unknown, secret?: string) => void
  ) => void;
  /** Token issuer */
  issuer?: string;
  /** Token audience */
  audience?: string;
  /** Ignore token expiration */
  ignoreExpiration?: boolean;
  /** Pass request to callback */
  passReqToCallback?: boolean;
}

/**
 * Passport JWT strategy
 *
 * Validates JWT tokens and attaches user info to the request
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(options: JwtStrategyOptions) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: options.ignoreExpiration ?? false,
      secretOrKey: options.secretOrKey,
      secretOrKeyProvider: options.secretOrKeyProvider,
      issuer: options.issuer,
      audience: options.audience,
      // CRITICAL: Explicitly set allowed algorithms to prevent algorithm confusion attacks
      // Defaults to ['HS256'] for symmetric keys (secrets)
      algorithms: options.algorithms ?? ['HS256']
    });
  }

  /**
   * Validate JWT payload
   *
   * Called automatically by Passport after token is verified
   *
   * @param payload - Decoded JWT payload
   * @returns User object to attach to request
   */
  async validate(payload: JwtPayload): Promise<unknown> {
    // Verify required claims
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject claim');
    }

    if (!payload.tenant_id) {
      throw new TenantContextError('Token must contain tenant_id claim');
    }

    // Check token expiration
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        throw new UnauthorizedException(
          `Token expired at ${new Date(payload.exp * 1000).toISOString()}`
        );
      }
    }

    // Build user object from JWT payload
    const user = {
      userId: payload.sub,
      username: payload.username,
      name: payload.name,
      email: payload.email,
      tenantId: payload.tenant_id,
      actorId: payload.actor_id ?? payload.sub,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? []
    };

    return user;
  }
}
