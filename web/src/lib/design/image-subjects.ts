/**
 * AI 이미지·영상의 피사체 안전 단일 소스.
 *
 * 생성물은 업종의 주문 대상 제품을 재현하지 않고, 고객이 고른 tone에서 공간·빛·질감·추상 장면을
 * 결정적으로 고른다. 고객이 직접 올린 대표 사진은 별도 faithful-motion 규칙으로 원본을 보존한다.
 * 순수 모듈이라 이미지/Veo 빌더와 node:test가 함께 소비한다.
 */
import type { CandidateStyle } from '@/lib/types/domain';
import { stableIndex } from '@/lib/abstract/seed';

export type MoodSubjectId = 'elegant' | 'warm' | 'calm' | 'modern' | 'natural' | 'energetic';

export interface MoodSubjectRule {
  /** 제품이 아닌 공간·빛·질감·추상 피사체(영어 전용) */
  ambient: readonly string[];
}

export type IndustrySubjectClassId =
  | 'restaurant'
  | 'cafe'
  | 'beauty'
  | 'medical'
  | 'education'
  | 'company'
  | 'portfolio'
  | 'general';

export interface IndustrySubjectSafetyRule {
  /** 주문·예약 결과를 현실과 비교하기 쉬운 업종은 전체 PRODUCT_AVOID를 붙인다. */
  strict: boolean;
  /** SurveyInput.purposeId가 있으면 자유 입력 업종명보다 우선한다. */
  purposeIds: readonly string[];
  /** purposeId가 없는 레거시·직접 호출을 위한 업종 클래스 판정. */
  industryMatch: RegExp;
}

/**
 * 업종은 안전 강도만 결정한다. 양의 피사체는 이 레지스트리에서 고르지 않고 MOOD_SUBJECTS만 사용한다.
 * 회사·포트폴리오는 추상 브랜드 표현을 허용하되 로고·인물·실적 날조는 별도 지시로 계속 금지한다.
 */
export const INDUSTRY_SUBJECT_SAFETY = {
  restaurant: {
    strict: true,
    purposeIds: [],
    industryMatch:
      /음식|식당|레스토랑|파인다이닝|오마카세|고깃집|바베큐|한식|백반|분식|이자카야|주점|펍|restaurant|dining|bistro|omakase/i,
  },
  cafe: {
    strict: true,
    purposeIds: [],
    industryMatch: /카페|커피|베이커리|제과|디저트|cafe|coffee|bakery/i,
  },
  beauty: {
    strict: true,
    purposeIds: [],
    industryMatch: /뷰티|미용|헤어|네일|피부|에스테틱|왁싱|beauty|salon|hair|nail/i,
  },
  medical: {
    strict: true,
    purposeIds: [],
    industryMatch: /병원|의원|치과|한의원|클리닉|hospital|clinic|medical|dental/i,
  },
  education: {
    strict: true,
    purposeIds: ['edu_membership'],
    industryMatch: /학원|교육|과외|클래스|강의|academy|education|tutoring/i,
  },
  company: {
    strict: false,
    purposeIds: ['company_brand'],
    industryMatch: /회사|기업|법인|브랜드|스타트업|company|corporate|agency|startup/i,
  },
  portfolio: {
    strict: false,
    purposeIds: ['portfolio'],
    industryMatch: /포트폴리오|작가|이력서|portfolio|resume|creative practice/i,
  },
  general: {
    strict: true,
    purposeIds: [],
    industryMatch: /(?!)/,
  },
} as const satisfies Record<IndustrySubjectClassId, IndustrySubjectSafetyRule>;

const INDUSTRY_MATCH_ORDER: readonly Exclude<IndustrySubjectClassId, 'general'>[] = [
  'cafe',
  'restaurant',
  'beauty',
  'medical',
  'education',
  'company',
  'portfolio',
];

export interface ResolvedIndustrySubjectSafety {
  id: IndustrySubjectClassId;
  strict: boolean;
}

