import type { NextRequest } from 'next/server';

import { handleAdminRefresh } from '~/lib/auth/api';

export async function POST(req: NextRequest) {
  return handleAdminRefresh(req);
}
