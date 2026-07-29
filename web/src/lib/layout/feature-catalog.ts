import { sectionCompatibility } from './section-catalog-helpers';
import type {
  FeatureLayoutVariantId,
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const figureMedia = {
  role: 'referential-figure',
  categoricalEligible: true,
  fallbackLadder: ['customer-referential', 'categorical-stock', 'collapse-slot'],
} as const;
const noMedia = {
  role: 'none',
  categoricalEligible: false,
  fallbackLadder: [],
} as const;
const content = {
  minimumItems: 2,
  maximumItems: 6,
  requiredFields: ['section-title', 'item-title'],
  optionalFields: ['eyebrow', 'lead', 'item-body', 'item-marker', 'item-media', 'item-cta'],
} as const;

export const FEATURE_LAYOUT_CATALOG = [
  {
    id: 'features.three-column-cards',
    kind: 'features',
    label: '3열 카드형',
    description: '동등한 서비스·강점 3~6개를 빠르게 비교하는 카드 배열입니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'equal-grid', columns: 3, mediaAspect: '4:3' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'equal-grid', columns: 2, mediaAspect: '4:3' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'equal-grid', columns: 1, mediaAspect: '16:9' }),
    },
    content,
    mediaContract: figureMedia,
    compatibility: sectionCompatibility(
      ['beauty', 'medical', 'consulting', 'retail', 'academy'],
      ['cafe', 'fine_dining', 'legal', 'workshop', 'portfolio'],
      ['medical-clinical-clarity', 'academy-structured-friendly', 'retail-bold-geometric', 'beauty-soft-wellness'],
      ['dining-refined-contrast'],
    ),
  },
  {
    id: 'features.zigzag-media',
    kind: 'features',
    label: '좌우 지그재그 미디어형',
    description: '항목별 장면과 설명을 좌우로 교차해 긴 목록에 리듬을 줍니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-alternate', flow: 'alternating-media', columns: 2, mediaAspect: '3:2' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-alternate', flow: 'alternating-media', columns: 2, mediaAspect: '3:2' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'alternating-media', columns: 1, mediaAspect: '4:3' }),
    },
    content,
    mediaContract: figureMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'portfolio'],
      ['medical', 'legal', 'consulting', 'retail', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage'],
      ['medical-clinical-clarity'],
    ),
  },
  {
    id: 'features.icon-grid',
    kind: 'features',
    label: '아이콘 그리드형',
    description: '이미지 없이 서비스 범주와 핵심 편익을 짧은 단위로 탐색합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'icon-grid', columns: 4 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'icon-grid', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'icon-grid', columns: 2, mobileLongTextColumns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'consulting', 'retail', 'academy'],
      ['cafe', 'beauty', 'legal', 'workshop', 'portfolio'],
      ['medical-clinical-clarity', 'academy-structured-friendly', 'retail-bold-geometric'],
      ['dining-refined-contrast'],
    ),
  },
  {
    id: 'features.numbered-list',
    kind: 'features',
    label: '번호 목록형',
    description: '번호·제목·설명을 명확한 행 구조로 이어 정보 위계를 강조합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'numbered-rows', columns: 3 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'numbered-rows', columns: 3 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'numbered-rows', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly'],
    ),
  },
  {
    id: 'features.sticky-heading-two-column',
    kind: 'features',
    label: '고정 제목 2열형',
    description: '왼쪽 맥락을 유지하고 오른쪽 항목을 순서대로 읽는 긴 설명형 배열입니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'sticky-heading', columns: 2, stickyHeading: true }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'sticky-heading', columns: 2, stickyHeading: true }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'sticky-heading', columns: 1, stickyHeading: false }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['fine_dining', 'legal', 'consulting', 'workshop', 'portfolio'],
      ['cafe', 'beauty', 'medical', 'retail', 'academy'],
      ['dining-refined-contrast', 'legal-authoritative-editorial', 'workshop-tactile-heritage'],
    ),
  },
  {
    id: 'features.featured-first',
    kind: 'features',
    label: '첫 항목 강조형',
    description: '고객 입력 순서의 첫 항목을 크게 두고 나머지를 보조 목록으로 잇습니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'featured-first', columns: 2, mediaAspect: '4:3' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'featured-first', columns: 2, mediaAspect: '4:3' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'featured-first', columns: 1, mediaAspect: '16:9' }),
    },
    content,
    mediaContract: figureMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'features.faq-accordion',
    kind: 'features',
    label: 'FAQ 아코디언형',
    description: '검증된 질문과 답변 3~8개를 표면 카드에 모두 펼쳐 정적 문서로 제공합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'accordion', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'accordion', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'accordion', columns: 1 }),
    },
    content: {
      minimumItems: 3,
      maximumItems: 8,
      requiredFields: ['section-title', 'item-title', 'item-body'],
      optionalFields: [],
    },
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly'],
    ),
  },
  {
    id: 'features.stat-strip',
    kind: 'features',
    label: '운영 수치 스트립형',
    description: '출처가 확인된 운영 수치 2~4개를 절제된 크기로 나란히 보여줍니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'stat-strip', columns: 4 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'stat-strip', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'stat-strip', columns: 2 }),
    },
    content: {
      minimumItems: 2,
      maximumItems: 4,
      requiredFields: ['section-title', 'item-marker', 'item-title'],
      optionalFields: [],
    },
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'legal', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'academy-structured-friendly'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<FeatureLayoutVariantId>[];

export function featureLayoutById(id: FeatureLayoutVariantId) {
  const variant = FEATURE_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown feature layout variant: ${id}`);
  return variant;
}
