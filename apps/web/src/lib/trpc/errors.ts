import { TRPCClientError } from '@trpc/client';
import { TRPCError } from '@trpc/server';

const ACCESS_ERROR_CODES = new Set(['FORBIDDEN', 'NOT_FOUND', 'UNAUTHORIZED']);

export function isHandledTrpcAccessError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return ACCESS_ERROR_CODES.has(String(error.data?.code ?? ''));
  }

  if (error instanceof TRPCError) {
    return ACCESS_ERROR_CODES.has(error.code);
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    return ACCESS_ERROR_CODES.has(String(error.code));
  }

  return false;
}
