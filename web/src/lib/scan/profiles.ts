import type { ScanLocaleContext, ScanProfileId } from './rules';

export const US_MEDICAL_OUTREACH_PROFILE_ID = 'us-medical-outreach-v1' as const;

export const US_MEDICAL_OUTREACH_LOCALE = Object.freeze({
  profileId: US_MEDICAL_OUTREACH_PROFILE_ID,
  locale: 'en-US',
} as const satisfies ScanLocaleContext);

export const US_MEDICAL_OUTREACH_GROUP_WEIGHTS = Object.freeze({
  entity: 35,
  structuredSchema: 25,
  evidence: 20,
  answerExtraction: 15,
  access: 5,
} as const);

export type UsMedicalOutreachGroup = keyof typeof US_MEDICAL_OUTREACH_GROUP_WEIGHTS;

export interface ScanProfileContract {
  id: ScanProfileId;
  locale: ScanLocaleContext;
  groupWeights: typeof US_MEDICAL_OUTREACH_GROUP_WEIGHTS;
  /** These remain visible status checks and never change the outreach score. */
  technicalBaselineRuleCodes: readonly [
    'seo_https',
    'seo_viewport',
    'seo_speed_slow',
    'seo_speed_very_slow',
  ];
  /** Korea-only rules are intentionally outside this lens, not removed from the base scanner. */
  excludedRuleCodes: readonly [
    'seo_naver_yeti_blocked',
    'seo_daum_blocked',
    'seo_korean_encoding',
    'geo_naver_sourceinfo_disabled',
    'geo_korean_lang_mismatch',
  ];
}

export const US_MEDICAL_OUTREACH_PROFILE = Object.freeze({
  id: US_MEDICAL_OUTREACH_PROFILE_ID,
  locale: US_MEDICAL_OUTREACH_LOCALE,
  groupWeights: US_MEDICAL_OUTREACH_GROUP_WEIGHTS,
  technicalBaselineRuleCodes: [
    'seo_https',
    'seo_viewport',
    'seo_speed_slow',
    'seo_speed_very_slow',
  ],
  excludedRuleCodes: [
    'seo_naver_yeti_blocked',
    'seo_daum_blocked',
    'seo_korean_encoding',
    'geo_naver_sourceinfo_disabled',
    'geo_korean_lang_mismatch',
  ],
} as const satisfies ScanProfileContract);
