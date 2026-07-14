import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';

/** W1에서 생성하는 AI 무드 히어로 안의 수. 비용 상한과 UI 카드 수가 이 값에 종속된다. */
export const HERO_AI_OPTION_COUNT = 3 as const;

export const HERO_IMAGE_CHOICE_IDS = ['upload', 'ai-1', 'ai-2', 'ai-3'] as const;

export type HeroImageChoiceId = (typeof HERO_IMAGE_CHOICE_IDS)[number];

/** UI 선택값과 process 배선이 공유하는 최소 계약. */
export type HeroImageSelection = {
  id: HeroImageChoiceId;
  url: string;
  source: 'upload' | 'ai';
  candidateId?: string;
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
): HeroImageSelection[] {
  const options: HeroImageSelection[] = [];
  const usedAiUrls = new Set<string>();
  const uploadUrl = presentUrl(heroPhotoUrl);

  if (uploadUrl) {
    options.push({ id: 'upload', url: uploadUrl, source: 'upload' });
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
    });
  }

  return options;
}

/** W4에서 SurveyInput에 추가될 수 있는 선택 상태. 후보 이미지 생성 입력에서는 모두 제외한다. */
type OptionalHeroVideoSurveyFields = {
  heroImageChoice?: HeroImageChoiceId;
  videoAddon?: boolean;
  heroMotionId?: string;
};

/**
 * AI 무드 후보 생성 전용 설문.
 * heroPhotoUrl을 남기면 기존 후보 생성기가 세 후보 모두를 같은 업로드 사진으로 덮으므로 반드시 뺀다.
 */
export function surveyForHeroCandidates(survey: SurveyInput): SurveyInput {
  const {
    heroPhotoUrl: _heroPhotoUrl,
    heroImageChoice: _heroImageChoice,
    videoAddon: _videoAddon,
    heroMotionId: _heroMotionId,
    ...candidateSurvey
  } = survey as SurveyInput & OptionalHeroVideoSurveyFields;
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

/** StrictMode 재마운트에도 같은 후보 생성 요청을 합칠 수 있는 짧고 결정적인 intent. */
export function heroCandidateIntent(survey: SurveyInput): string {
  const serialized = stableSerialize(surveyForHeroCandidates(survey));
  return `hero-candidates:${fnv1a(serialized)}:${serialized.length}`;
}

/** 선택한 히어로 URL만 후보에 적용한다. 입력 후보는 수정하지 않는다. */
export function applyHeroImageToCandidate(
  candidate: DesignCandidate,
  selectedUrl: string,
): DesignCandidate {
  return { ...candidate, heroImageUrl: selectedUrl };
}
