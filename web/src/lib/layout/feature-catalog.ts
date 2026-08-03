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
    label: 'Three-column cards',
    description: 'A card grid for comparing three to six equal services or strengths.',
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
    label: 'Alternating media rows',
    description: 'Alternates scenes and explanations to give a long list a clear reading rhythm.',
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
    label: 'Icon grid',
    description: 'Scans service categories and primary benefits in short units without images.',
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
    label: 'Numbered list',
    description: 'Uses clear rows of markers, titles, and descriptions to establish hierarchy.',
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
    label: 'Sticky heading columns',
    description: 'Keeps context on the left while the longer sequence reads on the right.',
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
    label: 'Featured first',
    description: 'Makes the first customer-provided item prominent and follows with a supporting list.',
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
    label: 'FAQ accordion',
    description: 'Presents three to eight verified questions and answers as an expanded static document.',
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
    label: 'Operational stat strip',
    description: 'Shows two to four sourced operational numbers side by side without visual exaggeration.',
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
  {
    id: 'features.dark-value-band',
    kind: 'features',
    label: 'Dark statement band',
    description: 'Uses one sourced statement as a dark mid-page pause.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'dark-value-band', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'dark-value-band', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'dark-value-band', columns: 1 }),
    },
    content: {
      minimumItems: 1,
      maximumItems: 1,
      requiredFields: ['section-title', 'item-title'],
      optionalFields: ['item-body'],
    },
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
    surfaceTone: 'dark',
  },
  {
    id: 'features.prose-article',
    kind: 'features',
    label: 'Article body',
    description: 'Preserves the original title, body, and authorship evidence in a narrow reading measure without summarizing.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'prose-article', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'prose-article', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'prose-article', columns: 1 }),
    },
    content: {
      minimumItems: 1,
      maximumItems: 100,
      requiredFields: ['section-title', 'item-title'],
      optionalFields: ['item-body', 'item-media', 'item-cta'],
    },
    mediaContract: figureMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<FeatureLayoutVariantId>[];

export function featureLayoutById(id: FeatureLayoutVariantId) {
  const variant = FEATURE_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown feature layout variant: ${id}`);
  return variant;
}
