import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const healthRouter = createTRPCRouter({
  hello: publicProcedure.input(z.object({ text: z.string().min(1) })).query(({ input }) => {
    return {
      greeting: `Hello ${input.text}`,
      app: 'admin'
    };
  }),
  status: publicProcedure.query(() => {
    return {
      ok: true,
      app: 'admin'
    };
  })
});
