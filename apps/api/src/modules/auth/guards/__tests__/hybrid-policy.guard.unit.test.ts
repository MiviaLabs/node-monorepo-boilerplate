import { ForbiddenException } from '@nestjs/common';

import { HybridPolicyGuard } from '../hybrid-policy.guard';

import type { EnhancedPermissionsGuard } from '../auth.guards';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { OpaService } from '@package/opa';

function createExecutionContext(
  requestOverrides?: Partial<Record<string, unknown>>
): ExecutionContext {
  const request = {
    method: 'GET',
    url: '/api/v1/people',
    headers: { 'x-tenant-id': '1' },
    user: {
      userId: 100,
      tenantId: '1',
      systemRoles: [],
      tenantRoles: ['tenant_admin'],
      permissions: ['tenant:users:read']
    },
    params: {},
    ...requestOverrides
  };

  return {
    getClass: () => ({}) as object,
    getHandler: () => ({}) as object,
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}

describe('HybridPolicyGuard', () => {
  const originalMode = process.env['OPA_ENFORCEMENT_MODE'];

  const reflector = {
    getAllAndOverride: jest.fn()
  } as unknown as jest.Mocked<Reflector>;
  const opaService = {
    isAuthorized: jest.fn(),
    healthCheck: jest.fn()
  } as unknown as jest.Mocked<OpaService>;
  const legacyCanActivate = jest.fn();
  const legacyGuard = {
    canActivate: legacyCanActivate
  } as unknown as EnhancedPermissionsGuard;
  const limit = jest.fn();
  const where = jest.fn(() => ({ limit }));
  const leftJoin = jest.fn(() => ({ where }));
  const from = jest.fn(() => ({ leftJoin, where }));
  const db = {
    select: jest.fn(() => ({ from }))
  };

  const guard = new HybridPolicyGuard(
    reflector,
    undefined,
    undefined,
    opaService,
    legacyGuard,
    db as never
  );

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env['OPA_ENFORCEMENT_MODE'];
    } else {
      process.env['OPA_ENFORCEMENT_MODE'] = originalMode;
    }

    jest.clearAllMocks();
    limit.mockReset();
  });

  it('uses legacy guard when mode is off', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'off';
    legacyCanActivate.mockResolvedValue(true);

    const allowed = await guard.canActivate(createExecutionContext());

    expect(allowed).toBe(true);
    expect(legacyCanActivate).toHaveBeenCalledTimes(1);
    expect(opaService.isAuthorized).not.toHaveBeenCalled();
  });

  it('denies in strict mode when metadata is missing', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'strict';
    reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

    await expect(guard.canActivate(createExecutionContext())).rejects.toThrow(ForbiddenException);
  });

  it('allows in hybrid mode when OPA allows', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'users', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(true);

    const allowed = await guard.canActivate(createExecutionContext({ params: { id: '100' } }));

    expect(allowed).toBe(true);
    expect(opaService.isAuthorized).toHaveBeenCalledTimes(1);
    expect(legacyGuard.canActivate).not.toHaveBeenCalled();
  });

  it('splits combined roles into system and tenant roles for OPA input', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'system_settings', scope: 'system' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(true);

    await guard.canActivate(
      createExecutionContext({
        user: {
          userId: 100,
          tenantId: '1',
          roles: ['system_admin', 'tenant_admin'],
          permissions: ['system:system:settings']
        }
      })
    );

    expect(opaService.isAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          system_roles: ['system_admin'],
          tenant_roles: ['tenant_admin']
        })
      })
    );
  });

  it('adds project membership context to OPA resource attributes', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'projects', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(true);
    limit.mockResolvedValue([
      {
        id: 56,
        ownerId: 34,
        organizationId: 1,
        visibility: 'private',
        memberUserId: 100
      }
    ]);

    await guard.canActivate(
      createExecutionContext({
        user: {
          userId: 100,
          tenantId: '1',
          tenantRoles: ['tenant_user'],
          permissions: ['tenant:projects:read']
        },
        params: { id: '56' }
      })
    );

    expect(opaService.isAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          id: '56',
          owner_id: '34',
          attributes: expect.objectContaining({
            visibility: 'private',
            is_member: true
          })
        })
      })
    );
    expect(db.select).toHaveBeenCalled();
  });

  it('does not query project authorization context for non-project resources', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'users', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(true);

    const allowed = await guard.canActivate(createExecutionContext({ params: { id: '100' } }));

    expect(allowed).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('preserves missing project context by omitting project attributes', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'projects', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(true);
    limit.mockResolvedValue([]);

    await guard.canActivate(
      createExecutionContext({
        user: {
          userId: 100,
          tenantId: '1',
          tenantRoles: ['tenant_user'],
          permissions: ['tenant:projects:read']
        },
        params: { id: '56' }
      })
    );

    expect(opaService.isAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({
          id: '56',
          owner_id: undefined,
          organization_id: '1',
          attributes: undefined
        })
      })
    );
  });

  it('falls back to legacy when OPA denies and health check is unavailable in hybrid', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'users', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(false);
    opaService.healthCheck.mockResolvedValue(false);
    legacyCanActivate.mockResolvedValue(true);

    const allowed = await guard.canActivate(createExecutionContext());

    expect(allowed).toBe(true);
    expect(legacyCanActivate).toHaveBeenCalledTimes(1);
  });

  it('denies when OPA denies and is healthy in hybrid mode', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'hybrid';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'users', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(false);
    opaService.healthCheck.mockResolvedValue(true);

    await expect(guard.canActivate(createExecutionContext())).rejects.toThrow(ForbiddenException);
    expect(legacyCanActivate).not.toHaveBeenCalled();
  });

  it('runs shadow mode mismatch logging and returns legacy decision', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'shadow';
    reflector.getAllAndOverride
      .mockReturnValueOnce({ type: 'users', scope: 'tenant' })
      .mockReturnValueOnce('read');
    opaService.isAuthorized.mockResolvedValue(false);
    legacyCanActivate.mockResolvedValue(true);
    const warnSpy = jest.spyOn(
      (guard as unknown as { logger: { warn: (...args: unknown[]) => void } }).logger,
      'warn'
    );

    const allowed = await guard.canActivate(createExecutionContext());

    expect(allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('parses strict mode when env value includes inline comment', async () => {
    process.env['OPA_ENFORCEMENT_MODE'] = 'strict # local';
    reflector.getAllAndOverride.mockReturnValueOnce(undefined).mockReturnValueOnce(undefined);

    await expect(guard.canActivate(createExecutionContext())).rejects.toThrow(ForbiddenException);
  });
});
