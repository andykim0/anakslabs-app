import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { businessPhoneHref } from '@/lib/analytics/trackable-actions';
import { isAcceptableUsBookingUrl } from '@/lib/connectors/validation';
import { getDataServices } from '@/lib/data';
import {
  applyOperatorConnectorPatch,
  connectorManifestFromConfig,
} from '@/lib/operator-model/connectors';

type Ctx = { params: Promise<{ id: string; siteId: string }> };

const optionalPhone = z.string().trim().min(1).max(40)
  .refine((phone) => Boolean(businessPhoneHref(phone)), 'Use a valid phone number.')
  .nullable()
  .optional();
const optionalBookingUrl = z.string().trim().min(1).max(2_000)
  .refine(isAcceptableUsBookingUrl, 'Use a safe HTTPS booking URL.')
  .nullable()
  .optional();
const optionalAddress = z.string().trim().min(1).max(300).nullable().optional();

const bodySchema = z.object({
  phone: optionalPhone,
  bookingUrl: optionalBookingUrl,
  address: optionalAddress,
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one connector field.',
});

export const PATCH = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { id: clientId, siteId } = await params;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { sites } = getDataServices();
  const site = await sites.getById(siteId);
  if (!site || site.clientId !== clientId) {
    return apiError(404, 'SITE_NOT_FOUND', 'Site not found.');
  }
  const current = site.draftConfig ?? site.siteConfig;
  if (!current) {
    return apiError(409, 'SITE_CONFIG_UNAVAILABLE', 'This site has no editable configuration.');
  }
  if (current.meta.locale !== 'en-US') {
    return apiError(409, 'US_CONNECTORS_ONLY', 'This connector endpoint is limited to US sites.');
  }

  const next = applyOperatorConnectorPatch(current, body.data);
  const manifest = connectorManifestFromConfig(next);
  await sites.setConnectorManifest(siteId, manifest);
  return NextResponse.json({
    siteId,
    items: manifest?.items ?? [],
  });
});
