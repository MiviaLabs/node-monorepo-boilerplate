import { httpLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import superjson from 'superjson';

import type { RootRouter } from '~/server/api/root';

export const api = createTRPCReact<RootRouter>();

export const apiClient = api.createClient({
  links: [
    httpLink({
      url: '/api/trpc',
      transformer: superjson
    })
  ]
});
