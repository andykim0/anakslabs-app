import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { AssetRef } from '@/lib/assets/provenance';
import type { ImageDirectionId } from '@/lib/assets/image-directions';

/** W1에서 생성하는 AI 무드 히어로 안의 수. 비용 상한과 UI 카드 수가 이 값에 종속된다. */
export const HERO_AI_OPTION_COUNT = 3 as const;

export const HERO_IMAGE_CHOICE_IDS = ['system', 'upload', 'ai-1', 'ai-2', 'ai-3'] as const;

export type HeroImageChoiceId = (typeof HERO_IMAGE_CHOICE_IDS)[number];

/** UI 선택값과 process 배선이 공유하는 최소 계약. */
export type HeroImageSelection = {
  id: HeroImageChoiceId;
  url: string;
  source: 'system' | 'upload' | 'ai';
  candidateId?: string;
  /** URL과 함께 왕복하는 비권위 projection. 서버 registry가 generation 경계에서 재검증한다. */
  assetRef?: AssetRef;
  /** 서버 registry 품질 스탬프에서 온 고객 안내. 클라이언트 판정값이 아니다. */
  guidance?: string;
};

/** public/mock에 실제 존재하는, 제품을 날조하지 않는 대표 무드 자산. */
const MOCK_HERO_URLS = [
  '/mock/candidate-light.svg',
  '/mock/candidate-dark.svg',
  '/mock/candidate-3d.svg',
] as const;

type HeroOptionIndex = 0 | 1 | 2;

/**
 * mock 모드와 후보 누락 폴백이 공유하는 결정적 URL.
 * 인덱스 범위를 조용히 순환시키지 않아 "AI 3안" 상한 위반을 즉시 드러낸다.
 */
export function mockHeroImageUrl(index: HeroOptionIndex): string {
  const url = MOCK_HERO_URLS[index];
  if (!url) throw new RangeError(`hero image option index must be 0..2: ${index}`);
  return url;
}

function presentUrl(value: string | undefined): string | undefined {
  const url = value?.trim();
  return url || undefined;
}

function aiChoiceId(index: HeroOptionIndex): HeroImageChoiceId {
  return `ai-${index + 1}` as HeroImageChoiceId;
}

/**
 * 업로드 대표 사진(선택) + AI 무드 3안을 선택 카드로 만든다.
 * AI URL이 누락되거나 중복되면 서로 다른 로컬 무드 자산으로 결정적으로 보충한다.
 */
export function buildHeroImageOptions(
  candidates: readonly DesignCandidate[],
  heroPhotoUrl?: string,
  heroPhotoAssetRef?: AssetRef,
  imageDirectionId?: ImageDirectionId,
): HeroImageSelection[] {
  const options: HeroImageSelection[] = [];
  const usedAiUrls = new Set<string>();
  const uploadUrl = presentUrl(heroPhotoUrl);

  if (imageDirectionId === 'real_photo') {
    const resolvedCandidate = candidates.find((candidate) => candidate.heroPresentation);
    if (resolvedCandidate?.heroPresentation === 'system') {
      return [{
        id: 'system',
        url: resolvedCandidate.heroImageUrl,
        source: 'system',
        candidateId: resolvedCandidate.id,
        guidance: resolvedCandidate.heroPhotoQuality?.guidance
          ?? '사진 품질 기록을 아직 확인할 수 없어 이번엔 다보임이 준비한 화면을 사용했어요. 사진을 다시 올리면 자동으로 확인해 드려요.',
      }];
    }
    if (resolvedCandidate?.heroPresentation === 'promoted_customer_photo'
      && resolvedCandidate.heroAssetRef) {
      return [{
        id: 'upload',
        url: resolvedCandidate.heroImageUrl,
        source: 'upload',
        candidateId: resolvedCandidate.id,
        assetRef: resolvedCandidate.heroAssetRef,
      }];
    }
    if (uploadUrl && heroPhotoAssetRef?.url === uploadUrl) {
      return [{ id: 'upload', url: uploadUrl, source: 'upload', assetRef: heroPhotoAssetRef }];
    }
    const verifiedCandidate = candidates.find((candidate) =>
      candidate.heroAssetRef?.url === presentUrl(candidate.heroImageUrl));
    return verifiedCandidate?.heroAssetRef
      ? [{
          id: 'upload',
          url: verifiedCandidate.heroImageUrl,
          source: 'upload',
          candidateId: verifiedCandidate.id,
          assetRef: verifiedCandidate.heroAssetRef,
        }]
      : [];
  }

  // Legacy surveys keep the original upload+AI choice behavior. In v2 an
  // explicit artistic direction uses only generated atmospheric candidates.
  if (uploadUrl && imageDirectionId === undefined) {
    options.push({
      id: 'upload',
      url: uploadUrl,
      source: 'upload',
      ...(heroPhotoAssetRef?.url === uploadUrl ? { assetRef: heroPhotoAssetRef } : {}),
    });
  }

  for (let index = 0; index < HERO_AI_OPTION_COUNT; index += 1) {
    const optionIndex = index as HeroOptionIndex;
    const candidate = candidates[index];
    const candidateUrl = presentUrl(candidate?.heroImageUrl);
    let url = candidateUrl;

    if (!url || usedAiUrls.has(url)) {
      // 이전 AI 카드가 이미 쓴 자산을 건너뛴다. 현재 반복 전 usedAiUrls.size는 최대 2라
      // 세 개의 고유 mock 자산 중 적어도 하나는 반드시 남아 있다.
      for (let offset = 0; offset < HERO_AI_OPTION_COUNT; offset += 1) {
        const fallbackIndex = ((index + offset) % HERO_AI_OPTION_COUNT) as HeroOptionIndex;
        const fallback = mockHeroImageUrl(fallbackIndex);
        if (!usedAiUrls.has(fallback)) {
          url = fallback;
          break;
        }
      }
    }

    // 위 루프의 고유 mock 보장 때문에 도달하지 않지만, 타입 수준에서도 URL을 확정한다.
    const resolvedUrl = url ?? mockHeroImageUrl(optionIndex);
    usedAiUrls.add(resolvedUrl);
    options.push({
      id: aiChoiceId(optionIndex),
      url: resolvedUrl,
      source: 'ai',
      ...(candidate?.id ? { candidateId: candidate.id } : {}),
      ...(candidate?.heroAssetRef?.url === resolvedUrl ? { assetRef: candidate.heroAssetRef } : {}),
    });
  }

  return options;
}

