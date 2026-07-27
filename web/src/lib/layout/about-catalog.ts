import { sectionCompatibility } from './section-catalog-helpers';
import type {
  AboutLayoutVariantId,
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const figureMedia = {
  role: 'referential-figure',
  categoricalEligible: true,
  fallbackLadder: ['customer-referential', 'categorical-stock', 'collapse-slot'],
} as const;
const atmosphericMedia = {
  role: 'atmospheric-background',
  categoricalEligible: false,
  // 공급 실사는 atmosphere로만 소비한다. 고객 실제 사진이 언제나 먼저다.
  fallbackLadder: ['customer-referential', 'categorical-stock', 'system-atmospheric'],
} as const;
const noMedia = {
  role: 'none',
  categoricalEligible: false,
  fallbackLadder: [],
} as const;
const content = {
  minimumItems: 1,
  maximumItems: 8,
  requiredFields: ['section-title', 'customer-story-or-philosophy-or-fact'],
  optionalFields: ['eyebrow', 'story-paragraph', 'fact', 'media', 'cta'],
} as const;

export const ABOUT_LAYOUT_CATALOG = [
  {
    id: 'about.split-left',
    kind: 'about',
    label: '소개·이미지 2열형',
    description: '고객의 실제 이야기를 먼저 읽히고 관련 사진을 옆에 둡니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'split', columns: 2, mediaAspect: '4:5' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'split', columns: 2, mediaAspect: '4:5' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'split', columns: 1, mediaAspect: '4:3' }),
    },
    content,
    mediaContract: figureMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'beauty', 'medical', 'legal', 'consulting', 'workshop', 'portfolio', 'academy'],
      ['fine_dining', 'retail'],
      ['cafe-warm-editorial', 'beauty-soft-wellness', 'medical-clinical-clarity', 'legal-authoritative-editorial', 'workshop-tactile-heritage'],
    ),
  },
  {
    id: 'about.centered-statement',
    kind: 'about',
    label: '큰 타이포 중앙 선언형',
    description: '고객이 직접 적은 철학을 중심 문장으로 세우고 이야기를 잇습니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'centered-statement', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'centered-statement', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'centered-statement', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'portfolio'],
      ['consulting', 'retail', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
  {
    id: 'about.fullbleed-overlay',
    kind: 'about',
    label: '풀블리드 이미지 오버레이형',
    description: '이야기를 한 장면의 배경과 결합하되 사실 증거와 분위기를 구분합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'start-middle', flow: 'fullbleed-overlay', columns: 1, mediaAspect: '16:9' }),
      compact: recipe({ gridColumns: 8, textZone: 'start-middle', flow: 'fullbleed-overlay', columns: 1, mediaAspect: '4:3' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-start', flow: 'fullbleed-overlay', columns: 1, mediaAspect: '4:5' }),
    },
    content,
    mediaContract: atmosphericMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'portfolio'],
      ['consulting', 'retail', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
  {
    id: 'about.heading-body-columns',
    kind: 'about',
    label: '제목·본문 2열형',
    description: '긴 소개를 제목 축과 본문 열로 나누어 문서처럼 안정적으로 읽힙니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'heading-body-columns', columns: 2 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'heading-body-columns', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'heading-body-columns', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'retail', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly', 'retail-bold-geometric'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<AboutLayoutVariantId>[];

export function aboutLayoutById(id: AboutLayoutVariantId) {
  const variant = ABOUT_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown about layout variant: ${id}`);
  return variant;
}
