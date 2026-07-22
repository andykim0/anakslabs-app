/**
 * mock AiService — 키 없이 온보딩/편집 전 플로우가 실제로 동작하는 결정적 생성기.
 * 산출 SiteConfig/DesignCandidate는 계약 타입과 필드 단위로 정확히 일치해야 한다
 * (API가 zod로 검증 — 여분 필드 금지).
 */
import type { AiAssetOwnerContext, AiService, SuggestSectionContext } from '../types';
import { buildImagePool } from '../image-pool';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType, SiteConfig } from '@/lib/types/site';
import { buildCandidateBlueprintsForPipeline } from '../design-candidates';
import { mapCustomSectionType } from '../section-suggest';
import { buildSiteConfigFromSurvey } from '../site-templates';
import { heroVariantForSurvey } from '@/lib/design/reference-gallery';
import { selectedHeroPhotoUrl } from '@/lib/onboarding/hero-image-options';
import { getMockStore } from './store';
import {
  assertAiAssetProvenanceReady,
  stampAiGeneratedAsset,
} from '../supabase/storage';
import type { AssetRef } from '@/lib/assets/provenance';
import { assertAiImageGenerationPolicy } from '@/lib/ai/image-generation-policy';
import {
  resolveSurveyV2ImageGenerationPlan,
  surveyWithResolvedV2ImageDirection,
} from '@/lib/ai/survey-image-generation';

/** 생성 이미지 순환 풀 — public/mock 로컬 자산 */
export const MOCK_IMAGE_POOL = [
  '/mock/gen-texture-1.svg',
  '/mock/gen-texture-2.svg',
  '/mock/candidate-light.svg',
  '/mock/candidate-dark.svg',
  '/mock/candidate-3d.svg',
  '/mock/interior-hwarodam.svg',
];

/** Asset-policy v2 never uses the legacy mock business-interior scene. */
export const SAFE_V2_MOCK_IMAGE_POOL = [
  '/mock/gen-texture-1.svg',
  '/mock/gen-texture-2.svg',
  '/mock/candidate-light.svg',
  '/mock/candidate-dark.svg',
  '/mock/candidate-3d.svg',
] as const;

const MOCK_AI_ASSET_BUCKET = 'mock-ai-assets';

function mockAiObjectPath(
  owner: AiAssetOwnerContext,
  kind: 'candidate' | 'section' | 'edit' | 'video',
  url: string,
): string {
  const ownerKey = encodeURIComponent(owner.clientId);
  const siteKey = encodeURIComponent(owner.siteId ?? 'pre-site');
  const assetKey = url.replace(/^\/+/, '').replace(/[^a-zA-Z0-9._/-]+/g, '-');
  return `${ownerKey}/${siteKey}/${kind}/${crypto.randomUUID()}/${assetKey}`;
}

/** mock도 WRITE 모드에서는 실서비스와 같은 canonical ai_generated owner/origin 계약을 지킨다. */
async function stampMockAiAsset(
  url: string,
  owner: AiAssetOwnerContext,
  kind: 'candidate' | 'section' | 'edit' | 'video',
): Promise<{ url: string; assetId?: string }> {
  const assetId = await stampAiGeneratedAsset({
    owner,
    storageBucket: MOCK_AI_ASSET_BUCKET,
    objectPath: mockAiObjectPath(owner, kind, url),
    url,
    mediaType: kind === 'video' ? 'video' : 'image',
  });
  return { url, ...(assetId ? { assetId } : {}) };
}

