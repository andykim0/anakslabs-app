import { NextResponse } from 'next/server';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import {
  createUsMedicalDemoConsent,
  usMedicalDemoConsentInputSchema,
} from '@/lib/crawl/consent';

export const runtime = 'nodejs';

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'The administrator identity could not be resolved.');
  const body = await parseBody(request, usMedicalDemoConsentInputSchema);
  if (!body.ok) return body.res;
  const consent = await createUsMedicalDemoConsent({
    ...body.data,
    recordedBy: actorId,
  });
  return NextResponse.json({ consent }, { status: 201 });
});
