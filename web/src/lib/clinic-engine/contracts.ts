export const CLINIC_ENGINE_PROFILE_IDS = [
  'us-medical-outreach-v1',
  'ko-medical-import-v1',
] as const;

export type ClinicEngineProfileId = (typeof CLINIC_ENGINE_PROFILE_IDS)[number];

export const CLINIC_ENGINE_GATE_IDS = [
  'source-completeness',
  'reverse-enumeration',
  'render-block-integrity',
  'density',
  'line-width',
  'contrast',
  'clipping',
  'text-zone',
] as const;

export type ClinicEngineGateId = (typeof CLINIC_ENGINE_GATE_IDS)[number];

export const CLINIC_ENGINE_PHASES = [
  'source-extraction',
  'page-split',
  'layout-resolution',
  'gate-audit',
] as const;

export type ClinicEnginePhase = (typeof CLINIC_ENGINE_PHASES)[number];

export interface ClinicEngineProfile {
  id: ClinicEngineProfileId;
  siteForm: 'discovered-multipage' | 'fixed-set-multipage';
  locale: 'en-US' | 'ko-KR';
  deliveryMode: 'outreach' | 'import';
  jurisdiction: 'us-medical-advertising' | 'kr-medical-law';
  scoringLens: 'us-medical-outreach-v1' | 'ko-medical-import-v1';
  typographyPreset: 'latin-clinic-pinned' | 'korean-clinic-paired';
  uiChrome: 'en' | 'ko';
  marketEvidence: {
    id: 'us-clinic-104' | 'ko-clinic-30';
    sampleSize: 104 | 30;
  };
}

export type ClinicEngineGateEvidence = Partial<
  Readonly<Record<ClinicEngineGateId, boolean>>
>;

export interface ClinicEngineGateResult {
  id: ClinicEngineGateId;
  status: 'pass' | 'fail' | 'deferred';
}

export interface ClinicEngineTrace {
  profileId: ClinicEngineProfileId;
  phases: readonly ClinicEnginePhase[];
  gates: readonly ClinicEngineGateResult[];
}
