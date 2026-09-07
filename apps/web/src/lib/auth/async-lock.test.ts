import { describe, expect, it, vi } from 'vitest';

import { type AsyncLockRef, runSingleFlight } from './async-lock';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('runSingleFlight', () => {
  it('runs task only once for concurrent callers', async () => {
    const gate = deferred<void>();
    const lockRef: AsyncLockRef<number> = { current: null };
    const task = vi.fn(async () => {
      await gate.promise;
      return 42;
    });

    const p1 = runSingleFlight(lockRef, task);
    const p2 = runSingleFlight(lockRef, task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(lockRef.current).not.toBeNull();

    gate.resolve();

    await expect(p1).resolves.toBe(42);
    await expect(p2).resolves.toBe(42);
    expect(lockRef.current).toBeNull();
  });

  it('unlocks after success and allows next execution', async () => {
    const lockRef: AsyncLockRef<number> = { current: null };
    const task = vi.fn(async () => 1);

    await expect(runSingleFlight(lockRef, task)).resolves.toBe(1);
    await expect(runSingleFlight(lockRef, task)).resolves.toBe(1);

    expect(task).toHaveBeenCalledTimes(2);
    expect(lockRef.current).toBeNull();
  });

  it('unlocks after failure and propagates same rejection to concurrent callers', async () => {
    const gate = deferred<void>();
    const lockRef: AsyncLockRef<number> = { current: null };
    const task = vi.fn(async () => {
      await gate.promise;
      throw new Error('boom');
    });

    const p1 = runSingleFlight(lockRef, task);
    const p2 = runSingleFlight(lockRef, task);

    expect(task).toHaveBeenCalledTimes(1);

    gate.resolve();

    await expect(p1).rejects.toThrow('boom');
    await expect(p2).rejects.toThrow('boom');
    expect(lockRef.current).toBeNull();
  });
});