/** AI 호출 체감 지연 시뮬레이션 (1~2초) */
function simulateLatency(baseMs: number, jitterMs = 600): Promise<void> {
  const ms = baseMs + Math.floor(Math.random() * jitterMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- 톤별 카피 풀 (절제된 카피 원칙 — 형용사 나열 금지) ----------

const COPY_POOLS: Array<{ match: RegExp; lines: string[] }> = [
  {
    match: /고급|럭셔리|프리미엄|우아|무게/,
    lines: [
      '기본을 지키는 일이 가장 오래갑니다',
      '서두르지 않는 것이 우리의 방식입니다',
      '좋은 재료에는 손을 덜 댑니다',
      '매일 같은 수준, 그것이 전부입니다',
    ],
  },
  {
    match: /미니멀|심플|단정|절제|깔끔/,
    lines: [
      '덜어내면, 본질이 남습니다',
      '필요한 것을, 필요한 만큼',
      '말은 줄이고 일은 그대로',
      '군더더기 없이, 오늘도',
    ],
  },
  {
    match: /친근|따뜻|편안|다정|밝/,
    lines: [
      '가까운 곳에서, 매일 만나는 안부',
      '처음 오신 분도 늘 오신 분처럼',
      '오늘도 같은 온도로 준비합니다',
      '이 동네의 하루에 스며들기',
    ],
  },
];

const DEFAULT_COPY_LINES = [
  '오래 남는 쪽을 택했습니다',
  '유행보다 기준을 따릅니다',
  '처음의 마음을 매일 확인합니다',
  '한 가지를 끝까지, 제대로',
];

function pickCopyPool(hint: string): string[] {
  for (const pool of COPY_POOLS) {
    if (pool.match.test(hint)) return pool.lines;
  }
  return DEFAULT_COPY_LINES;
}

export class MockAiService implements AiService {
  async generateCandidates(
    survey: SurveyInput,
    owner: AiAssetOwnerContext,
  ): Promise<DesignCandidate[]> {
    assertAiAssetProvenanceReady();
    const generationSurvey = surveyWithResolvedV2ImageDirection(survey);
    const v2Plan = await resolveSurveyV2ImageGenerationPlan(generationSurvey, owner);
    const blueprints = await buildCandidateBlueprintsForPipeline(generationSurvey);
    if (v2Plan?.kind === 'reuse_customer_upload') {
      return blueprints.map((bp) => ({
        id: bp.id,
        label: bp.label,
        style: bp.style,
        imageDirectionId: v2Plan.direction,
        heroImageUrl: v2Plan.asset.canonicalUrl,
        heroAssetRef: { assetId: v2Plan.asset.id, url: v2Plan.asset.canonicalUrl },
        theme: bp.theme,
        description: bp.description,
        ...(bp.designDna ? { designDna: bp.designDna } : {}),
      }));
    }
    await simulateLatency(1300);
    const selectedUpload = v2Plan ? undefined : selectedHeroPhotoUrl(survey);
    // 디자인 지식 기반 결정적 3안 (최소 1안 3d_render · 다크/라이트 혼합 · 안끼리 중복 없음)
    return Promise.all(blueprints.map(async (bp) => {
      // 고객 업로드 원본에는 AI origin을 덮지 않는다. mock 생성 후보만 실모드와 같은 stamp를 갖는다.
      const hero = selectedUpload
        ? { url: selectedUpload }
        : await stampMockAiAsset(bp.mockHeroUrl, owner, 'candidate');
      return {
        id: bp.id,
        label: bp.label,
        style: bp.style,
        ...(bp.imageDirectionId ? { imageDirectionId: bp.imageDirectionId } : {}),
        // [H3] 고객 대표 사진은 세 후보 모두의 실제 히어로 소스. 미업로드일 때만 무드 프리뷰 폴백.
        heroImageUrl: hero.url,
        ...(hero.assetId ? { heroAssetRef: { assetId: hero.assetId, url: hero.url } } : {}),
        theme: bp.theme,
        description: bp.description,
        ...(bp.designDna ? { designDna: bp.designDna } : {}),
      };
    }));
  }

  async generateSiteConfig(
    survey: SurveyInput,
    candidate: DesignCandidate,
    owner: AiAssetOwnerContext,
  ): Promise<SiteConfig> {
    assertAiAssetProvenanceReady();
    const routeVerifiedV2Uploads = Boolean(survey.imageDirectionId);
    const generationSurvey = surveyWithResolvedV2ImageDirection(survey);
    const v2Plan = await resolveSurveyV2ImageGenerationPlan(generationSurvey, owner);
    if (v2Plan?.kind !== 'reuse_customer_upload') await simulateLatency(1500);
    // 설문의 sectionPlan(name/brief/variant/source 보존)을 순서 그대로 빌더에 전달한다.
    // (한국어 카피는 계획 name·brief + 템플릿 톤 기반 결정적 기본값)
    // [F3 #2a] 사용자 실사 우선 → 부족분만 mock 큐레이션 이미지로 충전
    const selectedUpload = v2Plan?.kind === 'reuse_customer_upload'
      ? v2Plan.asset.canonicalUrl
      : v2Plan
        ? undefined
        : selectedHeroPhotoUrl(survey);
    const generationPool = v2Plan?.kind === 'reuse_customer_upload'
      ? []
      : v2Plan
        ? SAFE_V2_MOCK_IMAGE_POOL
        : MOCK_IMAGE_POOL;
    const generatedAssets = await Promise.all(
      generationPool.map((url) => stampMockAiAsset(url, owner, 'section')),
    );
    const { heroImageUrl, imagePool } = buildImagePool({
      heroPhoto: selectedUpload,
      storePhotos: v2Plan
        ? routeVerifiedV2Uploads ? generationSurvey.storePhotoUrls : undefined
        : survey.storePhotoUrls,
      aiImages: generatedAssets.map((asset) => asset.url),
      heroFallback: candidate.heroImageUrl,
    });
    const usedUrls = new Set([heroImageUrl, ...imagePool]);
    const assetRefs = [
      v2Plan?.kind === 'reuse_customer_upload'
        ? { assetId: v2Plan.asset.id, url: v2Plan.asset.canonicalUrl }
        : undefined,
      candidate.heroAssetRef,
      ...generatedAssets.map((asset) =>
        asset.assetId ? { assetId: asset.assetId, url: asset.url } : undefined),
    ]
      .filter((ref): ref is AssetRef => Boolean(ref && usedUrls.has(ref.url)))
      .filter((ref, index, refs) => refs.findIndex((item) => item.assetId === ref.assetId) === index);
    // [R2/R5] 히어로 형태 — 갤러리 선택(referenceDesignId) 우선, 없으면 후보별 결정적 폴백
    const heroVariant = heroVariantForSurvey(survey.referenceDesignId, survey.purposeId, candidate.id);
    return buildSiteConfigFromSurvey(generationSurvey, candidate, {
      heroImageUrl,
      imagePool,
      heroVariant,
      ...(assetRefs.length ? { assetRefs } : {}),
    });
  }

  async generateText(input: { prompt: string; currentText?: string; tone?: string }): Promise<string> {
    await simulateLatency(700);
    const store = getMockStore();
    const pool = pickCopyPool(`${input.tone ?? ''} ${input.prompt}`);
    const line = pool[store.counters.text % pool.length];
    store.counters.text += 1;

    // 기존 문구가 있으면 "다듬은" 결과처럼 2행 구성으로 반환
    if (input.currentText && input.currentText.trim().length > 0) {
      const first = input.currentText.split('\n')[0].trim();
      return `${first}\n${line}`;
    }
    return line;
  }

  async generateImage(
    input: { prompt: string },
    owner: AiAssetOwnerContext,
  ): Promise<{ url: string; assetId?: string }> {
    if (owner.assetPolicyVersion === 2) {
      assertAiImageGenerationPolicy({
        imageDirectionId: 'abstract_editorial',
        role: 'decorative',
        subject: 'abstract',
        requestedContent: input.prompt,
        clientId: owner.clientId,
        siteId: owner.siteId,
      });
    }
    assertAiAssetProvenanceReady();
    await simulateLatency(1100);
    const store = getMockStore();
    const pool = owner.assetPolicyVersion === 2 ? SAFE_V2_MOCK_IMAGE_POOL : MOCK_IMAGE_POOL;
    const url = pool[store.counters.image % pool.length];
    store.counters.image += 1;
    return stampMockAiAsset(url, owner, 'edit');
  }

  async generateVideo(input: {
    prompt: string;
    image?: { base64: string; mimeType: string };
    model?: string;
  }, owner: AiAssetOwnerContext): Promise<{ url: string; poster?: string; assetId?: string }> {
    assertAiAssetProvenanceReady();
    void input;
    await simulateLatency(1800);
    // [motion 4단계] mock: 실호출 없음. image-to-video면 첫 프레임=입력 이미지지만 mock은 고정 클립.
    const generated = await stampMockAiAsset('/mock/clip-ember.mp4', owner, 'video');
    return { ...generated, poster: '/mock/video-poster.svg' };
  }

  async suggestCustomSection(input: {
    name: string;
    description?: string;
    context: SuggestSectionContext;
    targetPageSlug?: string;
  }): Promise<{ mappedType: SectionType; name: string; copySeed: string; pageSlug?: string }> {
    await simulateLatency(500);
    void input.context; // mock은 결정적 키워드 매핑만 사용 (context는 실모드 Claude 프롬프트용)
    const mappedType = mapCustomSectionType(`${input.name} ${input.description ?? ''}`);
    return {
      mappedType,
      name: input.name,
      copySeed: input.description?.trim() || input.name,
      // [v4 Phase 4] 요청한 대상 페이지를 그대로 에코 (UI가 새 섹션 pageSlug 로 사용)
      ...(input.targetPageSlug !== undefined ? { pageSlug: input.targetPageSlug } : {}),
    };
  }
}
