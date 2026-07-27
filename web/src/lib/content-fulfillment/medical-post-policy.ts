import {
  MEDICAL_AD_POLICY_VERSION,
  MEDICAL_AD_RULES,
  normalizeMedicalCopy,
  screenMedicalCopy,
  type MedicalAdSeverity,
  type MedicalCopyScope,
  type MedicalStatuteRef,
} from '@/lib/content/medical-ad-policy';
import { clinicAvailability } from '@/lib/industry/clinic-availability';
import type { SiteConfig } from '@/lib/types/site';
import type { GeneratedContentPost } from './honesty';

export interface MedicalPostPublicCopy {
  path: string;
  text: string;
  scope: MedicalCopyScope;
}

export interface MedicalPostViolation {
  path: string;
  severity: MedicalAdSeverity;
  ruleId: string;
  matchedText: string;
  statuteRefs: readonly MedicalStatuteRef[];
  safeReplacementHint: string;
}

export interface MedicalPostPolicyResult {
  medical: boolean;
  policyVersion: typeof MEDICAL_AD_POLICY_VERSION;
  clinicAvailable: boolean;
  clinicAvailabilityReason: ReturnType<typeof clinicAvailability>['reason'] | 'not-clinic';
  violations: readonly MedicalPostViolation[];
  blockViolations: readonly MedicalPostViolation[];
  warnViolations: readonly MedicalPostViolation[];
  ok: boolean;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled content post block: ${JSON.stringify(value)}`);
}

/** 포스트 공개 표면의 모든 문자열을 한 번만 수집하는 단일 경계. */
export function collectMedicalPostPublicCopy(
  post: GeneratedContentPost,
): MedicalPostPublicCopy[] {
  const copies: MedicalPostPublicCopy[] = [
    { path: 'title', text: post.title, scope: 'headline' },
    { path: 'summary', text: post.summary, scope: 'body' },
    ...post.tags.map((text, index) => ({ path: `tags.${index}`, text, scope: 'meta' as const })),
  ];
  post.document.blocks.forEach((block, blockIndex) => {
    const base = `document.blocks.${blockIndex}`;
    switch (block.type) {
      case 'heading':
        copies.push({ path: `${base}.text`, text: block.text, scope: 'headline' });
        return;
      case 'paragraph':
        copies.push({ path: `${base}.text`, text: block.text, scope: 'body' });
        return;
      case 'list':
        block.items.forEach((item, itemIndex) => {
          copies.push({
            path: `${base}.items.${itemIndex}`,
            text: typeof item === 'string' ? item : item.text,
            scope: 'body',
          });
        });
        return;
      case 'table':
        if (block.caption) {
          copies.push({ path: `${base}.caption`, text: block.caption, scope: 'body' });
        }
        block.columns.forEach((column, columnIndex) => {
          copies.push({
            path: `${base}.columns.${columnIndex}.header`,
            text: column.header,
            scope: 'body',
          });
        });
        block.rows.forEach((row, rowIndex) => {
          row.cells.forEach((cell, cellIndex) => {
            copies.push({
              path: `${base}.rows.${rowIndex}.cells.${cellIndex}`,
              text: cell.text,
              scope: 'body',
            });
          });
        });
        return;
      default:
        return assertNever(block);
    }
  });
  return copies;
}

function sideEffectDisclosureViolation(
  copies: readonly MedicalPostPublicCopy[],
): MedicalPostViolation | null {
  const joined = normalizeMedicalCopy(copies.map((copy) => copy.text).join(' '));
  const mentionsTreatment = /(?:치료|시술|수술|처치|주사|레이저)/u.test(joined);
  const claimsEffect = /(?:효과|개선|회복|완화|결과)/u.test(joined);
  const includesRisk = /(?:부작용|위험|주의사항|주의할 점|개인차)/u.test(joined);
  if (!mentionsTreatment || !claimsEffect || includesRisk) return null;
  const rule = MEDICAL_AD_RULES.find((candidate) =>
    candidate.id === 'medical-side-effect-disclosure');
  if (!rule) return null;
  return {
    path: '$structural.sideEffectDisclosure',
    severity: rule.severity,
    ruleId: rule.id,
    matchedText: '치료·시술 효과 설명에 주의사항 안내 없음',
    statuteRefs: rule.statuteRefs,
    safeReplacementHint: rule.safeReplacementHint,
  };
}

/**
 * pending_approval·발행·tenant·export가 같은 검사기를 사용한다. 저장된 정책 버전은
 * 감사값일 뿐이며 현재 config와 현재 정책을 매 호출마다 다시 검사한다.
 */
export function screenMedicalContentPost(input: {
  post: GeneratedContentPost;
  config: SiteConfig;
  clinicFlagValue?: string;
}): MedicalPostPolicyResult {
  const medical = input.config.meta.industryClass === 'medical'
    || input.config.meta.industryId === 'clinic';
  if (!medical) {
    return {
      medical: false,
      policyVersion: MEDICAL_AD_POLICY_VERSION,
      clinicAvailable: true,
      clinicAvailabilityReason: 'not-clinic',
      violations: [],
      blockViolations: [],
      warnViolations: [],
      ok: true,
    };
  }

  const availability = clinicAvailability({
    requireDraft: true,
    config: input.config,
    ...(input.clinicFlagValue !== undefined ? { flagValue: input.clinicFlagValue } : {}),
  });
  const violations: MedicalPostViolation[] = [];
  for (const copy of collectMedicalPostPublicCopy(input.post)) {
    for (const violation of screenMedicalCopy(copy.text, { scope: copy.scope }).violations) {
      violations.push({
        path: copy.path,
        severity: violation.severity,
        ruleId: violation.ruleId,
        matchedText: violation.matchedText,
        statuteRefs: violation.statuteRefs,
        safeReplacementHint: violation.safeReplacementHint,
      });
    }
  }
  const structural = sideEffectDisclosureViolation(collectMedicalPostPublicCopy(input.post));
  if (structural) violations.push(structural);
  const blockViolations = violations.filter((violation) => violation.severity === 'block');
  const warnViolations = violations.filter((violation) => violation.severity === 'warn');
  return {
    medical: true,
    policyVersion: MEDICAL_AD_POLICY_VERSION,
    clinicAvailable: availability.available,
    clinicAvailabilityReason: availability.reason,
    violations,
    blockViolations,
    warnViolations,
    ok: availability.available && violations.length === 0,
  };
}
