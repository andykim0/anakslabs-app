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
    label: 'Masonry',
    description: 'Preserves each image\'s orientation while filling the shortest column first.',
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
    label: 'Uniform grid',
    description: 'Uses equal image cells for quick, predictable comparison.',
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
    label: 'Horizontal gallery',
    description: 'Focuses on one scene at a time with finite previous and next controls.',
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
    label: 'Asymmetric two-to-one',
    description: 'Creates an editorial rhythm with one lead image and two supporting images.',
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
