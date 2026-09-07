import { appRouter } from './_app';

describe('healthRouter', () => {
  it('returns a typed hello payload', async () => {
    const caller = appRouter.createCaller({
      headers: new Headers()
    });

    const result = await caller.health.hello({ text: 'team' });

    expect(result).toEqual({
      greeting: 'Hello team',
      app: 'admin'
    });
  });

  it('returns ok status', async () => {
    const caller = appRouter.createCaller({
      headers: new Headers()
    });

    await expect(caller.health.status()).resolves.toEqual({
      ok: true,
      app: 'admin'
    });
  });
});
