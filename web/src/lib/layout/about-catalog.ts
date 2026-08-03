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
    label: 'Two-column story and image',
    description: 'Puts the customer\'s own story first, with related photography beside it.',
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
    label: 'Centered editorial statement',
    description: 'Leads with the customer\'s own defining statement and continues the story below.',
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
    label: 'Full-bleed image overlay',
    description: 'Pairs the story with one scene while keeping evidence distinct from atmosphere.',
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
    label: 'Two-column heading and body',
    description: 'Separates a long introduction into a heading axis and a readable body column.',
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
