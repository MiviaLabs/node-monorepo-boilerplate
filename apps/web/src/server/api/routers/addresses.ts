import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

import type {
  CreateUserAddressInput,
  UpdateUserAddressInput,
  UserAddress
} from '~/types/address.types';

import { resolveServerRequestAuthContextFromHeaders } from '~/lib/auth/server-request-auth';
import { getVersionedApiBaseUrl } from '~/lib/runtime-config';

const addressTypeSchema = z.enum(['primary', 'billing', 'shipping', 'office']);

const nullableOptionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional()
  );

const nullableOptionalTrimmedStringAllowEmpty = (maxLength: number) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? undefined : value),
    z.string().trim().max(maxLength).optional()
  );

const addressComponentsSchema = z.object({
  street: nullableOptionalTrimmedString(255).optional(),
  street2: nullableOptionalTrimmedString(255).optional(),
  city: nullableOptionalTrimmedString(100).optional(),
  state: nullableOptionalTrimmedString(100).optional(),
  postalCode: nullableOptionalTrimmedString(20).optional(),
  country: nullableOptionalTrimmedString(100).optional()
});

const updateAddressComponentsSchema = z.object({
  street: nullableOptionalTrimmedStringAllowEmpty(255).optional(),
  street2: nullableOptionalTrimmedStringAllowEmpty(255).optional(),
  city: nullableOptionalTrimmedStringAllowEmpty(100).optional(),
  state: nullableOptionalTrimmedStringAllowEmpty(100).optional(),
  postalCode: nullableOptionalTrimmedStringAllowEmpty(20).optional(),
  country: nullableOptionalTrimmedStringAllowEmpty(100).optional()
});

const createUserAddressSchema = z.object({
  userId: z.string().regex(/^\d+$/, 'Invalid user ID'),
  addressType: addressTypeSchema,
  isDefault: z.boolean().optional(),
  label: z.string().trim().min(1).max(100).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'Country code must be ISO alpha-2'),
  components: addressComponentsSchema.refine(
    (value) => Object.values(value).some((field) => Boolean(field && field.trim().length > 0)),
    {
      message: 'At least one address component is required'
    }
  )
});

const updateUserAddressSchema = z
  .object({
    userId: z.string().regex(/^\d+$/, 'Invalid user ID'),
    addressId: z.string().regex(/^\d+$/, 'Invalid address ID'),
    addressType: addressTypeSchema.optional(),
    isDefault: z.boolean().optional(),
    label: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Country code must be ISO alpha-2')
      .optional(),
    components: updateAddressComponentsSchema.optional()
  })
  .refine(
    (value) => {
      const hasMetadataUpdate =
        value.addressType !== undefined ||
        value.isDefault !== undefined ||
        value.label !== undefined ||
        value.countryCode !== undefined;
      const hasComponentUpdate =
        value.components !== undefined &&
        Object.values(value.components).some((field) => Boolean(field && field.trim().length > 0));
      return hasMetadataUpdate || hasComponentUpdate;
    },
    {
      message: 'At least one field must be provided for update'
    }
  );

function toIsoString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

function normalizeAddress(raw: unknown): UserAddress {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const components = sanitizeAddressComponents(obj['components'] ?? obj['decrypted']);
  return {
    id: Number(obj['id'] ?? 0),
    organizationId: Number(obj['organizationId'] ?? obj['organization_id'] ?? 0),
    userId: Number(obj['userId'] ?? obj['user_id'] ?? 0),
    addressType: String(obj['addressType'] ?? 'primary') as UserAddress['addressType'],
    label: typeof obj['label'] === 'string' ? obj['label'] : null,
    countryCode: typeof obj['countryCode'] === 'string' ? obj['countryCode'] : null,
    isDefault: Boolean(obj['isDefault']),
    isVerified: Boolean(obj['isVerified']),
    createdAt: toIsoString(obj['createdAt']),
    updatedAt: toIsoString(obj['updatedAt']),
    components: Object.values(components).some(Boolean) ? components : undefined
  };
}

function sanitizeAddressComponents(
  raw: unknown
): NonNullable<CreateUserAddressInput['components']> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const sanitizeField = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

  return {
    street: sanitizeField(input['street']),
    street2: sanitizeField(input['street2']),
    city: sanitizeField(input['city']),
    state: sanitizeField(input['state']),
    postalCode: sanitizeField(input['postalCode']),
    country: sanitizeField(input['country'])
  };
}

