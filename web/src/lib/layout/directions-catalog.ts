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
    label: 'Map and information split',
    description: 'Lets visitors cross-check verified visit details and the map in one view.',
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
    label: 'Visit detail card stack',
    description: 'Scans verified address, transit, and parking details without requiring a map.',
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
    label: 'Full-width map with information overlay',
    description: 'Shows the verified map at full width with address and visit actions on an opaque surface.',
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
