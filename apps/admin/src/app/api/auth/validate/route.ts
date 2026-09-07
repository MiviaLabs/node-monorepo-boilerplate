import type { NextRequest } from 'next/server';

import { handleAdminValidate } from '~/lib/auth/api';

export async function GET(req: NextRequest) {
  return handleAdminValidate(req);
}

export async function POST(req: NextRequest) {
  return handleAdminValidate(req);
}
