import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import { isLikelyBotUserAgent, createSiteRateLimiter } from '@/lib/analytics/site-event-ingest';
import { getSharedSitePreviewById } from '@/lib/crawl/repository';
import { dispatchDemoViewAlert } from '@/lib/us-demo/view-alerts';
import {
  DEMO_REFERRER_CLASSES,
  DEMO_VIEW_MAX_BODY_BYTES,
  DEMO_VIEW_QA_COOKIE,
  DEMO_VIEW_RETENTION_DAYS,
} from '@/lib/us-demo/view-tracking-contract';
import {
  demoRequestIp,
  hashDemoViewIdentity,
  isDemoQaCookieValue,
  isInternalDemoIpHash,
  storedDemoViewInput,
} from '@/lib/us-demo/view-tracking-server';
import {
  purgeExpiredDemoViews,
  recordDemoView,
} from '@/lib/us-demo/view-tracking-repository';

export const runtime = 'nodejs';

const limiter = createSiteRateLimiter({ limit: 240, windowMs: 60_000 });
const pageSlugSchema = z.string().max(40).regex(/^(?:|[a-z0-9]+(?:-[a-z0-9]+)*)$/u);

const payloadSchema = z.object({
  previewId: z.string().uuid(),
  pageSlug: pageSlugSchema,
  eventId: z.string().uuid(),
  visitorId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  openedAt: z.string().datetime({ offset: true }),
  localHour: z.number().int(),
  timezone: z.string().max(128),
  activeSeconds: z.number(),
  maxScrollPct: z.number(),
  sections: z.array(z.object({
    id: z.string().max(160),
    activeSeconds: z.number(),
  }).strict()).max(100),
  clicks: z.record(z.string(), z.number()),
  referrer: z.object({
    class: z.enum(DEMO_REFERRER_CLASSES),
    origin: z.string().url().nullable(),
  }).strict(),
  isMobile: z.boolean(),
  final: z.boolean(),
}).strict();

function accepted(): Response {
  return new Response(null, {
    status: 202,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isUsMedicalPreview(preview: NonNullable<Awaited<ReturnType<typeof getSharedSitePreviewById>>>): boolean {
  return preview.siteConfig.meta.locale === 'en-US'
    && preview.siteConfig.meta.jurisdiction === 'US';
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const userAgent = request.headers.get('user-agent');
  // UA is consumed for bot filtering and in-memory fallback hashing only. It is never logged or stored.
  if (isLikelyBotUserAgent(userAgent)) return accepted();
  if (isDemoQaCookieValue(request.cookies.get(DEMO_VIEW_QA_COOKIE)?.value)) return accepted();

  const statedSize = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(statedSize) && statedSize > DEMO_VIEW_MAX_BODY_BYTES) {
    return apiError(413, 'PAYLOAD_TOO_LARGE', 'The view signal is larger than allowed.');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > DEMO_VIEW_MAX_BODY_BYTES) {
    return apiError(413, 'PAYLOAD_TOO_LARGE', 'The view signal is larger than allowed.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return apiError(400, 'INVALID_JSON', 'This is not valid JSON.');
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return apiError(400, 'VALIDATION_ERROR', 'Only the permitted demo view fields may be sent.');
  }

  const preview = await getSharedSitePreviewById(parsed.data.previewId);
  if (!preview || !isUsMedicalPreview(preview)) {
    return apiError(404, 'DEMO_NOT_FOUND', 'Demo not found.');
  }
  if (!preview.siteConfig.pages.some((page) => page.slug === parsed.data.pageSlug)) {
    return apiError(400, 'INVALID_PAGE_SLUG', 'That page address is not part of the demo.');
  }

  let identity: ReturnType<typeof hashDemoViewIdentity>;
  try {
    identity = hashDemoViewIdentity({
      previewId: parsed.data.previewId,
      clientVisitorId: parsed.data.visitorId,
      clientSessionId: parsed.data.sessionId,
      ip: demoRequestIp(request),
      userAgent: userAgent ?? '',
    });
  } catch {
    return apiError(503, 'DEMO_TRACKING_UNAVAILABLE', 'The view measurement settings could not be resolved.');
  }
  if (isInternalDemoIpHash(identity.ipHash)) return accepted();
  if (!limiter.allow(`${parsed.data.previewId}:${identity.ipHash}`)) {
    return apiError(429, 'RATE_LIMITED', 'View signals are being sent too frequently.');
  }

  const stored = storedDemoViewInput({
    previewId: preview.id,
    payload: parsed.data,
    request,
  });
  const result = await recordDemoView(stored);

  await Promise.all(result.alerts.map((alert) => dispatchDemoViewAlert({
    ...alert,
    previewId: parsed.data.previewId,
    pageSlug: parsed.data.pageSlug,
    visitCount: result.visitCount,
    hoursSinceLast: result.hoursSinceLast,
  }).catch(() => undefined)));
  const retentionCutoff = new Date(Date.now() - DEMO_VIEW_RETENTION_DAYS * 86_400_000);
  await purgeExpiredDemoViews(retentionCutoff).catch(() => undefined);
  return accepted();
});
