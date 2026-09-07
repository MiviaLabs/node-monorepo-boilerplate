import type { NextRequest } from 'next/server';

import { handleAdminMe, handleAdminUpdateMe } from '~/lib/auth/api';

export async function GET(req: NextRequest) {
  return handleAdminMe(req);
}

export async function PATCH(req: NextRequest) {
  return handleAdminUpdateMe(req);
}
