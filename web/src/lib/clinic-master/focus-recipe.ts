import type { ClinicMasterPin } from '@/lib/types/site';

export type ClinicServiceCategory = 'implant' | 'orthodontic' | 'general';

export const CLINIC_FOCUS_RECIPES = Object.freeze({
  implant: {
    categoryOrder: ['implant', 'general', 'orthodontic'],
    featuredCategory: 'implant',
  },
  orthodontic: {
    categoryOrder: ['orthodontic', 'general', 'implant'],
    featuredCategory: 'orthodontic',
  },
  balanced: {
    categoryOrder: ['general', 'implant', 'orthodontic'],
    featuredCategory: null,
  },
} as const satisfies Readonly<Record<ClinicMasterPin['focus'], {
  categoryOrder: readonly ClinicServiceCategory[];
  featuredCategory: ClinicServiceCategory | null;
}>>);

const IMPLANT_RE =
  /\b(?:dental\s+)?implants?\b|\ball[- ]on[- ](?:4|6)\b|\bfull[- ]arch\b/iu;
const ORTHODONTIC_RE =
  /\borthodont(?:ic|ics|ist)?\b|\bbraces\b|\binvisalign\b|\bclear aligners?\b/iu;

export function clinicServiceCategory(text: string): ClinicServiceCategory {
  const implant = IMPLANT_RE.test(text);
  const orthodontic = ORTHODONTIC_RE.test(text);
  if (implant && !orthodontic) return 'implant';
  if (orthodontic && !implant) return 'orthodontic';
  return 'general';
}

/**
 * 원문 service 블록의 명시적 키워드 수만 센다. 동률·무근거·한 블록에 양쪽 근거가
 * 함께 있는 경우에는 균형형으로 fail closed 한다.
 */
export function resolveClinicFocus(
  services: readonly { text: string }[],
): ClinicMasterPin['focus'] {
  let implant = 0;
  let orthodontic = 0;
  for (const service of services) {
    if (IMPLANT_RE.test(service.text) && !ORTHODONTIC_RE.test(service.text)) implant += 1;
    if (ORTHODONTIC_RE.test(service.text) && !IMPLANT_RE.test(service.text)) orthodontic += 1;
  }
  if (implant === orthodontic) return 'balanced';
  return implant > orthodontic ? 'implant' : 'orthodontic';
}

/** 같은 category 안에서는 원문 순서를 보존하는 서버 고정 recipe. */
export function orderClinicServices<T extends { text: string }>(
  services: readonly T[],
  focus: ClinicMasterPin['focus'],
): T[] {
  if (focus === 'balanced') return [...services];
  const recipe = CLINIC_FOCUS_RECIPES[focus];
  const rank = new Map(recipe.categoryOrder.map((category, index) => [category, index]));
  return services
    .map((service, index) => ({ service, index, category: clinicServiceCategory(service.text) }))
    .sort((left, right) => (
      (rank.get(left.category) ?? Number.MAX_SAFE_INTEGER)
      - (rank.get(right.category) ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ))
    .map(({ service }) => service);
}
