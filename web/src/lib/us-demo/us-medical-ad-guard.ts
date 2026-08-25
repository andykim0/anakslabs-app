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
      /\b(?:100\s*%|guarante(?:e|ed|es)|completely safe|absolutely safe|no side effects?)\b|(?<!\b(?:no|not|cannot|never|without)\s(?:a\s|any\s)?)\bcure(?:d|s)?\b/iu,
    rationale: 'Absolute outcome and safety guarantees are not reproduced in a demo.',
  },
  {
    category: 'unsupported-outcome',
    severity: 'review',
    pattern:
      /\b(?:success rate|clinically proven|proven results?|guaranteed results?|effective for)\b|\b\d+(?:\.\d+)?\s*%/iu,
    rationale: 'Outcome and success-rate claims require source and context review.',
  },
  {
    category: 'comparative-superiority',
    severity: 'block',
    pattern:
      /\b(?:best|#\s*1|number\s+one|top[- ]rated|better than|most advanced)\b|\bleading\b(?:\s+\w+){0,3}\s+(?:clinics?|practices?|providers?|dentists?|doctors?|centers?|teams?|surgeons?|specialists?|periodontists?|endodontists?|orthodontists?|dermatologists?)\b|\bonly\s+(?:clinics?|practices?|providers?|dentists?|doctors?|centers?|teams?)\b(?:\s+\w+){0,6}?\s+(?:that\s+can|who\s+can|to\s+offer|offering)\b/iu,
    rationale: 'Comparative superiority and superlative claims are not reproduced in a demo.',
  },
  {
    category: 'unverified-credential',
    severity: 'block',
    pattern:
      /\b(?:award[- ]winning|harvard(?:[- ]trained| university| medical school)?)\b/iu,
    rationale: 'Credentials, accreditation, and education claims require separate verification.',
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
