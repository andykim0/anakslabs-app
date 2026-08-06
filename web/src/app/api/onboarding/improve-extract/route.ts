/**
 * [I2] 개선 모드 가져오기 — sourceUrl 1회 fetch로 콘텐츠(제목·소개·항목·이미지) + 대표 팔레트 시드를
 * 함께 추출한다. extract.ts(safeFetch·parseHtml·SSRF 가드) + extract-palette.ts + content-parse 재사용.
 * 인증: 기존 온보딩 라우트와 동일. 남용 방지: 클라이언트당 분당 5회.
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { ImportError, parseHtml, readLimitedBytes, safeFetch } from '@/lib/import/extract';
import { extractSitePalette } from '@/lib/import/extract-palette';
import { parseMenuItems } from '@/lib/data/content-parse';
import { operatorManagedOnboardingApiGate } from '../_lib/operator-gate';

export const runtime = 'nodejs';

const RL_KEY = '__anaksImproveExtractRl__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 5;
function rateLimited(key: string): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

const bodySchema = z.object({
  url: z.string().max(500).refine((u) => /^https?:\/\//i.test(u), 'http(s):// 주소여야 합니다.'),
});
const MAX_BYTES = 2_000_000;

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  const operatorGate = operatorManagedOnboardingApiGate();
  if (operatorGate) return operatorGate;
  if (rateLimited(client.id)) {
    return apiError(429, 'RATE_LIMITED', 'Too many requests. Try again in a moment.');
  }
  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  let html: string;
  let finalUrl: string;
  try {
    const { res, finalUrl: fu } = await safeFetch(body.data.url);
    finalUrl = fu;
    const bytes = await readLimitedBytes(res, MAX_BYTES);
    html = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch (err) {
    if (err instanceof ImportError) {
      return apiError(422, err.code, err.message);
    }
    return apiError(422, 'FETCH_FAILED', 'The site could not be imported. Check the address.');
  }

  const extracted = parseHtml(html, finalUrl);
  // 텍스트에서 메뉴/항목 후보 파싱(구조화 항목 프리필용)
  const items = parseMenuItems(extracted.text).map((m) => ({ name: m.name, price: m.price }));
  const paletteSeed = extractSitePalette(html); // 저채도/실패면 null → UI가 뉴트럴 폴백

  return NextResponse.json({
    title: extracted.title ?? '',
    description: extracted.description ?? '',
    text: extracted.text,
    headings: extracted.headings,
    imageUrls: extracted.imageUrls,
    contentItems: items,
    paletteSeed, // { primary, secondary? } | null
  });
});
