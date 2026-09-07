import { ADMIN_SESSION_COOKIE } from './cookies';

import type { AdminOperatorUser } from './types';
import type { NextRequest } from 'next/server';

export async function validateAdminRequestSession(request: NextRequest): Promise<{
  valid: boolean;
  user?: AdminOperatorUser;
}> {
  const sessionId = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!sessionId) {
    return { valid: false };
  }

  try {
    const response = await fetch(`${request.nextUrl.origin}/api/auth/validate`, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') ?? ''
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      return { valid: false };
    }

    const payload = (await response.json()) as {
      data?: {
        valid: boolean;
        user?: AdminOperatorUser;
      };
    };

    return payload.data ?? { valid: false };
  } catch {
    return { valid: false };
  }
}
