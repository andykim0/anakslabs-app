import { sectionCompatibility } from './section-catalog-helpers';
import type {
  GalleryLayoutVariantId,
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const galleryMedia = {
  role: 'referential-figure',
  categoricalEligible: false,
  fallbackLadder: ['customer-referential', 'collapse-slot'],
} as const;
const content = {
  minimumItems: 2,
  maximumItems: 12,
  requiredFields: ['section-title', 'customer-referential-media'],
  optionalFields: ['eyebrow', 'lead', 'customer-caption', 'gallery-cta'],
} as const;

export const GALLERY_LAYOUT_CATALOG = [
  {
    id: 'gallery.masonry',
    kind: 'gallery',
    label: '매스너리형',
    description: '사진의 원래 가로·세로 성격을 보존하며 짧은 열부터 채웁니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'masonry', columns: 3 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'masonry', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'masonry', columns: 2 }),
    },
    content,
    mediaContract: galleryMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'gallery.uniform-grid',
    kind: 'gallery',
    label: '균일 그리드형',
    description: '같은 크기의 사진 셀로 장면을 빠르고 예측 가능하게 비교합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'uniform-grid', columns: 3, mediaAspect: '4:3' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'uniform-grid', columns: 2, mediaAspect: '4:3' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'uniform-grid', columns: 2, mediaAspect: '1:1', mobileLongTextColumns: 1 }),
    },
    content,
    mediaContract: galleryMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'retail', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'gallery.carousel',
    kind: 'gallery',
    label: '가로 넘겨보기형',
    description: '한 장면에 집중하고 이전·다음 제어로 사진을 유한하게 탐색합니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'carousel', columns: 1, mediaAspect: '16:9' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'carousel', columns: 1, mediaAspect: '16:9' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'carousel', columns: 1, mediaAspect: '4:3' }),
    },
    content,
    mediaContract: galleryMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric'],
    ),
    staticFallbackId: 'gallery.uniform-grid',
  },
  {
    id: 'gallery.asymmetric-two-one',
    kind: 'gallery',
    label: '비대칭 2대1형',
    description: '세 장 단위의 큰 장면과 두 보조 장면으로 편집적인 리듬을 만듭니다.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'asymmetric-two-one', columns: 3, mediaAspect: '4:3' }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'asymmetric-two-one', columns: 2, mediaAspect: '4:3' }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'asymmetric-two-one', columns: 1, mediaAspect: '4:3' }),
    },
    content,
    mediaContract: galleryMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<GalleryLayoutVariantId>[];

export function galleryLayoutById(id: GalleryLayoutVariantId) {
  const variant = GALLERY_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown gallery layout variant: ${id}`);
  return variant;
}
