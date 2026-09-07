import type { NextRequest } from 'next/server';

import { handleAdminLogout } from '~/lib/auth/api';

export async function POST(req: NextRequest) {
  return handleAdminLogout(req);
}
