import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { withApiHandler } from '@/app/api/_lib/http';
import {
  DEMO_VIEW_QA_COOKIE,
  DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/us-demo/view-tracking-contract';
import { createDemoQaCookieValue } from '@/lib/us-demo/view-tracking-server';

export const runtime = 'nodejs';

export const POST = withApiHandler(async () => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const response = NextResponse.json({
    ok: true,
    excludedForSeconds: DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set({
    name: DEMO_VIEW_QA_COOKIE,
    value: createDemoQaCookieValue(),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/preview',
    maxAge: DEMO_VIEW_QA_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
});
