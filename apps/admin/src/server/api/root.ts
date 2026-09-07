import { appRouter } from './routers/_app';

export const rootRouter = appRouter;

export type RootRouter = typeof rootRouter;
