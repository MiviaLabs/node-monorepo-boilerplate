import { createTRPCRouter } from '../trpc';
import { addressesRouter } from './addresses';
import { authRouter } from './auth';
import { exampleRouter } from './example';
import { membersRouter } from './members';
import { projectsRouter } from './projects';
import { tenantsRouter } from './tenants';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  addresses: addressesRouter,
  auth: authRouter,
  example: exampleRouter,
  members: membersRouter,
  projects: projectsRouter,
  tenants: tenantsRouter
});

// export type definition of API
export type AppRouter = typeof appRouter;
