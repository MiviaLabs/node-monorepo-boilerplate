/**
 * Database-Backed JWT Strategy
 *
 * Extends the standard JWT strategy to fetch roles from the database
 * instead of relying on JWT token claims. This bypasses Firebase custom
 * claims propagation delay.
 *
 * Roles are cached in Redis for 5 minutes to balance performance
 * with data freshness.
 *
 * NOTE: Uses MAIN_DB directly instead of CachedRoleService for test isolation.
 * CachedRoleService uses RoleService which has a static db import created at
 * module load time, which doesn't work with Testcontainers databases that
 * start after module imports.
 */

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { JwtStrategy } from '@package/auth';
import { userRoles, userTenants } from '@package/db-core';
import { eq, and, or, isNull, gt } from 'drizzle-orm';

import type { JwtPayload, JwtStrategyOptions } from '@package/auth';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { MAIN_DB } from '@/common/database/database.constants';

/**
 * User object with database-backed roles
 */
interface DatabaseBackedUser {
  userId: string;
  username?: string;
  name?: string;
  email?: string;
  tenantId: string;
  actorId: string;
  roles: string[];
  permissions?: string[]; // Optional: embedded permissions from JWT
}

/**
 * Database-Backed JWT Strategy
 *
 * Fetches roles from database instead of JWT token claims.
 * This bypasses Firebase custom claims propagation delay.
 */
@Injectable()
export class DatabaseBackedJwtStrategy extends PassportStrategy(JwtStrategy, 'jwt') {
  constructor(
    options: JwtStrategyOptions,
    // Note: db is the injected MAIN_DB connection
    @Inject(MAIN_DB) readonly db: NodePgDatabase
  ) {
    super(options);
  }

  /**
   * Get all roles for a user (system + tenant)
   *
   * @param userId - User ID
   * @param tenantId - Tenant ID (optional)
   * @returns Array of role strings
   */
  private async getUserRoles(userId: number, tenantId?: number): Promise<string[]> {
    // Get from database using injected MAIN_DB connection
    const systemRoles = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          // Filter out expired roles
          or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, new Date()))
        )
      );

    // Use string array to accept both system and tenant roles
    const roles: string[] = systemRoles.map((r) => r.role);

    if (tenantId) {
      const tenantRole = await this.db
        .select({ role: userTenants.role, isActive: userTenants.isActive })
        .from(userTenants)
        .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, tenantId)))
        .limit(1);

      if (tenantRole.length > 0 && tenantRole[0]?.isActive) {
        roles.push(tenantRole[0].role);
      }
    }

    return roles;
  }

  /**
   * Validate JWT payload and attach database-backed roles
   *
   * @param payload - Decoded JWT payload
   * @returns User object with roles from database
   */
  async validate(payload: JwtPayload): Promise<DatabaseBackedUser> {
    // Verify required claims
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject claim');
    }

    if (!payload.tenant_id) {
      throw new UnauthorizedException('Token must contain tenant_id claim');
    }

    // Parse user ID from JWT custom claim (db_user_id)
    // Note: payload.sub is the Firebase UID, not the database user ID
    const userId = parseInt(payload.db_user_id as string, 10);
    if (isNaN(userId)) {
      throw new UnauthorizedException('Invalid token: db_user_id must be a number');
    }

    // Parse tenant ID
    const tenantId = parseInt(payload.tenant_id, 10);
    if (isNaN(tenantId)) {
      throw new UnauthorizedException('Invalid token: tenant_id must be a number');
    }

    // Fetch roles from database (with Redis caching)
    // NOTE: We use injected MAIN_DB instead of CachedRoleService because
    // RoleService uses a static db import that doesn't work with Testcontainers
    const roles = await this.getUserRoles(userId, tenantId);

    // Include embedded permissions if present in JWT and has values
    // This allows permission guards to use JWT permissions instead of database lookup
    const embeddedPermissions =
      payload.permissions && Array.isArray(payload.permissions) && payload.permissions.length > 0
        ? { permissions: payload.permissions }
        : {};

    // Build user object
    const user: DatabaseBackedUser = {
      userId: payload.sub,
      ...(payload.username !== undefined && { username: payload.username }),
      ...(payload.name !== undefined && { name: payload.name }),
      ...(payload.email !== undefined && { email: payload.email }),
      tenantId: payload.tenant_id,
      actorId: payload.actor_id ?? payload.sub,
      roles, // Roles from database, not JWT
      ...embeddedPermissions
    };

    return user;
  }
}
