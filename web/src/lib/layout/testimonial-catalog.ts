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
    label: 'Featured quote',
    description: 'Presents one review approved for publication with its source.',
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
    label: 'Two- or three-column review cards',
    description: 'Compares several reviews approved for publication in their original order.',
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
    label: 'Quote and customer photo split',
    description: 'Pairs a real person’s photo, covered by separate consent, with that person’s review.',
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
