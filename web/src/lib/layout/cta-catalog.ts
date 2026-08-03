import { sectionCompatibility } from './section-catalog-helpers';
import type {
  CtaLayoutVariantId,
  SectionLayoutBandRecipe,
  SectionLayoutVariant,
} from './section-layout-types';

const recipe = (value: SectionLayoutBandRecipe): SectionLayoutBandRecipe => value;
const noMedia = {
  role: 'none',
  categoricalEligible: false,
  fallbackLadder: [],
} as const;
const content = {
  minimumItems: 1,
  maximumItems: 2,
  requiredFields: ['section-title', 'verified-primary-destination'],
  optionalFields: ['eyebrow', 'lead', 'verified-secondary-destination'],
} as const;

export const CTA_LAYOUT_CATALOG = [
  {
    id: 'cta.fullwidth-band',
    kind: 'cta',
    label: 'Full-width statement band',
    description: 'Declares one clear action at a strong break in the section rhythm.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'center-middle', flow: 'fullwidth-band', columns: 1 }),
      compact: recipe({ gridColumns: 8, textZone: 'center-middle', flow: 'fullwidth-band', columns: 1 }),
      mobile: recipe({ gridColumns: 4, textZone: 'center-middle', flow: 'fullwidth-band', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe-warm-editorial', 'dining-refined-contrast', 'beauty-soft-wellness', 'workshop-tactile-heritage', 'retail-bold-geometric'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial'],
    ),
  },
  {
    id: 'cta.split-action',
    kind: 'cta',
    label: 'Split context and action',
    description: 'Explains the necessary context before presenting the adjacent action.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'flow-full', flow: 'split-action', columns: 2 }),
      compact: recipe({ gridColumns: 8, textZone: 'flow-full', flow: 'split-action', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'flow-full', flow: 'split-action', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['medical', 'legal', 'consulting', 'academy'],
      ['cafe', 'fine_dining', 'beauty', 'workshop', 'retail', 'portfolio'],
      ['medical-clinical-clarity', 'legal-authoritative-editorial', 'academy-structured-friendly', 'retail-bold-geometric'],
    ),
  },
  {
    id: 'cta.surface-card',
    kind: 'cta',
    label: 'Standalone action card',
    description: 'Keeps the copy and real action together in one decision card.',
    bands: {
      wide: recipe({ gridColumns: 12, textZone: 'center-middle', flow: 'surface-card', columns: 2 }),
      compact: recipe({ gridColumns: 8, textZone: 'center-middle', flow: 'surface-card', columns: 2 }),
      mobile: recipe({ gridColumns: 4, textZone: 'center-middle', flow: 'surface-card', columns: 1 }),
    },
    content,
    mediaContract: noMedia,
    compatibility: sectionCompatibility(
      ['beauty', 'consulting', 'academy', 'retail'],
      ['cafe', 'fine_dining', 'medical', 'legal', 'workshop', 'portfolio'],
      ['beauty-soft-wellness', 'academy-structured-friendly', 'retail-bold-geometric', 'cafe-warm-editorial'],
      ['legal-authoritative-editorial'],
    ),
  },
] as const satisfies readonly SectionLayoutVariant<CtaLayoutVariantId>[];

export function ctaLayoutById(id: CtaLayoutVariantId) {
  const variant = CTA_LAYOUT_CATALOG.find((candidate) => candidate.id === id);
  if (!variant) throw new Error(`Unknown CTA layout variant: ${id}`);
  return variant;
}
