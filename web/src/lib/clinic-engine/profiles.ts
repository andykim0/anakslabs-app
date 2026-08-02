import type { ClinicEngineProfile } from './contracts';

/**
 * Product-policy axes only. Market observations remain separate evidence sets and never merge
 * into a shared set of vocabulary or thresholds.
 */
export const US_MEDICAL_OUTREACH_PROFILE = Object.freeze({
  id: 'us-medical-outreach-v1',
  siteForm: 'discovered-multipage',
  locale: 'en-US',
  deliveryMode: 'outreach',
  contentTransfer: 'redesign',
  jurisdiction: 'us-medical-advertising',
  scoringLens: 'us-medical-outreach-v1',
  typographyPreset: 'latin-clinic-pinned',
  uiChrome: 'en',
  marketEvidence: {
    id: 'us-clinic-104',
    sampleSize: 104,
  },
} satisfies ClinicEngineProfile);

export const US_MEDICAL_CONSENTED_PROFILE = Object.freeze({
  id: 'us-medical-consented-v1',
  siteForm: 'discovered-multipage',
  locale: 'en-US',
  // Full transfer uses the import contract while the preview shell remains private outreach.
  deliveryMode: 'import',
  contentTransfer: 'full-transfer',
  jurisdiction: 'us-medical-advertising',
  scoringLens: 'us-medical-outreach-v1',
  typographyPreset: 'latin-clinic-pinned',
  uiChrome: 'en',
  marketEvidence: {
    id: 'us-clinic-104',
    sampleSize: 104,
  },
} satisfies ClinicEngineProfile);

export const KO_MEDICAL_IMPORT_PROFILE = Object.freeze({
  id: 'ko-medical-import-v1',
  siteForm: 'fixed-set-multipage',
  locale: 'ko-KR',
  deliveryMode: 'import',
  contentTransfer: 'full-transfer',
  jurisdiction: 'kr-medical-law',
  scoringLens: 'ko-medical-import-v1',
  typographyPreset: 'korean-clinic-paired',
  uiChrome: 'ko',
  marketEvidence: {
    id: 'ko-clinic-30',
    sampleSize: 30,
  },
} satisfies ClinicEngineProfile);
