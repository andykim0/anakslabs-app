import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOr403 } from '@/app/api/_lib/guards';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getCurrentAdminActorId } from '@/lib/services/auth';
import {
  crawlConsentedUsMedicalSite,
  crawlDesignatedSite,
  CrawlError,
} from '@/lib/crawl/crawler';
import { createCrawlArtifact } from '@/lib/crawl/repository';
import { aggregateDecayScores } from '@/lib/scan/decay';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';

export const runtime = 'nodejs';
// A 100-page consented crawl still observes the one-request-per-second floor.
export const maxDuration = 300;

const RATE_LIMIT = 2;
const RATE_WINDOW_MS = 60_000;
const RL_KEY = '__anaksAdminCrawlRateLimit__' as const;
const ACTIVE_KEY = '__anaksAdminActiveCrawlOrigins__' as const;
type GlobalWithCrawlGuard = typeof globalThis & {
  [RL_KEY]?: Map<string, number[]>;
  [ACTIVE_KEY]?: Set<string>;
};

function rateLimited(actorId: string): boolean {
  const globalStore = globalThis as GlobalWithCrawlGuard;
  const buckets = (globalStore[RL_KEY] ??= new Map());
  const now = Date.now();
  const active: number[] = (buckets.get(actorId) ?? [])
    .filter((at: number) => now - at < RATE_WINDOW_MS);
  if (active.length >= RATE_LIMIT) {
    buckets.set(actorId, active);
    return true;
  }
  active.push(now);
  buckets.set(actorId, active);
  return false;
}

function originFor(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

const bodySchema = z.object({
  url: z.string().url().max(2_000),
  allowTlsHttpFallback: z.boolean().optional(),
  allowInvalidTlsCertificate: z.boolean().optional(),
  scanProfileId: z.literal(US_MEDICAL_OUTREACH_PROFILE_ID).optional(),
  crawlProfile: z.enum(['designated', 'us-medical-consented']).default('designated'),
  consentId: z.string().uuid().optional(),
  prospectId: z.string().trim().min(1).max(100).optional(),
}).strict().superRefine((value, context) => {
  if (value.crawlProfile !== 'us-medical-consented') return;
  if (!value.consentId) {
    context.addIssue({ code: 'custom', path: ['consentId'], message: '동의 레코드가 필요합니다.' });
  }
  if (!value.prospectId) {
    context.addIssue({ code: 'custom', path: ['prospectId'], message: '프로스펙트 ID가 필요합니다.' });
  }
});

export const POST = withApiHandler(async (request) => {
  const forbidden = await requireAdminOr403();
  if (forbidden) return forbidden;
  const actorId = await getCurrentAdminActorId();
  if (!actorId) return apiError(403, 'FORBIDDEN', 'The administrator identity could not be resolved.');
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  if (rateLimited(actorId)) {
    return apiError(429, 'RATE_LIMITED', 'Too many collection requests for this URL.');
  }
  const origin = originFor(body.data.url);
  if (!origin) return apiError(400, 'INVALID_URL', 'Enter a valid URL.');
  const globalStore = globalThis as GlobalWithCrawlGuard;
  const active = (globalStore[ACTIVE_KEY] ??= new Set());
  if (active.has(origin)) {
    return apiError(409, 'CRAWL_ALREADY_RUNNING', 'This site is already being collected.');
  }
  active.add(origin);
  try {
    const artifact = body.data.crawlProfile === 'us-medical-consented'
      ? await crawlConsentedUsMedicalSite({
          url: body.data.url,
          consentId: body.data.consentId!,
          prospectId: body.data.prospectId!,
          allowTlsHttpFallback: body.data.allowTlsHttpFallback,
          allowInvalidTlsCertificate: body.data.allowInvalidTlsCertificate,
        })
      : await crawlDesignatedSite(body.data);
    const decayResult = aggregateDecayScores(
      artifact.pages.map((page) => page.decay),
      artifact.observedAt,
    );
    const record = await createCrawlArtifact({ artifact, decayResult, createdBy: actorId });
    return NextResponse.json({
      artifact: {
        id: record.id,
        seedUrl: record.seedUrl,
        finalOrigin: record.finalOrigin,
        pageCount: record.artifact.pages.length,
        tls: record.artifact.tls,
        observedAt: record.artifact.observedAt,
        decay: record.decayResult,
        expiresAt: record.expiresAt,
        ...(record.artifact.crawlPolicyId
          ? { crawlPolicyId: record.artifact.crawlPolicyId }
          : {}),
        ...(record.artifact.crawlCoverage
          ? { crawlCoverage: record.artifact.crawlCoverage }
          : {}),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof CrawlError) {
      return apiError(error.code === 'RENDER_FAILED' ? 503 : 400, error.code, error.message);
    }
    if (error instanceof Error && error.message === 'US_MEDICAL_CONSENT_REQUIRED') {
      return apiError(409, 'US_MEDICAL_CONSENT_REQUIRED', 'A verifiable record of verbal consent is required.');
    }
    throw error;
  } finally {
    active.delete(origin);
  }
});
