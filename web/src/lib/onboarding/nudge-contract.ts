export type OnboardingNudgeId = 'public-contact' | 'metric-source';

export interface OnboardingNudgeStatus {
  id: OnboardingNudgeId;
  fieldPaths: readonly string[];
  ruleCodes: readonly string[];
  pillars: readonly ('seo' | 'aeo' | 'geo')[];
  badge: string;
  state: 'complete' | 'incomplete';
  message: string;
}

/** 클라이언트는 서버가 계산한 결과만 표시하며 점수 weight·산식은 받지 않는다. */
export interface OnboardingPreflightDto {
  scores: {
    seo: number;
    aeo: number;
    geo: number;
    total: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issueCodes: readonly string[];
  nudges: readonly OnboardingNudgeStatus[];
}
