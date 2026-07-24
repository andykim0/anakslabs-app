import { sectionCompatibility } from './section-catalog-helpers';
import type {
  DirectionsLayoutVariantId,
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const noAssetMedia = {
  role: 'none',
  categoricalEligible: false,
  fallbackLadder: [],
} as const;
const content = {
  minimumItems: 1,
  maximumItems: 4,
  requiredFields: ['customer-confirmed-directions-fact'],
  optionalFields: ['section-title', 'lead', 'verified-map-runtime', 'verified-place-link', 'detail-link'],
} as const;

export const DIRECTIONS_LAYOUT_CATALOG = [
  {
    id: 'directions.map-info-split',
    kind: 'directions',
    label: '지도·정보 분할형',
    description: '방문 사실과 검증된 지도를 같은 화면에서 교차 확인하게 합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'start-middle', flow: 'map-info-split', columns: 2 }),
      compact: recipe({ gridColumns: 8, textZone: 'start-middle', flow: 'map-info-split', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'map-info-split', columns: 1 }),
    },
    content,
    mediaContract: noAssetMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'medical', 'workshop', 'retail', 'academy'],
      ['legal', 'consulting', 'portfolio'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'medical-clinical-clarity', 'academy-structured-friendly', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'directions.info-card-stack',
    kind: 'directions',
    label: '사실 정보 카드 스택형',
    description: '지도 없이도 주소·교통·주차의 고객 확인 사실을 빠르게 훑게 합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'info-card-stack', columns: 2 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'info-card-stack', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'info-card-stack', columns: 1 }),
    },
    content,
    mediaContract: noAssetMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'directions.full-map-overlay',
    kind: 'directions',
    label: '풀폭 지도·정보 오버레이형',
    description: '검증된 지도를 넓게 보여주고 핵심 주소와 방문 행동을 불투명 surface에 둡니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'start-lower', flow: 'full-map-overlay', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'start-lower', flow: 'full-map-overlay', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'start-lower', flow: 'full-map-overlay', columns: 1 }),
    },
    content,
    mediaContract: noAssetMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'retail'],
      ['medical', 'legal', 'consulting', 'workshop', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'retail-bold-geometric'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<DirectionsLayoutVariantId>[];

export function directionsLayoutById(id: DirectionsLayoutVariantId) {
  const variant = DIRECTIONS_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown directions layout variant: ${id}`);
  return variant;
}
