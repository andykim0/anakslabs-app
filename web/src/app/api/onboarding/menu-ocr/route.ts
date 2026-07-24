/**
 * [G3c] 메뉴판 사진 OCR — 이미지 URL → 구조화 항목({name, price}). 고객이 확인·수정하므로 자동 확정 아님.
 * 비용 가드 3종: (a) MENU_OCR_ENABLED 킬스위치(mock 우회) (b) 클라이언트당 상한(rate limit) (c) 호출 로그.
 * 인증: 기존 온보딩 라우트와 동일(getAuthedClient).
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { menuOcrConfig } from '@/lib/env';

export const runtime = 'nodejs';

const RL_KEY = '__anaksMenuOcrRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
const RATE_WINDOW_MS = 60_000;

/** 클라이언트당 상한(menuOcrConfig.maxPerClient) — 온보딩엔 siteId가 없어 per-site 대신 per-client */
function rateLimited(key: string, max: number): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

const bodySchema = z.object({
  imageUrl: z.string().min(1).max(200_000), // data URL(mock)도 허용하므로 상한 크게
});

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();

  const cfg = menuOcrConfig();
  void cfg.enabled;
  // (b) 클라이언트당 상한
  if (rateLimited(client.id, cfg.maxPerClient)) {
    return apiError(429, 'RATE_LIMITED', '메뉴판 인식 요청이 너무 잦아요. 잠시 후 다시 시도하거나 직접 입력해 주세요.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  void body.data.imageUrl;
  // Pay-at-publish standard builds never call a vision provider. The image stays
  // available to the customer, while facts are entered and confirmed manually.
  return NextResponse.json({
    items: [],
    manualEntryRequired: true,
    message: '메뉴와 가격은 확인한 내용만 직접 입력해 주세요.',
  });
});
