import type {
  AssetFallbackIntent,
  SiteAssetPolicyViolation,
} from '@/lib/assets/assignment';
import type {
  AssetTruthPolicyDenialReason,
  AssetTruthPolicyMode,
} from '@/lib/assets/truth-policy';

export interface PublishAssetPolicyIssue {
  reason: AssetTruthPolicyDenialReason;
  slotKey: string;
  fallbackIntent: AssetFallbackIntent;
  message: string;
}

/**
 * Stable, actionable copy shared by preflight and publish responses.
 * Messages intentionally disclose neither asset identity nor another tenant's
 * record existence.
 */
export const ASSET_POLICY_USER_MESSAGES = {
  MISSING_ASSET_RECORD:
    '사진의 등록 정보를 확인할 수 없습니다. 이 사이트에 직접 업로드한 사진으로 다시 선택해 주세요.',
  LEGACY_ORIGIN_NOT_FACTUAL:
    '출처를 확인할 수 없는 사진이 실제 정보 영역에 있습니다. 직접 업로드한 사진으로 교체해 주세요.',
  AI_NOT_ALLOWED_IN_FACTUAL_SLOT:
    'AI 이미지는 실제 제품·공간·인물·사례 사진으로 사용할 수 없습니다. 직접 업로드한 실제 사진으로 교체해 주세요.',
  IMPORT_NOT_VERIFIED_FOR_FACTUAL_SLOT:
    '외부에서 가져온 이미지는 실제 사업 사진으로 자동 확인되지 않습니다. 이 사이트에 직접 업로드해 주세요.',
  MISSING_GENERAL_ATTESTATION:
    '사진의 사실성·공개 권한 확인이 필요합니다. 사진 확인 단계를 다시 완료해 주세요.',
  PERSON_CLASSIFICATION_MISMATCH:
    '인물 사진 분류가 확인되지 않았습니다. 사진의 인물 포함 여부를 다시 확인해 주세요.',
  MISSING_PERSON_CONSENT:
    '인물 사진의 공개 동의가 확인되지 않았습니다. 해당 사진의 공개 동의를 완료해 주세요.',
  BEFORE_AFTER_DISABLED:
    '전후 비교 기능은 현재 사용할 수 없습니다. 일반 사진 구성으로 변경해 주세요.',
  BEFORE_AFTER_INDUSTRY_BLOCKED:
    '이 업종에서는 전후 비교 연출을 제공하지 않습니다. 일반 사진 구성으로 변경해 주세요.',
  BEFORE_AFTER_EVIDENCE_INVALID:
    '전후 사진의 동일 사례·소유권·공개 권한을 확인할 수 없습니다. 검증된 실제 사례 사진을 다시 선택해 주세요.',
  ASSET_OWNER_MISMATCH:
    '사진의 등록 정보를 확인할 수 없습니다. 이 사이트에 직접 업로드한 사진으로 다시 선택해 주세요.',
  ASSET_SITE_MISMATCH:
    '사진의 등록 정보를 확인할 수 없습니다. 이 사이트에 직접 업로드한 사진으로 다시 선택해 주세요.',
  SLOT_POLICY_MISMATCH:
    '사진의 용도와 표시 위치가 맞지 않습니다. 해당 영역에 맞는 사진을 다시 선택해 주세요.',
} as const satisfies Record<AssetTruthPolicyDenialReason, string>;

/** Strip internal asset IDs before a violation reaches an API response. */
export function publishAssetPolicyIssues(
  violations: readonly SiteAssetPolicyViolation[],
): PublishAssetPolicyIssue[] {
  return violations.map(({ reason, slotKey, fallbackIntent }) => ({
    reason,
    slotKey,
    fallbackIntent,
    message: ASSET_POLICY_USER_MESSAGES[reason],
  }));
}

export function assetPolicyBlockedMessage(
  issues: readonly PublishAssetPolicyIssue[],
): string {
  if (issues.length === 0) {
    return '사진 사용 권한과 출처를 확인하지 못했습니다. 사진을 다시 확인해 주세요.';
  }
  if (issues.length === 1) return issues[0].message;
  return `${issues[0].message} 그 밖에 수정할 사진이 ${issues.length - 1}개 더 있습니다.`;
}

export function shouldBlockAssetPolicy(
  mode: AssetTruthPolicyMode,
  issues: readonly PublishAssetPolicyIssue[],
): boolean {
  return mode === 'enforce' && issues.length > 0;
}

/** PII-safe audit log: no URL, asset ID, consent text, owner, or tenant ID. */
export function logAssetPolicyIssues(
  phase: 'publish' | 'preflight',
  mode: string,
  issues: readonly PublishAssetPolicyIssue[],
): void {
  for (const issue of issues) {
    console.warn('[asset-policy-audit]', {
      phase,
      mode,
      reason: issue.reason,
      slotKey: issue.slotKey,
      fallbackIntent: issue.fallbackIntent,
    });
  }
}

export function safeAuditErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
