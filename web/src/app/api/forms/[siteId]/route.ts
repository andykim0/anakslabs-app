/**
 * [v3 Phase 3] POST /api/forms/[siteId] — 테넌트 사이트 문의 폼 수신 (공개, 인증 없음).
 *
 * 남용 방어:
 *  - rate limit: IP당 분당 5회 (인메모리 — 실배포 스케일아웃 시 upstash 등으로 교체 지점)
 *  - honeypot: 'website' 필드가 채워져 있으면 봇으로 간주, 200으로 조용히 폐기
 * 발행본(siteConfig) 있는 사이트만 수신. payload는 허용 필드만 추려 저장.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDataServices } from '@/lib/data';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

// dev HMR에도 유지되는 인메모리 rate limit 버킷
const RL_KEY = '__anaksFormRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
function rateLimited(ip: string): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    buckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}

const bodySchema = z.object({
  name: z.string().max(60).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  message: z.string().max(2000).optional(),
  /** honeypot — 사람에겐 보이지 않는 필드 */
  website: z.string().max(200).optional(),
});

type Ctx = { params: Promise<{ siteId: string }> };

export const POST = withApiHandler<Ctx>(async (request: NextRequest, { params }) => {
  const { siteId } = await params;

  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim() || 'local';
  if (rateLimited(ip)) {
    return apiError(429, 'RATE_LIMITED', '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // honeypot: 봇이 채웠으면 저장 없이 성공 흉내 (봇에게 신호를 주지 않는다)
  if (body.data.website && body.data.website.trim() !== '') {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const payload: Record<string, string> = {};
  for (const key of ['name', 'phone', 'email', 'message'] as const) {
    const v = body.data[key]?.trim();
    if (v) payload[key] = v;
  }
  if (Object.keys(payload).length === 0) {
    return apiError(400, 'EMPTY_FORM', '문의 내용을 입력해 주세요.');
  }

  const { sites, formSubmissions } = getDataServices();
  const site = await sites.getById(siteId);
  // 발행본 있는 사이트만 — 존재 여부 노출 방지 겸 404
  if (!site || !site.siteConfig) {
    return apiError(404, 'SITE_NOT_FOUND', '사이트를 찾을 수 없습니다.');
  }

  await formSubmissions.create({ siteId: site.id, clientId: site.clientId, payload });
  return NextResponse.json({ ok: true }, { status: 201 });
});