export function resolveIndustrySubjectSafety(input: {
  purposeId?: string | null;
  industry?: string | null;
}): ResolvedIndustrySubjectSafety {
  const purposeId = input.purposeId?.trim();
  if (purposeId) {
    const purposeClass = INDUSTRY_MATCH_ORDER.find((id) =>
      (INDUSTRY_SUBJECT_SAFETY[id].purposeIds as readonly string[]).includes(purposeId),
    );
    if (purposeClass) {
      return { id: purposeClass, strict: INDUSTRY_SUBJECT_SAFETY[purposeClass].strict };
    }

    // 목적이 있으면 회사/포트폴리오 외에는 fail-closed. 업종명은 strict 클래스 라벨만 세분화한다.
    const industry = input.industry?.trim() ?? '';
    for (const id of INDUSTRY_MATCH_ORDER) {
      const rule = INDUSTRY_SUBJECT_SAFETY[id];
      if (rule.strict && rule.industryMatch.test(industry)) return { id, strict: true };
    }
    return { id: 'general', strict: true };
  }

  const industry = input.industry?.trim() ?? '';
  for (const id of INDUSTRY_MATCH_ORDER) {
    const rule = INDUSTRY_SUBJECT_SAFETY[id];
    if (rule.industryMatch.test(industry)) return { id, strict: rule.strict };
  }
  return { id: 'general', strict: INDUSTRY_SUBJECT_SAFETY.general.strict };
}

export const MOOD_SUBJECTS = {
  elegant: {
    ambient: [
      'candlelight moving across silk-like fabric and brushed brass in a restrained interior',
      'slow pools of warm light across stone, linen, and glass with generous negative space',
      'quiet architectural shadows, polished dark wood, and a single soft amber reflection',
    ],
  },
  warm: {
    ambient: [
      'sunlight resting on natural wood, woven linen, and a softly textured wall',
      'a welcoming window-side interior with warm air, gentle shadows, and tactile materials',
      'soft golden-hour light passing across timber grain and handmade neutral surfaces',
    ],
  },
  calm: {
    ambient: [
      'diffused light through pale mist with open space and a restrained horizon',
      'gentle water reflections moving across a quiet minimal wall',
      'soft translucent layers, muted stone texture, and slow balanced shadows',
    ],
  },
  modern: {
    ambient: [
      'precise geometric planes, clean concrete texture, and a narrow line of moving light',
      'minimal architectural forms with frosted glass, soft reflections, and crisp negative space',
      'an abstract grid of shadow and light across refined neutral materials',
    ],
  },
  natural: {
    ambient: [
      'filtered daylight through leaves across linen, clay, and pale timber textures',
      'subtle botanical shadows moving over an airy earth-toned interior',
      'quiet mineral, paper, and natural-fiber textures in soft morning light',
    ],
  },
  energetic: {
    ambient: [
      'bold diagonal light crossing architectural surfaces with controlled visual rhythm',
      'high-contrast color planes and crisp shadows moving through an abstract space',
      'dynamic lines, directional light, and restrained motion across a graphic interior',
    ],
  },
} as const satisfies Record<MoodSubjectId, MoodSubjectRule>;

/** 고객이 주문·예약 후 현실과 비교할 수 있으므로 AI가 구체적으로 날조하면 안 되는 전역 범주. */
export const PRODUCT_AVOID = [
  'specific plated finished dishes or menu items',
  'specific finished drinks, desserts, or baked goods',
  'specific hairstyle, nail art, skin, cosmetic, or treatment results',
  'specific retail products, branded packaging, or invented merchandise',
  'before-and-after results, fabricated people, credentials, reviews, or evidence',
] as const;

/** 이미지·AI 무드 영상에 항상 붙는 소비자기만 방지 문장. */
export const PRODUCT_SAFETY_DIRECTIVE =
  'Do NOT depict a specific finished dish, product, or service result that a customer would order and compare to reality. Render mood, space, light, and texture — not the product.';

/** strict:false 회사·포트폴리오도 실존 주장·브랜드 자산을 날조하지 않도록 유지하는 완화 지시. */
export const RELAXED_BRAND_SAFETY_DIRECTIVE =
  'Abstract brand symbolism is allowed, but do NOT fabricate identifiable people, logos, credentials, reviews, clients, awards, or portfolio evidence.';

/** 고객 실사 image-to-video 전용 — 원본에 없던 피사체·효과를 만들지 않는다. */
export const FAITHFUL_PHOTO_MOTION_DIRECTIVE =
  'Use subtle camera movement and ambient motion only; preserve the source photograph and every subject exactly; do NOT add, remove, replace, restyle, or alter objects. Do not invent steam, ingredients, people, labels, treatment effects, or product details.';

