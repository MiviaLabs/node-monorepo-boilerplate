import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { getTrustedAppUrl } from '../../../lib/runtime-config';
import { createTRPCRouter, publicProcedure } from '../trpc';

import type { AdminOperatorUser, AdminSessionPayload } from '~/lib/auth/types';

async function proxyApiRequest<T>(
  headers: Headers,
  resHeaders: Headers,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const url = typeof window === 'undefined' ? `${getTrustedAppUrl()}${endpoint}` : endpoint;

  const cookie = headers.get('cookie');
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {})
    },
    credentials: 'include',
    cache: 'no-store'
  });

  const setCookieHeaders =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter((value): value is string => Boolean(value));

  for (const value of setCookieHeaders) {
    resHeaders.append('set-cookie', value);
  }

  const payload = (await response.json().catch(() => ({ message: 'Request failed' }))) as
    | { data?: T; message?: string }
    | T;

  if (!response.ok) {
    let code: TRPCError['code'] = 'INTERNAL_SERVER_ERROR';
    if (response.status === 400) code = 'BAD_REQUEST';
    else if (response.status === 401) code = 'UNAUTHORIZED';
    else if (response.status === 403) code = 'FORBIDDEN';
    else if (response.status === 404) code = 'NOT_FOUND';
    else if (response.status === 409) code = 'CONFLICT';
    else if (response.status === 429) code = 'TOO_MANY_REQUESTS';
    else if (response.status === 502 || response.status === 503) code = 'BAD_GATEWAY';
    else if (response.status === 504) code = 'TIMEOUT';

    throw new TRPCError({
      code,
      message:
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? ((payload as { message?: string }).message ?? 'Request failed')
          : 'Request failed'
    });
  }

  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return ((payload as { data?: T }).data ?? null) as T;
  }

  return payload as T;
}

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2, 'Display name must be at least 2 characters').max(50),
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone number must be in E.164 format (for example: +14155552671)')
    .or(z.literal(''))
});

export const authRouter = createTRPCRouter({
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    return proxyApiRequest<AdminSessionPayload>(
      ctx.headers,
      ctx.resHeaders,
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    return proxyApiRequest<{ success: boolean }>(ctx.headers, ctx.resHeaders, '/api/auth/logout', {
      method: 'POST'
    });
  }),

  getMe: publicProcedure.query(async ({ ctx }) => {
    return proxyApiRequest<AdminOperatorUser>(ctx.headers, ctx.resHeaders, '/api/auth/me', {
      method: 'GET'
    });
  }),

  updateMyProfile: publicProcedure.input(updateProfileSchema).mutation(async ({ ctx, input }) => {
    return proxyApiRequest<AdminOperatorUser>(ctx.headers, ctx.resHeaders, '/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(input)
    });
  }),

  validateSession: publicProcedure.query(async ({ ctx }) => {
    return proxyApiRequest<{ valid: boolean; user?: AdminOperatorUser }>(
      ctx.headers,
      ctx.resHeaders,
      '/api/auth/validate',
      {
        method: 'GET'
      }
    );
  }),

  refresh: publicProcedure.mutation(async ({ ctx }) => {
    return proxyApiRequest<AdminSessionPayload>(
      ctx.headers,
      ctx.resHeaders,
      '/api/auth/refresh',
      {
        method: 'POST'
      }
    );
  })
});
