/**
 * [v3 Phase 6] POST /api/scan — SEO/AEO/GEO 무료 진단 (비로그인 허용).
 * body: { url } → ScanResult (저장 후 scanId 포함 — 클라이언트가 쿠키 anaks_scan_id 저장)
 *
 * 남용 방어: IP당 분당 3회 / 일 20회 (인메모리 — 실배포 스케일아웃 시 upstash 교체 지점).
 * MOCK_MODE=1 + demo. 프리픽스 URL → 고정 픽스처(34점·이슈 12개) — 오프라인 데모 보장.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { demoFixture, normalizeScanUrl, runScan, ScanError } from '@/lib/scan';
import { SCAN_COMPARISON_LIMIT, toComparisonResult } from '@/lib/scan/comparison';
import { apiError, parseBody, withApiHandler } from '@/app/api/_lib/http';
import { getAuthedClient } from '@/app/api/_lib/guards';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MINUTE_LIMIT = 3;
const DAY_LIMIT = 20;

const RL_KEY = '__anaksScanRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
function rateLimited(ip: string): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  const hits = (buckets.get(ip) ?? []).filter((t) => t > dayAgo);
  const lastMinute = hits.filter((t) => now - t < 60_000).length;
  if (lastMinute >= MINUTE_LIMIT || hits.length >= DAY_LIMIT) {
    buckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}

const bodySchema = z.object({
  url: z.string().min(1, '진단할 주소를 입력해 주세요.').max(2000),
  competitorUrls: z.array(z.string().min(1).max(2000)).max(SCAN_COMPARISON_LIMIT).optional(),
});

async function scanOne(normalized: string) {
  const hostname = new URL(normalized).hostname;
  if (isMockMode() && hostname.startsWith('demo.')) return demoFixture(normalized);
  return runScan(normalized);
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim() || 'local';
  if (rateLimited(ip)) {
    return apiError(429, 'RATE_LIMITED', 'Too many scan requests. Try again in a moment.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // 로그인 상태면 스캔을 바로 귀속 (익명이면 null — 가입 후 claim)
  const client = await getAuthedClient();

  let core;
  try {
    const normalizedUrls = [body.data.url, ...(body.data.competitorUrls ?? [])].map(normalizeScanUrl);
    if (new Set(normalizedUrls).size !== normalizedUrls.length) {
      return apiError(400, 'DUPLICATE_SCAN_URL', 'Enter each website address only once.');
    }
    const [primary, ...comparisons] = await Promise.all(normalizedUrls.map(scanOne));
    core = { ...primary, comparisons: comparisons.map(toComparisonResult) };
  } catch (err) {
    if (err instanceof ScanError) {
      return apiError(400, err.code, err.message);
    }
    throw err;
  }

  const scan = await getDataServices().scans.create({ ...core, clientId: client?.id ?? null });
  return NextResponse.json({ scan }, { status: 201 });
});