const MOOD_MATCHERS: readonly { id: MoodSubjectId; re: RegExp }[] = [
  { id: 'elegant', re: /고급|우아|럭셔리|프리미엄|elegant|luxury|premium|refined/i },
  { id: 'modern', re: /미니멀|모던|정돈|깔끔|modern|minimal|swiss|geometric|clean/i },
  { id: 'warm', re: /친근|러스틱|따뜻|포근|아늑|warm|cozy|rustic|friendly|artisan/i },
  { id: 'calm', re: /차분|고요|평온|잔잔|calm|quiet|serene|soft|meditative/i },
  { id: 'natural', re: /자연|내추럴|오가닉|식물|natural|organic|botanical|earth/i },
  { id: 'energetic', re: /대담|강렬|역동|에너지|bold|dynamic|energetic|brutalist/i },
];

function toneParts(tone: readonly string[] | string | undefined | null): string[] {
  if (Array.isArray(tone)) return tone.map(String).filter(Boolean);
  const value = typeof tone === 'string' ? tone.trim() : '';
  return value ? [value] : [];
}

/** 실제 tone 칩 순서를 존중하고, 레거시/미지 입력은 보수적인 calm으로 폴백한다. */
export function resolveMoodSubjectId(
  tone: readonly string[] | string | undefined | null,
  fallbackMood?: string,
): MoodSubjectId {
  for (const part of [...toneParts(tone), ...(fallbackMood ? [fallbackMood] : [])]) {
    const hit = MOOD_MATCHERS.find(({ re }) => re.test(part));
    if (hit) return hit.id;
  }
  return 'calm';
}

/** 같은 설문·슬롯은 항상 같은 ambient 피사체를 얻는다(Math.random 금지). */
export function ambientSubjectFor(input: {
  tone?: readonly string[] | string | null;
  fallbackMood?: string;
  seed?: string;
}): string {
  const moodId = resolveMoodSubjectId(input.tone, input.fallbackMood);
  const ambient = MOOD_SUBJECTS[moodId].ambient;
  const seed = `${moodId}:${input.seed ?? 'hero'}`;
  return ambient[stableIndex(seed, ambient.length)];
}

const MOOD_PROMPTS: Record<MoodSubjectId, string> = {
  elegant: 'quiet elegant mood with restrained warm light',
  warm: 'welcoming warm mood with soft natural sunlight',
  calm: 'calm spacious mood with diffused light',
  modern: 'precise modern mood with clean geometry and controlled reflections',
  natural: 'natural tactile mood with filtered daylight and organic materials',
  energetic: 'bold energetic mood with directional light and controlled rhythm',
};

/** 자유 입력을 그대로 모델에 보내지 않고 등록된 영어 무드로만 축약한다. */
export function moodPromptForTone(
  tone: readonly string[] | string | undefined | null,
  fallbackMood?: string,
): string {
  return MOOD_PROMPTS[resolveMoodSubjectId(tone, fallbackMood)];
}

/** photo는 다큐멘터리처럼 오인되기 쉬워 금지 범주까지 명시하고, 비사진 스타일은 명백한 양식화를 요구한다. */
export function productSafetyDirective(
  candidateStyle: CandidateStyle = 'photo',
  options?: { strict?: boolean },
): string {
  const styleDirective =
    candidateStyle === 'illustration'
      ? 'Keep all forms clearly illustrated.'
      : candidateStyle === '3d_render'
        ? 'Keep all forms clearly constructed and stylized.'
        : 'Use art-directed atmosphere rather than documentary-looking claims.';
  if (options?.strict === false) {
    return `${PRODUCT_SAFETY_DIRECTIVE} ${RELAXED_BRAND_SAFETY_DIRECTIVE} ${styleDirective}`;
  }
  if (candidateStyle === 'photo') {
    return (
      `${PRODUCT_SAFETY_DIRECTIVE} Photographic output is especially strict: never use these as focal subjects: ` +
      `${PRODUCT_AVOID.join('; ')}.`
    );
  }
  return `${PRODUCT_SAFETY_DIRECTIVE} ${styleDirective} Keep the ambient mood, not an orderable outcome, as the focal subject.`;
}

export function hasProductSafetyDirective(prompt: string): boolean {
  return prompt.includes(PRODUCT_SAFETY_DIRECTIVE);
}

export function hasFaithfulPhotoDirective(prompt: string): boolean {
  return prompt.includes(FAITHFUL_PHOTO_MOTION_DIRECTIVE);
}
