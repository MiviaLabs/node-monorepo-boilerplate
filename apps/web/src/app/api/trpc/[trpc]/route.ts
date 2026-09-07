import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import type { NextRequest } from 'next/server';

import { measurePhase0 } from '~/lib/diagnostics/phase-zero-diagnostics';
import { rootRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

export async function GET(req: NextRequest) {
  return measurePhase0(
    'web.trpc.route',
    {
      method: 'GET',
      path: req.nextUrl.pathname
    },
    () =>
      fetchRequestHandler({
        endpoint: '/api/trpc',
        req,
        router: rootRouter,
        createContext: async () => createTRPCContext({ headers: req.headers }),
        batching: {
          enabled: true
        },
        onError:
          process.env.NODE_ENV === 'development'
            ? ({ path, error }) => {
                console.error(`❌ tRPC failed on ${path ?? '<no-path>'}:`, error);
              }
            : undefined
      })
  );
}

export async function POST(req: NextRequest) {
  return measurePhase0(
    'web.trpc.route',
    {
      method: 'POST',
      path: req.nextUrl.pathname
    },
    () =>
      fetchRequestHandler({
        endpoint: '/api/trpc',
        req,
        router: rootRouter,
        createContext: async () => createTRPCContext({ headers: req.headers }),
        batching: {
          enabled: true
        },
        onError:
          process.env.NODE_ENV === 'development'
            ? ({ path, error }) => {
                console.error(`❌ tRPC failed on ${path ?? '<no-path>'}:`, error);
              }
            : undefined
      })
  );
}
