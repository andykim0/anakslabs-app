import type {
  UsMedicalAdReviewCategory,
  UsMedicalAdViolation,
} from './contracts';

interface UsMedicalAdRule {
  category: UsMedicalAdReviewCategory;
  severity: 'block' | 'review';
  pattern: RegExp;
  rationale: string;
}

/**
 * US outreach demos reproduce public source copy; they do not run the Korea-only MEDLAW policy.
 * This narrow registry only prevents high-risk source claims from entering a sales demo until
 * Andy verifies or excludes them. It never rewrites customer/prospect copy.
 */
export const US_MEDICAL_DEMO_AD_RULES = Object.freeze([
  {
    category: 'absolute-outcome',
    severity: 'block',
    pattern:
      /\b(?:100\s*%|guarante(?:e|ed|es)|cure(?:d|s)?|completely safe|absolutely safe|no side effects?)\b/iu,
    rationale: '절대적 치료 결과·안전 보장은 데모에 재현하지 않습니다.',
  },
  {
    category: 'unsupported-outcome',
    severity: 'review',
    pattern:
      /\b(?:success rate|clinically proven|proven results?|guaranteed results?|effective for)\b|\b\d+(?:\.\d+)?\s*%/iu,
    rationale: '효능·성공률 수치는 원문 출처와 맥락을 Andy가 확인해야 합니다.',
  },
  {
    category: 'comparative-superiority',
    severity: 'block',
    pattern:
      /\b(?:best|#\s*1|number\s+one|top[- ]rated|leading|better than|most advanced|only clinic)\b/iu,
    rationale: '비교우위·최상급 주장은 데모에 재현하지 않습니다.',
  },
  {
    category: 'unverified-credential',
    severity: 'review',
    pattern:
      /\b(?:board[- ]certified|certified specialist|award[- ]winning|accredited|fellowship[- ]trained)\b/iu,
    rationale: '자격·인증 표기는 공개 원문 외 별도 검증이 필요합니다.',
  },
] as const satisfies readonly UsMedicalAdRule[]);

export function screenUsMedicalDemoCopy(text: string): {
  violations: readonly UsMedicalAdViolation[];
  ok: boolean;
} {
  const normalized = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/gu, '');
  const violations = US_MEDICAL_DEMO_AD_RULES.flatMap((rule) => {
    const match = rule.pattern.exec(normalized);
    return match
      ? [{
          category: rule.category,
          severity: rule.severity,
          matchedText: match[0],
          rationale: rule.rationale,
        }]
      : [];
  });
  return {
    violations,
    ok: violations.length === 0,
  };
}
