import { sectionCompatibility } from './section-catalog-helpers';
import type {
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
  TestimonialLayoutVariantId,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const noMedia = {
  role: 'none',
  categoricalEligible: false,
  fallbackLadder: [],
} as const;
const optionalBoundPhoto = {
  role: 'referential-figure',
  categoricalEligible: false,
  fallbackLadder: ['customer-referential', 'collapse-slot'],
} as const;

export const TESTIMONIAL_LAYOUT_CATALOG = [
  {
    id: 'testimonial.single-quote',
    kind: 'testimonial',
    label: '단일 인용 강조형',
    description: '게시 허락된 실제 후기 한 건을 출처와 함께 크게 읽게 합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'center-middle', flow: 'single-quote', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'center-middle', flow: 'single-quote', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'center-middle', flow: 'single-quote', columns: 1 }),
    },
    content: {
      minimumItems: 1,
      maximumItems: 6,
      requiredFields: ['publication-permitted-testimonial'],
      optionalFields: ['section-title', 'lead', 'customer-provided-source-line'],
    },
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'academy'],
      ['legal', 'consulting', 'retail', 'portfolio'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'academy-structured-friendly'],
      ['medical-clinical-clarity'],
    ),
  },
  {
    id: 'testimonial.card-grid',
    kind: 'testimonial',
    label: '2~3열 후기 카드형',
    description: '게시 허락된 실제 후기 여러 건을 공개 순서 그대로 비교합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'testimonial-card-grid', columns: 3 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'testimonial-card-grid', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'testimonial-card-grid', columns: 1 }),
    },
    content: {
      minimumItems: 2,
      maximumItems: 6,
      requiredFields: ['publication-permitted-testimonial'],
      optionalFields: ['section-title', 'lead', 'customer-provided-source-line'],
    },
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['beauty', 'consulting', 'retail', 'academy'],
      ['cafe', 'fine_dining', 'workshop', 'portfolio'],
      ['beauty-soft-wellness', 'retail-bold-geometric', 'academy-structured-friendly', 'cafe-warm-editorial'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
  {
    id: 'testimonial.quote-photo',
    kind: 'testimonial',
    label: '인용·고객 사진 분할형',
    description: '별도 동의로 연결된 실제 인물 사진과 그 사람의 후기를 한 쌍으로 둡니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'end-middle', flow: 'quote-photo', columns: 2, mediaAspect: '4:5' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'quote-photo', columns: 2, mediaAspect: '4:5' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'quote-photo', columns: 1, mediaAspect: '4:3' }),
    },
    content: {
      minimumItems: 1,
      maximumItems: 1,
      requiredFields: ['publication-permitted-testimonial'],
      optionalFields: ['consent-bound-referential-photo', 'customer-provided-source-line', 'section-title', 'lead'],
    },
    mediaContract: optionalBoundPhoto,
    compatibility: sectionCompatibility(
      ['beauty', 'workshop', 'portfolio'],
      ['cafe', 'fine_dining', 'consulting', 'retail', 'academy'],
      ['beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric', 'cafe-warm-editorial'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<TestimonialLayoutVariantId>[];

export function testimonialLayoutById(id: TestimonialLayoutVariantId) {
  const variant = TESTIMONIAL_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown testimonial layout variant: ${id}`);
  return variant;
}
