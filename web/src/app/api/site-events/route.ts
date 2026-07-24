/**
 * [RPT$] 퍼스트파티 성과 비콘 수집. 공개 endpoint지만 PII는 받지도 저장하지도 않는다.
 * text/plain JSON을 허용해 정적 export의 cross-origin sendBeacon이 preflight 없이 동작한다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, withApiHandler } from '@/app/api/_lib/http';
import {
  SITE_EVENT_TYPES,
  TRAFFIC_SOURCES,
  canCollectSiteEvents,
  createSiteRateLimiter,
  isLikelyBotUserAgent,
  kstDateString,
} from '@/lib/analytics/site-event-ingest';

const MAX_BODY_BYTES = 512;
const limiter = createSiteRateLimiter({ limit: 600, windowMs: 60_000 });

const payloadSchema = z.object({
  siteId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  event: z.enum(SITE_EVENT_TYPES),
  source: z.enum(TRAFFIC_SOURCES),
  /** 신규 비콘은 재시도 멱등 nonce를 보낸다. optional은 기존 정적 발행본 호환용. */
  eventId: z.string().uuid().optional(),
}).strict();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
} as const;

function jsonWithCors(body: unknown, init: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
  return response;
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const statedSize = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(statedSize) && statedSize > MAX_BODY_BYTES) {
    return jsonWithCors({ error: { code: 'PAYLOAD_TOO_LARGE', message: '요청이 너무 큽니다.' } }, { status: 413 });
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return jsonWithCors({ error: { code: 'PAYLOAD_TOO_LARGE', message: '요청이 너무 큽니다.' } }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonWithCors({ error: { code: 'INVALID_JSON', message: '올바른 JSON이 아닙니다.' } }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    const response = apiError(400, 'VALIDATION_ERROR', '허용된 집계 필드만 전송할 수 있습니다.');
    for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
    return response;
  }

  // UA는 여기서 즉시 판정하고 이후 전달·저장·로그하지 않는다.
  if (isLikelyBotUserAgent(request.headers.get('user-agent'))) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  const services = getDataServices();
  const site = await services.sites.getById(parsed.data.siteId);
  if (!canCollectSiteEvents(site)) {
    const response = apiError(404, 'SITE_NOT_FOUND', '발행 사이트를 찾을 수 없습니다.');
    for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
    return response;
  }
  // 존재·발행 여부를 통과한 opaque site ID만 limiter 메모리 키가 될 수 있다.
  if (!limiter.allow(parsed.data.siteId)) {
    const response = apiError(429, 'RATE_LIMITED', '수집 요청이 너무 많습니다.');
    for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
    return response;
  }

  await services.siteEvents.increment({
    siteId: parsed.data.siteId,
    eventType: parsed.data.event,
    source: parsed.data.source,
    eventDate: kstDateString(),
    eventId: parsed.data.eventId,
  });
  return new Response(null, { status: 202, headers: CORS_HEADERS });
});
