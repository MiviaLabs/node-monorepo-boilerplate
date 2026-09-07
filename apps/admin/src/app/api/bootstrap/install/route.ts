import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getErrorMessage, getErrorStatus, installBootstrap } from '~/lib/admin-auth';

const bootstrapInstallSchema = z.object({
  organizationName: z.string().min(2),
  organizationSlug: z.string().min(4),
  displayName: z.string().min(2),
  email: z.email(),
  password: z.string().min(8),
  confirmPassword: z.string()
});

export async function POST(request: Request) {
  try {
    const payload = bootstrapInstallSchema.parse(await request.json());

    if (payload.password !== payload.confirmPassword) {
      return NextResponse.json({ message: 'Passwords do not match.' }, { status: 400 });
    }

    await installBootstrap({
      email: payload.email,
      password: payload.password,
      displayName: payload.displayName,
      organizationName: payload.organizationName,
      organizationSlug: payload.organizationSlug
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to complete bootstrap installation.');
    const status = getErrorStatus(error, 500);
    return NextResponse.json({ message }, { status });
  }
}
