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
    /**
     * `#\s*1` lived inside the leading `\b(?:…)\b` group and could therefore never fire: `\b` is a
     * boundary between a word and a non-word character, and `#` is a non-word character, so after a
     * space or at the start of a string there is no boundary to satisfy. Every real occurrence is
     * exactly that shape — "#1 Dental Emergency provider in Sacramento Region" reached a rendered
     * card title on the first outreach preview — so the token matched nothing it was written for.
     *
     * It is now its own alternative, anchored on the right (`1\b`, which keeps "#10" out) and
     * guarded on the left against the words that make a `#1` an ordinal rather than a rank.
     * "Suite #1" is an address and "Implant #1" is a tooth site; both were measured as false
     * positives of the unguarded token, and a block here deletes the practice's own sentence from
     * its own demo. The list is deliberately closed rather than clever: an ordinal use preceded by
     * a word not on it is still blocked, which is the safe direction for a sales demo, and the
     * manual approval path exists for exactly that case.
     */
    pattern:
      /\b(?:best|number\s+one|top[- ]rated|better than|most advanced)\b|(?<!\b(?:suite|ste|apt|apartment|unit|room|rm|bldg|building|floor|no|implant|tooth|teeth|molar|site|case|quadrant|photo|image|figure|fig|chapter|step|question|option|item)\.?[ \t]{0,2})#\s*1\b|\bleading\b(?:\s+\w+){0,3}\s+(?:clinics?|practices?|providers?|dentists?|doctors?|centers?|teams?|surgeons?|specialists?|periodontists?|endodontists?|orthodontists?|dermatologists?)\b|\bonly\s+(?:clinics?|practices?|providers?|dentists?|doctors?|centers?|teams?)\b(?:\s+\w+){0,6}?\s+(?:that\s+can|who\s+can|to\s+offer|offering)\b/iu,
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
