import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const exampleRouter = createTRPCRouter({
  hello: publicProcedure.input(z.object({ text: z.string() })).query(({ input }) => {
    return {
      greeting: `Hello ${input.text}`
    };
  }),

  getAll: publicProcedure.query(async () => {
    // Example: Fetch from database
    // const users = await db.select().from(users);
    return { message: 'Example data' };
  })
});
