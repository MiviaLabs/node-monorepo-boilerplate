/**
 * Single-flight async lock utility.
 *
 * Ensures only one async task runs at a time for a given lock reference.
 * Concurrent callers receive the in-flight promise instead of starting
 * duplicate work.
 */
export type AsyncLockRef<T> = { current: Promise<T> | null };

/**
 * Run an async task with single-flight semantics.
 *
 * @param lockRef - Mutable lock reference storing current in-flight promise
 * @param task - Async task to run
 * @returns The in-flight promise for this lock
 */
export function runSingleFlight<T>(lockRef: AsyncLockRef<T>, task: () => Promise<T>): Promise<T> {
  if (lockRef.current) {
    return lockRef.current;
  }

  const inFlight = (async () => {
    try {
      return await task();
    } finally {
      lockRef.current = null;
    }
  })();

  lockRef.current = inFlight;
  return inFlight;
}
