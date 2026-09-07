import { headers } from 'next/headers';

import { recordPhase0Note } from '~/lib/diagnostics/phase-zero-diagnostics';
import { rootRouter } from '~/server/api/root';
import { createTRPCContext } from '~/server/api/trpc';

type ProcedureWrapper<TArgs, TResult> = {
  mutate: (input: TArgs) => Promise<TResult>;
  query: (input: TArgs) => Promise<TResult>;
};

type WrappedCaller<T> = {
  [K in keyof T]: T[K] extends (input: infer TArgs) => Promise<infer TResult>
    ? ProcedureWrapper<TArgs, TResult>
    : T[K] extends (input: infer TArgs) => infer TResult
      ? ProcedureWrapper<TArgs, Awaited<TResult>>
      : T[K] extends Record<string, unknown>
        ? WrappedCaller<T[K]>
        : T[K];
};

function resolveProcedure(
  caller: Record<string, unknown>,
  path: readonly string[]
): ((input: unknown) => Promise<unknown>) | ((input: unknown) => unknown) {
  let current: unknown = caller;

  for (const segment of path) {
    if (!current || (typeof current !== 'object' && typeof current !== 'function')) {
      throw new TypeError(`tRPC caller path "${path.join('.')}" is not available`);
    }

    current = Reflect.get(current, segment);
  }

  if (typeof current !== 'function') {
    throw new TypeError(`tRPC caller path "${path.join('.')}" did not resolve to a procedure`);
  }

  return current as (input: unknown) => Promise<unknown>;
}

function createWrappedProxy(
  caller: Record<string, unknown>,
  path: readonly string[] = []
): unknown {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        if (property === 'query' || property === 'mutate') {
          return async (input: unknown) => {
            const procedure = resolveProcedure(caller, path);
            return procedure(input);
          };
        }

        return createWrappedProxy(caller, [...path, property]);
      }
    }
  );
}

function wrapCaller<T extends Record<string, unknown>>(caller: T): WrappedCaller<T> {
  return createWrappedProxy(caller) as WrappedCaller<T>;
}

export async function createServerTrpcClient() {
  const requestHeaders = await headers();

  recordPhase0Note('web.trpc.server_client.target', {
    transport: 'in-process'
  });

  const context = await createTRPCContext({ headers: requestHeaders });
  const caller = rootRouter.createCaller(context);

  return wrapCaller(caller);
}
