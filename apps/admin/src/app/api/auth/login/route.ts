import { handleAdminLogin } from '../../../../lib/auth/api';

import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  return handleAdminLogin(request);
}
