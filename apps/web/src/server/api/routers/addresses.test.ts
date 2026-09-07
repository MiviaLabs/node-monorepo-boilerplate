import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addressesRouter } from './addresses';

vi.mock('~/lib/runtime-config', () => ({
  getVersionedApiBaseUrl: vi.fn(() => 'http://localhost:3001/api/v1')
}));

global.fetch = vi.fn();

describe('addressesRouter', () => {
  const authContext = {
    headers: new Headers({
      authorization: 'Bearer access-token',
      'x-tenant-id': '1'
    })
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch user addresses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 7,
            organizationId: 1,
            userId: 9,
            addressType: 'primary',
            label: 'Home',
            countryCode: 'US',
            isDefault: true,
            isVerified: false,
            components: {
              street: '123 Main St',
              city: 'San Francisco',
              state: 'CA',
              postalCode: '94105'
            },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
    });

    const caller = addressesRouter.createCaller(authContext);
    const result = await caller.getUserAddresses({ userId: '9' });

    expect(result).toHaveLength(1);
    expect(result[0]?.addressType).toBe('primary');
    expect(result[0]?.components?.street).toBe('123 Main St');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/people/9/addresses',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
          'x-tenant-id': '1'
        })
      })
    );
  });

  it('should create a user address', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 12,
          organizationId: 1,
          userId: 9,
          addressType: 'billing',
          label: 'Billing',
          countryCode: 'US',
          isDefault: false,
          isVerified: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      })
    });

    const caller = addressesRouter.createCaller(authContext);
    const result = await caller.createUserAddress({
      userId: '9',
      addressType: 'billing',
      label: 'Billing',
      countryCode: 'US',
      components: {
        street: '1 Test St',
        city: 'Testville'
      }
    });

    expect(result.id).toBe(12);
    expect(result.addressType).toBe('billing');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/people/9/addresses',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should map decrypted payloads to components', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 7,
            organizationId: 1,
            userId: 9,
            addressType: 'primary',
            label: 'Home',
            countryCode: 'US',
            isDefault: true,
            isVerified: false,
            decrypted: {
              street: '123 Main St',
              city: 'San Francisco'
            },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
    });

    const caller = addressesRouter.createCaller(authContext);
    const result = await caller.getUserAddresses({ userId: '9' });

    expect(result[0]?.components?.street).toBe('123 Main St');
    expect(result[0]?.components?.city).toBe('San Francisco');
  });

  it('should throw unauthorized when auth context is missing', async () => {
    const caller = addressesRouter.createCaller({ headers: new Headers() });

    await expect(caller.getUserAddresses({ userId: '9' })).rejects.toThrow(TRPCError);
    await expect(caller.getUserAddresses({ userId: '9' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED'
    });
  });

  it('should strip null components before calling API', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 13,
          organizationId: 1,
          userId: 9,
          addressType: 'primary',
          label: 'Home',
          countryCode: 'US',
          isDefault: false,
          isVerified: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      })
    });

    const caller = addressesRouter.createCaller(authContext);
    await caller.createUserAddress({
      userId: '9',
      addressType: 'primary',
      label: 'Home',
      countryCode: 'US',
      components: {
        street: '1 Test St',
        street2: null as unknown as string,
        city: null as unknown as string,
        state: null as unknown as string,
        postalCode: null as unknown as string,
        country: null as unknown as string
      }
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ];
    const body = JSON.parse(String(init.body)) as { components: Record<string, unknown> };
    expect(body.components).toEqual({
      street: '1 Test St'
    });
  });

  it('should preserve explicit empty strings on update payload', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 13,
          organizationId: 1,
          userId: 9,
          addressType: 'primary',
          label: 'Home',
          countryCode: 'US',
          isDefault: false,
          isVerified: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      })
    });

    const caller = addressesRouter.createCaller(authContext);
    await caller.updateUserAddress({
      userId: '9',
      addressId: '13',
      components: {
        street: '',
        city: 'San Francisco'
      }
    });

    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit
    ];
    const body = JSON.parse(String(init.body)) as { components: Record<string, unknown> };
    expect(body.components).toEqual({
      street: '',
      city: 'San Francisco'
    });
  });
});
