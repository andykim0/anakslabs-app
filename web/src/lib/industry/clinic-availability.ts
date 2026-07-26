import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import {
  CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION,
} from '@/lib/pricing';
import type { SiteConfig } from '@/lib/types/site';

export const CLINIC_PUBLISH_FLAG = 'CLINIC_PUBLISH_ENABLED' as const;

export type ClinicAvailabilityReason =
  | 'available'
  | 'flag-off'
  | 'policy-version-mismatch'
  | 'draft-required'
  | 'classification-mismatch'
  | 'copy-blocked'
  | 'review-required';

export interface ClinicAvailability {
  available: boolean;
  reason: ClinicAvailabilityReason;
  requiredPolicyVersion: typeof CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION;
  deployedPolicyVersion: string;
}

interface ClinicAvailabilityInput {
  /** 발행·결제 경계에서는 true. 랜딩·sitemap·내비는 배포 준비 상태만 검사한다. */
  requireDraft?: boolean;
  config?: SiteConfig | null;
  /** 테스트에서만 주입한다. 제품 경로는 정확히 '1'인 서버 env만 활성으로 본다. */
  flagValue?: string;
  /** 요구 버전 불일치 회귀를 위한 의존성 주입. 기본은 현재 배포 린터 버전이다. */
  deployedPolicyVersion?: string;
}

/**
 * clinic 공개 가용성의 유일한 정책 함수.
 *
 * 저장된 config.meta.medicalAdPolicyVersion은 감사 흔적일 뿐 신뢰하지 않는다. 발행·결제는
 * 호출 때마다 현재 전체 config를 다시 검사하며 warn도 사람 검토 seam이 생기기 전까지 차단한다.
 */
export function clinicAvailability(
  input: ClinicAvailabilityInput = {},
): ClinicAvailability {
  const deployedPolicyVersion = input.deployedPolicyVersion ?? MEDICAL_AD_POLICY_VERSION;
  const base = {
    requiredPolicyVersion: CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION,
    deployedPolicyVersion,
  } as const;
  const flagValue = input.flagValue ?? process.env[CLINIC_PUBLISH_FLAG];
  if (flagValue !== '1') {
    return { ...base, available: false, reason: 'flag-off' };
  }
  if (deployedPolicyVersion !== CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION) {
    return { ...base, available: false, reason: 'policy-version-mismatch' };
  }
  if (!input.requireDraft) {
    return { ...base, available: true, reason: 'available' };
  }
  if (!input.config) {
    return { ...base, available: false, reason: 'draft-required' };
  }
  if (
    input.config.meta.industryId !== 'clinic'
    || input.config.meta.industryClass !== 'medical'
  ) {
    return { ...base, available: false, reason: 'classification-mismatch' };
  }

  const result = screenMedicalSiteConfig(input.config);
  if (result.blockViolations.length > 0) {
    return { ...base, available: false, reason: 'copy-blocked' };
  }
  if (result.warnViolations.length > 0) {
    return { ...base, available: false, reason: 'review-required' };
  }
  return { ...base, available: true, reason: 'available' };
}
