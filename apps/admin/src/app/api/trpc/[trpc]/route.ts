import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

import type { NextRequest } from 'next/server';

import { rootRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

async function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: rootRouter,
    createContext: async ({ resHeaders }) =>
      createTRPCContext({ headers: req.headers, resHeaders }),
    batching: {
      enabled: true
    },
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`tRPC failed on ${path ?? '<no-path>'}:`, error);
          }
        : undefined
  });
}

export { handler as GET, handler as POST };