function normalizeUpdateAddressComponents(
  raw: unknown
): NonNullable<UpdateUserAddressInput['components']> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const normalizeField = (value: unknown): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined;

  return {
    street: normalizeField(input['street']),
    street2: normalizeField(input['street2']),
    city: normalizeField(input['city']),
    state: normalizeField(input['state']),
    postalCode: normalizeField(input['postalCode']),
    country: normalizeField(input['country'])
  };
}

function mapErrorCode(status: number): TRPCError['code'] {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'TOO_MANY_REQUESTS';
  if (status === 502 || status === 503) return 'BAD_GATEWAY';
  if (status === 504) return 'TIMEOUT';
  return 'INTERNAL_SERVER_ERROR';
}

function mapErrorMessage(status: number): string {
  if (status === 401) return 'Authentication required';
  if (status === 403) return 'You do not have permission to manage addresses';
  if (status === 404) return 'Address not found';
  if (status === 409) return 'Address update conflict';
  if (status >= 500) return 'Address service unavailable';
  return 'Invalid request parameters';
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit,
  ctx: { headers: Headers }
): Promise<T> {
  const resolvedAuth = await resolveServerRequestAuthContextFromHeaders(ctx.headers, {
    source: 'web.trpc.addresses_router',
    route: endpoint
  });

  const authHeader =
    ctx.headers.get('authorization') ??
    (resolvedAuth?.accessToken ? `Bearer ${resolvedAuth.accessToken}` : null);
  const tenantHeader = ctx.headers.get('x-tenant-id') ?? resolvedAuth?.tenantId;

  if (!authHeader || !tenantHeader) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required'
    });
  }

  const response = await fetch(`${getVersionedApiBaseUrl('v1')}${endpoint}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      'x-tenant-id': tenantHeader,
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    console.error('[Addresses API Error]', {
      endpoint,
      status: response.status,
      serverError: error
    });

    throw new TRPCError({
      code: mapErrorCode(response.status),
      message: mapErrorMessage(response.status)
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json()) as { data: T };
  return json.data;
}

export const addressesRouter = createTRPCRouter({
  getUserAddresses: publicProcedure
    .input(
      z.object({
        userId: z.string().regex(/^\d+$/, 'Invalid user ID')
      })
    )
    .query(async ({ input, ctx }): Promise<UserAddress[]> => {
      const response = await apiRequest<unknown[]>(
        `/people/${input.userId}/addresses`,
        { method: 'GET' },
        ctx
      );
      return Array.isArray(response) ? response.map((entry) => normalizeAddress(entry)) : [];
    }),

  createUserAddress: publicProcedure
    .input(createUserAddressSchema)
    .mutation(async ({ input, ctx }): Promise<UserAddress> => {
      const payload: Omit<CreateUserAddressInput, 'userId'> = {
        addressType: input.addressType,
        isDefault: input.isDefault,
        label: input.label,
        countryCode: input.countryCode,
        components: sanitizeAddressComponents(input.components)
      };

      const response = await apiRequest<unknown>(
        `/people/${input.userId}/addresses`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        ctx
      );

      return normalizeAddress(response);
    }),

  updateUserAddress: publicProcedure
    .input(updateUserAddressSchema)
    .mutation(async ({ input, ctx }): Promise<UserAddress> => {
      const payload: Omit<UpdateUserAddressInput, 'userId' | 'addressId'> = {
        addressType: input.addressType,
        isDefault: input.isDefault,
        label: input.label,
        countryCode: input.countryCode,
        components: input.components
          ? normalizeUpdateAddressComponents(input.components)
          : undefined
      };

      const response = await apiRequest<unknown>(
        `/people/${input.userId}/addresses/${input.addressId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload)
        },
        ctx
      );

      return normalizeAddress(response);
    }),

  deleteUserAddress: publicProcedure
    .input(
      z.object({
        userId: z.string().regex(/^\d+$/, 'Invalid user ID'),
        addressId: z.string().regex(/^\d+$/, 'Invalid address ID')
      })
    )
    .mutation(async ({ input, ctx }): Promise<void> => {
      await apiRequest<void>(
        `/people/${input.userId}/addresses/${input.addressId}`,
        { method: 'DELETE' },
        ctx
      );
    }),

  setDefaultAddress: publicProcedure
    .input(
      z.object({
        userId: z.string().regex(/^\d+$/, 'Invalid user ID'),
        addressId: z.string().regex(/^\d+$/, 'Invalid address ID')
      })
    )
    .mutation(async ({ input, ctx }): Promise<UserAddress> => {
      const response = await apiRequest<unknown>(
        `/people/${input.userId}/addresses/${input.addressId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ isDefault: true })
        },
        ctx
      );

      return normalizeAddress(response);
    })
});
