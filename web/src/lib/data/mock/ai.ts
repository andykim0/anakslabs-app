/**
 * mock AiService — 키 없이 온보딩/편집 전 플로우가 실제로 동작하는 결정적 생성기.
 * 산출 SiteConfig/DesignCandidate는 계약 타입과 필드 단위로 정확히 일치해야 한다
 * (API가 zod로 검증 — 여분 필드 금지).
 */
import type { AiService, SuggestSectionContext } from '../types';
import { buildImagePool } from '../image-pool';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType, SiteConfig } from '@/lib/types/site';
import { buildCandidateBlueprints } from '../design-candidates';
import { mapCustomSectionType } from '../section-suggest';
import { buildSiteConfigFromSurvey } from '../site-templates';
import { heroVariantForSurvey } from '@/lib/design/reference-gallery';
import { getMockStore } from './store';

/** 생성 이미지 순환 풀 — public/mock 로컬 자산 */
export const MOCK_IMAGE_POOL = [
  '/mock/gen-texture-1.svg',
  '/mock/gen-texture-2.svg',
  '/mock/candidate-light.svg',
  '/mock/candidate-dark.svg',
  '/mock/candidate-3d.svg',
  '/mock/interior-hwarodam.svg',
];

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
  async generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
    await simulateLatency(1300);
    // 디자인 지식 기반 결정적 3안 (최소 1안 3d_render · 다크/라이트 혼합 · 안끼리 중복 없음)
    return buildCandidateBlueprints(survey).map((bp) => ({
      id: bp.id,
      label: bp.label,
      style: bp.style,
      // [H3] 고객 대표 사진은 세 후보 모두의 실제 히어로 소스. 미업로드일 때만 무드 프리뷰 폴백.
      heroImageUrl: survey.heroPhotoUrl ?? bp.mockHeroUrl,
      theme: bp.theme,
      description: bp.description,
    }));
  }

  async generateSiteConfig(survey: SurveyInput, candidate: DesignCandidate): Promise<SiteConfig> {
    await simulateLatency(1500);
    // 설문의 sectionPlan(name/brief/variant/source 보존)을 순서 그대로 빌더에 전달한다.
    // (한국어 카피는 계획 name·brief + 템플릿 톤 기반 결정적 기본값)
    // [F3 #2a] 사용자 실사 우선 → 부족분만 mock 큐레이션 이미지로 충전
    const { heroImageUrl, imagePool } = buildImagePool({
      heroPhoto: survey.heroPhotoUrl,
      storePhotos: survey.storePhotoUrls,
      aiImages: [...MOCK_IMAGE_POOL],
      heroFallback: candidate.heroImageUrl,
    });
    // [R2/R5] 히어로 형태 — 갤러리 선택(referenceDesignId) 우선, 없으면 후보별 결정적 폴백
    const heroVariant = heroVariantForSurvey(survey.referenceDesignId, survey.purposeId, candidate.id);
    return buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl, imagePool, heroVariant });
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

  async generateImage(_input: { prompt: string }): Promise<{ url: string }> {
    await simulateLatency(1100);
    const store = getMockStore();
    const url = MOCK_IMAGE_POOL[store.counters.image % MOCK_IMAGE_POOL.length];
    store.counters.image += 1;
    return { url };
  }

  async generateVideo(input: {
    prompt: string;
    image?: { base64: string; mimeType: string };
    model?: string;
  }): Promise<{ url: string; poster?: string }> {
    void input;
    await simulateLatency(1800);
    // [motion 4단계] mock: 실호출 없음. image-to-video면 첫 프레임=입력 이미지지만 mock은 고정 클립.
    return { url: '/mock/clip-ember.mp4', poster: '/mock/video-poster.svg' };
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
