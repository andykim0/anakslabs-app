/**
 * [v4 #3c] POST /api/onboarding/import — 기존 온라인 채널에서 텍스트·이미지 가져오기.
 *
 * 두 가지 동작(하나의 라우트):
 *  - { urls: {kind,url}[] } → 원천별 추출. website/other=범용 추출기(SSRF 가드),
 *    naver_place/instagram=폴백 안내(견고한 파서 부재 — naver-place.ts 참조).
 *  - { ingestImageUrls: string[] } → 고객이 '선택한' 외부 이미지를 서버가 다운로드해 재업로드.
 *    provenance WRITE flag OFF에서는 기존 {imageUrls}, ON에서는 {imageUrls, assetRefs}를 반환한다.
 *    customer_import는 customer_upload와 구분되며 권리확약 전에는 factual 슬롯 자격이 없다.
 *
 * 인증: 기존 온보딩 라우트와 동일(getAuthedClient). 남용 방지: 클라이언트당 분당 5회.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { getAuthedClient, getOwnedSite, unauthorized } from '../../_lib/guards';
import { extractFromUrl, ImportError } from '@/lib/import/extract';
import { instagramFallback, naverPlaceFallback } from '@/lib/import/naver-place';
import {
  ImportAssetProvenanceError,
  ingestExternalImageForClient,
} from '@/lib/import/ingest-image';
import { findForbiddenClientAssetClaim } from '@/lib/uploads/client-provenance-claims';
import { assetProvenanceConfig } from '@/lib/assets/provenance-flags';
import { projectAssetImportResponse } from '@/lib/assets/compatibility';
import { operatorManagedOnboardingApiGate } from '../_lib/operator-gate';

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
      .array(z.object({ kind: z.enum(['website', 'naver_blog', 'instagram', 'naver_place', 'other']), url: presenceUrl }))
      .max(5)
      .optional(),
    ingestImageUrls: z.array(presenceUrl).max(12).optional(),
    siteId: z.string().uuid().optional(),
  })
  .refine((b) => (b.urls?.length ?? 0) > 0 || (b.ingestImageUrls?.length ?? 0) > 0, {
    message: '가져올 항목이 없어요.',
  });

export const POST = withApiHandler(async (request) => {
  const client = await getAuthedClient();
  if (!client) return unauthorized();
  const operatorGate = operatorManagedOnboardingApiGate();
  if (operatorGate) return operatorGate;
  // Invalid rollout dependencies fail before rate mutation or external work.
  const provenance = assetProvenanceConfig();
  if (rateLimited(client.id)) {
    return apiError(429, 'RATE_LIMITED', '요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.');
  }

  const rawBody: unknown = await request.clone().json().catch(() => null);
  const forbiddenClaim = findForbiddenClientAssetClaim(rawBody);
  if (forbiddenClaim) {
    return apiError(
      400,
      'CLIENT_PROVENANCE_FORBIDDEN',
      '자산 소유자와 출처는 인증된 가져오기 경로에서 서버가 기록합니다.',
      { field: forbiddenClaim },
    );
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;

  // (B) 선택 이미지 인입 → 우리 스토리지 URL
  if (body.data.ingestImageUrls?.length) {
    const siteId = provenance.write ? body.data.siteId ?? null : null;
    if (siteId) {
      const site = await getOwnedSite(siteId, client.id);
      if (!site) return apiError(404, 'ASSET_SITE_NOT_FOUND', '사진을 연결할 사이트를 찾을 수 없습니다.');
    }

    const images = (
      await Promise.all(
        body.data.ingestImageUrls.map(async (url) => {
          try {
            return await ingestExternalImageForClient(url, { clientId: client.id, siteId });
          } catch (error) {
            if (error instanceof ImportAssetProvenanceError) throw error;
            return null; // 개별 실패는 조용히 스킵 (일부만 성공 허용)
          }
        }),
      )
    ).filter((image): image is NonNullable<typeof image> => Boolean(image));
    return NextResponse.json(projectAssetImportResponse(images, provenance.write));
  }

  // (A) 원천별 추출
  const results = await Promise.all(
    (body.data.urls ?? []).map(async ({ kind, url }) => {
      try {
        if (kind === 'naver_place') return { kind, url, ok: true, ...naverPlaceFallback() };
        if (kind === 'instagram') return { kind, url, ok: true, ...instagramFallback() };
        const extracted = await extractFromUrl(url);
        return {
          kind,
          url,
          ok: true,
          extracted,
          provenance: {
            origin: 'customer_import' as const,
            sourceUrl: extracted.sourceUrl,
            extractedAt: new Date().toISOString(),
          },
        };
      } catch (err) {
        const message = err instanceof ImportError ? err.message : '가져오지 못했어요.';
        return { kind, url, ok: false, fallbackMessage: message };
      }
    }),
  );
  return NextResponse.json({ results });
});
