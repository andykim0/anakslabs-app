/**
 * [v4 #3c] POST /api/onboarding/import — 기존 온라인 채널에서 텍스트·이미지 가져오기.
 *
 * 두 가지 동작(하나의 라우트):
 *  - { urls: {kind,url}[] } → 원천별 추출. website/other=범용 추출기(SSRF 가드),
 *    naver_place/instagram=폴백 안내(견고한 파서 부재 — naver-place.ts 참조).
 *  - { ingestImageUrls: string[] } → 고객이 '선택한' 외부 이미지를 서버가 다운로드해 재업로드,
 *    우리 스토리지 URL로 반환(storePhotoUrls에 추가할 소유 이미지).
 *
 * 인증: 기존 온보딩 라우트와 동일(getAuthedClient). 남용 방지: 클라이언트당 분당 5회.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, unauthorized } from '../../_lib/guards';
import { extractFromUrl, ImportError } from '@/lib/import/extract';
import { instagramFallback, naverPlaceFallback } from '@/lib/import/naver-place';
import { ingestExternalImage } from '@/lib/import/ingest-image';

export const runtime = 'nodejs';

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;
const RL_KEY = '__anaksImportRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
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

const presenceUrl = z.string().max(500).refine((u) => /^https?:\/\//i.test(u), 'http(s):// 주소여야 합니다.');

const bodySchema = z
  .object({
    urls: z
      .array(z.object({ kind: z.enum(['website', 'instagram', 'naver_place', 'other']), url: presenceUrl }))
      .max(3)
      .optional(),
    ingestImageUrls: z.array(presenceUrl).max(12).optional(),
  })
  .refine((b) => (b.urls?.length ?? 0) > 0 || (b.ingestImageUrls?.length ?? 0) > 0, {
    message: '가져올 항목이 없어요.',
  });

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  if (rateLimited(client.id)) {
    return apiError(429, 'RATE_LIMITED', '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // (B) 선택 이미지 인입 → 우리 스토리지 URL
  if (body.data.ingestImageUrls?.length) {
    const imageUrls = (
      await Promise.all(
        body.data.ingestImageUrls.map(async (url) => {
          try {
            return await ingestExternalImage(url);
          } catch {
            return null; // 개별 실패는 조용히 스킵 (일부만 성공 허용)
          }
        }),
      )
    ).filter((u): u is string => Boolean(u));
    return NextResponse.json({ imageUrls });
  }

  // (A) 원천별 추출
  const results = await Promise.all(
    (body.data.urls ?? []).map(async ({ kind, url }) => {
      try {
        if (kind === 'naver_place') return { kind, url, ok: true, ...naverPlaceFallback() };
        if (kind === 'instagram') return { kind, url, ok: true, ...instagramFallback() };
        const extracted = await extractFromUrl(url);
        return { kind, url, ok: true, extracted };
      } catch (err) {
        const message = err instanceof ImportError ? err.message : '가져오지 못했어요.';
        return { kind, url, ok: false, fallbackMessage: message };
      }
    }),
  );
  return NextResponse.json({ results });
});