/**
 * AI 무드 후보 생성 전용 설문.
 * heroPhotoUrl을 남기면 기존 후보 생성기가 세 후보 모두를 같은 업로드 사진으로 덮으므로 반드시 뺀다.
 */
export function surveyForHeroCandidates(survey: SurveyInput): SurveyInput {
  const candidateSurvey = { ...survey };
  // real_photo is a no-generation reuse path: the authenticated route needs
  // the exact refs + attestation to resolve ownership. Artistic paths must not
  // leak a real business photo into AI mood candidates.
  if (survey.imageDirectionId !== 'real_photo') {
    delete candidateSurvey.heroPhotoUrl;
    delete candidateSurvey.heroPhotoAssetRef;
  }
  delete candidateSurvey.heroImageChoice;
  delete candidateSurvey.videoAddon;
  delete candidateSurvey.heroMotionId;
  // 섹션 검수 이력은 히어로 이미지 피사체·무드 후보와 무관하다.
  delete candidateSurvey.directions;
  return candidateSurvey;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
  return `{${entries.join(',')}}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 거대한 data URL을 intent 문자열에 복사하지 않고 선택 변경을 구분하는 결정적 표식. */
export function heroImageUrlIntent(url: string): string {
  return `hero-image:${fnv1a(url)}:${url.length}`;
}

/** StrictMode 재마운트에도 같은 후보 생성 요청을 합칠 수 있는 짧고 결정적인 intent. */
export function heroCandidateIntent(survey: SurveyInput): string {
  const serialized = stableSerialize(surveyForHeroCandidates(survey));
  return `hero-candidates:${fnv1a(serialized)}:${serialized.length}`;
}

/** 선택한 히어로 URL만 후보에 적용한다. 입력 후보는 수정하지 않는다. */
export function applyHeroImageToCandidate(
  candidate: DesignCandidate,
  selectedUrl: string,
  selectedAssetRef?: AssetRef,
): DesignCandidate {
  const applied = { ...candidate, heroImageUrl: selectedUrl };
  delete applied.heroAssetRef;
  if (selectedAssetRef?.url === selectedUrl) applied.heroAssetRef = selectedAssetRef;
  return applied;
}

/**
 * W4 히어로 소스 해석. 레거시(선택 필드 없음)와 upload은 기존 대표 사진을 쓰고,
 * AI 안을 명시하면 heroPhotoUrl을 설문에 보존하되 최종 히어로에서는 제외한다.
 */
export function selectedHeroPhotoUrl(survey: SurveyInput): string | undefined {
  if (survey.heroImageChoice !== undefined && survey.heroImageChoice !== 'upload') return undefined;
  return presentUrl(survey.heroPhotoUrl);
}
