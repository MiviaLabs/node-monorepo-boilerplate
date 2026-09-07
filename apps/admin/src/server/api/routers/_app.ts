import { createTRPCRouter } from '../trpc';
import { authRouter } from './auth';
import { healthRouter } from './health';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  health: healthRouter
});

export type AppRouter = typeof appRouter;
