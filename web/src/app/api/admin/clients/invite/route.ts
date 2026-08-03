import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import { isMockMode } from '@/lib/env';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
}).strict();

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const email = body.data.email.toLowerCase();
  const { clients } = getDataServices();
  const existingClient = (await clients.listAll()).find(
    (client) => client.email.toLowerCase() === email,
  );
  if (existingClient) {
    return apiError(409, 'CLIENT_EMAIL_EXISTS', 'A client with this email already exists.');
  }

  if (isMockMode()) {
    const client = await clients.upsertFromAuth({
      id: crypto.randomUUID(),
      name: body.data.name,
      email,
      authProvider: 'email',
    });
    return NextResponse.json({
      client,
      inviteUrl: `/login?invited=${encodeURIComponent(client.id)}`,
      delivery: 'mock',
    }, { status: 201 });
  }

  const auth = getServiceRoleClient().auth.admin;
  for (let page = 1; page <= 100; page += 1) {
    const listed = await auth.listUsers({ page, perPage: 1_000 });
    if (listed.error) throw new Error(`auth user lookup failed: ${listed.error.message}`);
    if (listed.data.users.some((user) => user.email?.toLowerCase() === email)) {
      return apiError(
        409,
        'AUTH_ACCOUNT_ALREADY_EXISTS_UNBOUND',
        'An authentication account already exists for this email and is not bound to this client.',
      );
    }
    if (listed.data.users.length < 1_000) break;
    if (page === 100) throw new Error('auth user lookup exceeded the fail-closed pagination limit');
  }

  const redirectTo = new URL('/api/auth/callback?next=/dashboard', request.nextUrl.origin).toString();
  const generated = await auth.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
      data: {
        full_name: body.data.name,
        account_issued_by: 'operator',
      },
    },
  });
  if (generated.error || !generated.data.user || !generated.data.properties?.hashed_token) {
    throw new Error(`client invitation failed: ${generated.error?.message ?? 'missing invite result'}`);
  }

  try {
    const client = await clients.upsertFromAuth({
      id: generated.data.user.id,
      name: body.data.name,
      email,
      authProvider: 'email',
    });
    const inviteUrl = new URL('/api/auth/confirm-invite', request.nextUrl.origin);
    inviteUrl.searchParams.set('token_hash', generated.data.properties.hashed_token);
    inviteUrl.searchParams.set('type', 'invite');
    return NextResponse.json({
      client,
      inviteUrl: inviteUrl.toString(),
      delivery: 'operator',
    }, { status: 201 });
  } catch (error) {
    await auth.deleteUser(generated.data.user.id).catch(() => undefined);
    throw error;
  }
});
