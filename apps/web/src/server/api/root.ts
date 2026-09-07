import { appRouter } from './routers/_app';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const rootRouter = appRouter;

// export type definition of API
export type RootRouter = typeof rootRouter;
