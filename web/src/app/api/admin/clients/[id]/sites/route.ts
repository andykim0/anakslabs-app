import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getDataServices } from '@/lib/data';
import { getLatestCrawlArtifactBySeedUrl } from '@/lib/crawl/repository';
import {
  buildOperatorClinicNewbuildSiteConfig,
  buildOperatorCrawlSiteConfig,
  buildOperatorMinimalSiteConfig,
  siteFormCount,
} from '@/lib/operator-model/site-generation';
import { generateClinicNewbuildCopy } from '@/lib/ai/clinic-newbuild-copy';
import {
  ClinicNewbuildCopyPolicyError,
  ClinicNewbuildInputError,
} from '@/lib/clinic-master/newbuild';
import {
  CLINIC_DENTAL_SERVICE_IDS,
  CLINIC_NEWBUILD_ACCENT_PRESETS,
  CLINIC_NEWBUILD_MAX_SERVICES,
  CLINIC_NEWBUILD_MIN_SERVICES,
  CLINIC_NEWBUILD_SPECIALTIES,
} from '@/lib/clinic-master/service-taxonomy';
import { PRICING_MODEL_VERSION } from '@/lib/pricing';
import { accountHasSite } from '@/lib/billing/site-limit';
import { businessPhoneHref } from '@/lib/analytics/trackable-actions';
import { isAcceptableUsBookingUrl } from '@/lib/connectors/validation';
import { US_SITE_TIMEZONES } from '@/lib/types/site';
import { ensureDentalStockAssetRefs } from '@/lib/stock/registry';

type Ctx = { params: Promise<{ id: string }> };

const phoneSchema = z.string().trim().min(1).max(40)
  .refine((phone) => Boolean(businessPhoneHref(phone)), 'Use a valid phone number.');
const bookingUrlSchema = z.string().trim().min(1).max(2_000)
  .refine(isAcceptableUsBookingUrl, 'Use a safe HTTPS booking URL.');
const timezoneSchema = z.enum(US_SITE_TIMEZONES);

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('crawl'),
    sourceUrl: z.string().url().refine((url) => /^https?:\/\//u.test(url), 'Use an http(s) URL.'),
    timezone: timezoneSchema.optional(),
    phone: phoneSchema.optional(),
    bookingUrl: bookingUrlSchema.optional(),
  }).strict(),
  z.object({
    mode: z.literal('minimal'),
    businessName: z.string().trim().min(1).max(100),
    industry: z.string().trim().min(1).max(100),
    tone: z.string().trim().min(1).max(40),
    colorPreference: z.string().trim().min(1).max(200),
    timezone: timezoneSchema.optional(),
    phone: phoneSchema.optional(),
    bookingUrl: bookingUrlSchema.optional(),
    address: z.string().trim().min(1).max(300).optional(),
  }).strict(),
  // 신규 제작 — 선언 입력만이 사이트 사실이 된다. 자유 서비스 입력은 없다.
  z.object({
    mode: z.literal('newbuild'),
    businessName: z.string().trim().min(1).max(100),
    specialty: z.enum(CLINIC_NEWBUILD_SPECIALTIES),
    serviceIds: z.array(z.enum(CLINIC_DENTAL_SERVICE_IDS))
      .min(CLINIC_NEWBUILD_MIN_SERVICES)
      .max(CLINIC_NEWBUILD_MAX_SERVICES),
    accentPreset: z.enum(CLINIC_NEWBUILD_ACCENT_PRESETS),
    timezone: timezoneSchema.optional(),
    phone: phoneSchema.optional(),
    bookingUrl: bookingUrlSchema.optional(),
    address: z.string().trim().min(1).max(300).optional(),
    insurances: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
    hours: z.string().trim().min(1).max(300).optional(),
  }).strict(),
]);

export const POST = withApiHandler<Ctx>(async (request, { params }) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const { id: clientId } = await params;
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  const { clients, sites } = getDataServices();
  const client = await clients.getById(clientId);
  if (!client) return apiError(404, 'CLIENT_NOT_FOUND', 'Client not found.');
  if (accountHasSite(await sites.listByClient(clientId), clientId)) {
    return apiError(409, 'ACCOUNT_SITE_LIMIT_REACHED', 'This client already has a site.');
  }

  let config;
  let name;
  let source: 'crawl' | 'minimal' | 'newbuild';
  let copySource: string | undefined;
  if (body.data.mode === 'newbuild') {
    const input = body.data;
    const declared = {
      businessName: input.businessName,
      specialty: input.specialty,
      serviceIds: input.serviceIds,
      accentPreset: input.accentPreset,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.bookingUrl ? { bookingUrl: input.bookingUrl } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.insurances ? { insurances: input.insurances } : {}),
      ...(input.hours ? { hours: input.hours } : {}),
    };
    try {
      const built = await buildOperatorClinicNewbuildSiteConfig(
        declared,
        client.tier,
        { generateCopy: generateClinicNewbuildCopy },
      );
      config = built.config;
      copySource = built.copySource;
    } catch (error) {
      if (error instanceof ClinicNewbuildInputError) {
        return apiError(422, error.code, error.message, { path: error.path });
      }
      if (error instanceof ClinicNewbuildCopyPolicyError) {
        return apiError(422, error.code, error.message, error.details);
      }
      throw error;
    }
    name = declared.businessName.trim().slice(0, 100);
    source = 'newbuild';
  } else if (body.data.mode === 'crawl') {
    const artifact = await getLatestCrawlArtifactBySeedUrl(body.data.sourceUrl);
    if (!artifact || new Date(artifact.expiresAt) <= new Date()) {
      return apiError(
        404,
        'CRAWL_ARTIFACT_NOT_FOUND',
        'No current crawl artifact matches this exact source URL.',
      );
    }
    config = buildOperatorCrawlSiteConfig(artifact.artifact, client.tier, body.data);
    name = artifact.artifact.pages
      .map((page) => page.structured.businessName || page.title)
      .find((value) => value?.trim())?.trim().slice(0, 100)
      ?? new URL(artifact.seedUrl).hostname;
    source = 'crawl';
  } else {
    const built = await buildOperatorMinimalSiteConfig(body.data, client.tier);
    config = built.config;
    name = built.survey.businessName;
    source = 'minimal';
  }

  const formCount = siteFormCount(config);
  if (formCount !== 0) {
    return apiError(
      422,
      'US_OPERATOR_CONTACT_FORM_DISALLOWED',
      'Operator-issued US sites cannot include a first-party inquiry form.',
    );
  }
  // Register the frozen licensed-stock asset before the atomic binding request.
  await ensureDentalStockAssetRefs(config.assetRefs);
  const site = await sites.create({
    clientId,
    name,
    draftConfig: config,
    industryProfileId: 'clinic',
    pricingModelVersion: PRICING_MODEL_VERSION,
    // A licensed-stock hero ships an asset manifest, and the data layer requires the
    // matching atomic binding request (same contract the onboarding route uses).
    ...(config.assetRefs?.length ? { assetRefsToBind: config.assetRefs } : {}),
  });

  return NextResponse.json({
    siteId: site.id,
    site,
    source,
    ...(copySource ? { copySource } : {}),
    locale: config.meta.locale,
    timezone: config.meta.timezone,
    formCount,
    items: config.connectors?.items ?? [],
  }, { status: 201 });
});
