import type { SurveyInput } from '@/lib/types/domain';
import type {
  MedicalCopyScope,
  MedicalSiteAdAdvisory,
  MedicalSiteAdViolation,
} from './medical-ad-policy';
import {
  collectMedicalPublicCopy,
  MEDICAL_AD_POLICY_VERSION,
  MEDICAL_AD_RULES,
  normalizeMedicalCopy,
  screenMedicalCopy,
} from './medical-ad-policy';
import type { SiteConfig } from '@/lib/types/site';

export const MEDICAL_AD_COPY_BLOCKED = 'MEDICAL_AD_COPY_BLOCKED' as const;
export const MEDICAL_CLASSIFICATION_MISMATCH = 'MEDICAL_CLASSIFICATION_MISMATCH' as const;

export interface MedicalCustomerCopy {
  path: string;
  text: string;
  scope: MedicalCopyScope;
}

export interface MedicalClassificationViolation {
  kind: 'classification';
  code: typeof MEDICAL_CLASSIFICATION_MISMATCH;
  severity: 'block';
  path: 'meta.industryClass';
  message: string;
  safeReplacementHint: string;
}

export interface MedicalCopyPolicyViolation extends MedicalSiteAdViolation {
  kind: 'copy';
}

export type MedicalSitePolicyViolation =
  | MedicalClassificationViolation
  | MedicalCopyPolicyViolation;

export interface MedicalSitePolicyResult {
  policyVersion: typeof MEDICAL_AD_POLICY_VERSION;
  medical: boolean;
  classificationMismatch: boolean;
  violations: readonly MedicalSitePolicyViolation[];
  blockViolations: readonly MedicalSitePolicyViolation[];
  warnViolations: readonly MedicalCopyPolicyViolation[];
  /**
   * Matched advisory rules. Never part of `violations`, so `ok` ignores them and no publish,
   * delivery, or sanitization path can gate on one. Carried so a reviewer can still see them.
   */
  advisories: readonly MedicalSiteAdAdvisory[];
  ok: boolean;
}

export interface MedicalCustomerPolicyViolation {
  path: string;
  scope: MedicalCopyScope;
  ruleId: string;
  category: MedicalSiteAdViolation['category'];
  severity: MedicalSiteAdViolation['severity'];
  matchedText: string;
  statuteRefs: MedicalSiteAdViolation['statuteRefs'];
  safeReplacementHint: string;
  rationale: string;
}

/**
 * WHICH CONFIGS THIS REGISTRY SCREENS — human care AND animal care.
 *
 * `MEDICAL_AD_RULES` is written about the SHAPE OF A CLAIM, not about human anatomy. Read them:
 * "guarantee", "100%", "completely safe", "pain-free", "cure", "#1 clinic", "instant results",
 * a treatment testimonial, a treatment-effect sentence with no material-risk statement. Every one
 * of those is exactly as unsubstantiated on "we cure your dog's arthritis" as on the human
 * sentence, and the statutes cited — FTC Act §§5 and 12, the FTC Health Products Compliance
 * Guidance — are general advertising law that does not stop at the species line.
 *
 * So veterinary is screened here rather than given a pass while a veterinary-specific policy is
 * written. The alternative was to leave `industryClass: 'veterinary'` outside this predicate,
 * which would have published animal health claims through no screen at all — the registry is the
 * only thing between a claim and the page. A veterinary-appropriate policy (AVMA advertising
 * guidance, state veterinary board rules) is a real slice with its own statute research, and
 * inventing it here would mean shipping rules nobody verified. Until it exists, veterinary is
 * over-restricted on purpose: a vet loses some copy, which is recoverable, instead of a claim
 * shipping unscreened, which is not.
 *
 * `MedicalSitePolicyResult.medical` therefore means "screened by this registry", not "human
 * medicine". It is true for a veterinary config.
 */
function isScreenedHealthConfig(config: SiteConfig): boolean {
  return config.meta.industryClass === 'medical'
    || config.meta.industryClass === 'veterinary'
    || config.meta.industryId === 'clinic';
}

function copyViolation(
  path: string,
  scope: MedicalCopyScope,
  sourceKind: MedicalSiteAdViolation['sourceKind'],
  violation: ReturnType<typeof screenMedicalCopy>['violations'][number],
): MedicalCopyPolicyViolation {
  return {
    kind: 'copy',
    path,
    scope,
    sourceKind,
    ...violation,
  };
}

function structuralSideEffectViolation(
  copies: readonly ReturnType<typeof collectMedicalPublicCopy>[number][],
): MedicalCopyPolicyViolation | null {
  const sourceCopies = copies.filter((copy) => copy.sourceKind === 'site-config');
  const joined = normalizeMedicalCopy(sourceCopies.map((copy) => copy.text).join(' '));
  const mentionsTreatment = /\b(?:treatment|procedure|surgery|injection|laser|therapy)\b/u.test(joined);
  const claimsEffect = /\b(?:effect|effective|improve|improvement|recover|recovery|relief|result)\b/u.test(joined);
  const includesRisk = /\b(?:side effect|risk|warning|limitation|individual results?|results? vary)\b/u.test(joined);
  if (!mentionsTreatment || !claimsEffect || includesRisk) return null;
  const rule = MEDICAL_AD_RULES.find((candidate) => candidate.id === 'medical-side-effect-disclosure');
  if (!rule) return null;
  return {
    kind: 'copy',
    path: '$structural.sideEffectDisclosure',
    scope: 'body',
    sourceKind: 'site-config',
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    matchedText: 'Treatment-effect copy does not include a material risk or limitation statement.',
    statuteRefs: rule.statuteRefs,
    safeReplacementHint: rule.safeReplacementHint,
    rationale: rule.rationale,
  };
}

/**
 * 신규 생성·수정대행·발행·tenant·export가 공유하는 의료 공개 카피 검사.
 * 비의료 config는 수집조차 하지 않고 즉시 빈 결과를 돌려 기존 출력 바이트를 보존한다.
 */
export function screenMedicalSiteConfig(config: SiteConfig): MedicalSitePolicyResult {
  const medical = isScreenedHealthConfig(config);
  if (!medical) {
    return {
      policyVersion: MEDICAL_AD_POLICY_VERSION,
      medical: false,
      classificationMismatch: false,
      violations: [],
      blockViolations: [],
      warnViolations: [],
      advisories: [],
      ok: true,
    };
  }

  const classificationMismatch = (
    config.meta.industryId === 'clinic'
    && config.meta.industryClass !== 'medical'
  );
  const violations: MedicalSitePolicyViolation[] = [];
  if (classificationMismatch) {
    violations.push({
      kind: 'classification',
      code: MEDICAL_CLASSIFICATION_MISMATCH,
      severity: 'block',
      path: 'meta.industryClass',
      message: 'The clinic industry and medical classification do not match.',
      safeReplacementHint: 'Regenerate with the server-verified clinic classification.',
    });
  }

  const copies = collectMedicalPublicCopy(config);
  const advisories: MedicalSiteAdAdvisory[] = [];
  const seen = new Set<string>();
  for (const copy of copies) {
    const result = screenMedicalCopy(copy.text, { scope: copy.scope });
    for (const violation of result.violations) {
      // JSON-LD와 SemanticOutline은 같은 원문에서 파생되므로 동일 문구·규칙은 한 번만 보고한다.
      const key = `${violation.ruleId}\u0000${normalizeMedicalCopy(copy.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push(copyViolation(copy.path, copy.scope, copy.sourceKind, violation));
    }
    for (const advisory of result.advisories) {
      // 같은 dedup 규약: 파생 출력이 같은 문장을 다시 실어도 한 번만 보고한다.
      const key = `${advisory.ruleId}\u0000${normalizeMedicalCopy(copy.text)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      advisories.push({
        path: copy.path,
        scope: copy.scope,
        sourceKind: copy.sourceKind,
        ...advisory,
      });
    }
  }
  const structural = structuralSideEffectViolation(copies);
  if (structural) violations.push(structural);

  const blockViolations = violations.filter((violation) => violation.severity === 'block');
  const warnViolations = violations.filter(
    (violation): violation is MedicalCopyPolicyViolation => (
      violation.kind === 'copy' && violation.severity === 'warn'
    ),
  );
  // 사람 검토 상태가 생기기 전에는 warn도 공개 경계에서 fail-closed한다.
  return {
    policyVersion: MEDICAL_AD_POLICY_VERSION,
    medical,
    classificationMismatch,
    violations,
    blockViolations,
    warnViolations,
    advisories,
    ok: violations.length === 0,
  };
}

function pushCustomerCopy(
  copies: MedicalCustomerCopy[],
  path: string,
  text: string | undefined,
  scope: MedicalCopyScope,
): void {
  const value = text?.trim();
  if (value) copies.push({ path, text: value, scope });
}

/** 고객이 직접 쓴 공개 가능 문구만 모은다. URL·내부 provenance 상태는 검사 대상이 아니다. */
export function collectMedicalCustomerCopy(survey: SurveyInput): readonly MedicalCustomerCopy[] {
  const copies: MedicalCustomerCopy[] = [];
  pushCustomerCopy(copies, 'businessName', survey.businessName, 'identity');
  pushCustomerCopy(copies, 'tagline', survey.tagline, 'headline');
  pushCustomerCopy(copies, 'region', survey.region, 'meta');
  pushCustomerCopy(copies, 'providedContent', survey.providedContent, 'body');
  pushCustomerCopy(copies, 'extraNotes', survey.extraNotes, 'body');
  survey.highlights?.forEach((text, index) => (
    pushCustomerCopy(copies, `highlights[${index}]`, text, 'body')
  ));
  survey.directions?.forEach((direction, index) => (
    pushCustomerCopy(copies, `directions[${index}].note`, direction.note, 'body')
  ));
  survey.sectionPlan.forEach((section, index) => {
    pushCustomerCopy(copies, `sectionPlan[${index}].name`, section.name, 'section');
    pushCustomerCopy(copies, `sectionPlan[${index}].brief`, section.brief, 'body');
  });
  survey.pagePlan?.forEach((page, index) => {
    pushCustomerCopy(copies, `pagePlan[${index}].title`, page.title, 'page');
    pushCustomerCopy(copies, `pagePlan[${index}].navLabel`, page.navLabel, 'page');
  });
  survey.contentItems?.forEach((item, index) => {
    pushCustomerCopy(copies, `contentItems[${index}].name`, item.name, 'body');
    pushCustomerCopy(copies, `contentItems[${index}].description`, item.description, 'body');
  });
  const depth = survey.contentDepth;
  depth?.facts.forEach((fact, index) => (
    pushCustomerCopy(copies, `contentDepth.facts[${index}].value`, fact.value, 'body')
  ));
  depth?.faqAnswers.forEach((answer, index) => (
    pushCustomerCopy(copies, `contentDepth.faqAnswers[${index}].answer`, answer.answer, 'faq')
  ));
  const story = depth?.mainStorytelling;
  pushCustomerCopy(copies, 'contentDepth.mainStorytelling.brandStory', story?.brandStory, 'body');
  pushCustomerCopy(copies, 'contentDepth.mainStorytelling.origin', story?.origin, 'body');
  pushCustomerCopy(copies, 'contentDepth.mainStorytelling.philosophy', story?.philosophy, 'body');
  const brief = depth?.surveyBrief;
  pushCustomerCopy(copies, 'contentDepth.surveyBrief.targetCustomer', brief?.targetCustomer, 'body');
  pushCustomerCopy(copies, 'contentDepth.surveyBrief.visitorNeed', brief?.visitorNeed, 'body');
  pushCustomerCopy(copies, 'contentDepth.surveyBrief.valueProposition', brief?.valueProposition, 'body');
  brief?.proofs?.forEach((proof, index) => {
    const scope = proof.kind === 'qualification' ? 'qualification' : 'proof';
    pushCustomerCopy(copies, `contentDepth.surveyBrief.proofs[${index}].content`, proof.content, scope);
    pushCustomerCopy(copies, `contentDepth.surveyBrief.proofs[${index}].publisher`, proof.publisher, scope);
  });
  return copies;
}

export function screenMedicalCustomerCopy(
  survey: SurveyInput,
  additionalCopies: readonly MedicalCustomerCopy[] = [],
): readonly MedicalCustomerPolicyViolation[] {
  if (survey.industryClass !== 'medical') return [];
  const violations: MedicalCustomerPolicyViolation[] = [];
  for (const copy of [...collectMedicalCustomerCopy(survey), ...additionalCopies]) {
    for (const violation of screenMedicalCopy(copy.text, { scope: copy.scope }).violations) {
      violations.push({ path: copy.path, scope: copy.scope, ...violation });
    }
  }
  return violations;
}

const SAFE_COPY = {
  meta: 'Care information',
  page: 'Care information',
  section: 'Care information',
  headline: 'Clear information for your visit',
  body: 'Review the available services and how to prepare for your visit.',
  cta: 'View care information',
  form: 'Send message',
  alt: 'Practice information',
  social: 'View official channel',
  faq: 'Review the information you need before your visit.',
  proof: 'Verified practice information',
  qualification: 'Provider information',
  motion: 'Services and visit information',
  identity: 'Medical practice',
  schema: 'Care information',
  'semantic-outline': 'Care information',
} as const satisfies Record<MedicalCopyScope, string>;

function sanitizedString(value: string, scope: MedicalCopyScope): string {
  return screenMedicalCopy(value, { scope }).violations.length ? SAFE_COPY[scope] : value;
}

const VISIBLE_KEY_SCOPES: Readonly<Record<string, MedicalCopyScope>> = {
  title: 'page',
  description: 'body',
  navLabel: 'page',
  name: 'section',
  heading: 'headline',
  body: 'body',
  caption: 'motion',
  alt: 'alt',
  text: 'body',
  label: 'cta',
  submitLabel: 'form',
  content: 'proof',
} as const;

function sanitizeGeneratedValue(value: unknown, parentKey = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeGeneratedValue(item, parentKey));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && VISIBLE_KEY_SCOPES[key]) {
      output[key] = sanitizedString(item, VISIBLE_KEY_SCOPES[key]);
    } else {
      output[key] = sanitizeGeneratedValue(item, key);
    }
  }
  return output;
}

/**
 * 결정적 서버 컴파일 결과에만 쓰는 안전 카탈로그 폴백.
 * 고객 입력은 먼저 screenMedicalCustomerCopy에서 422로 거부하므로 이 함수가 고객 문구를
 * 조용히 바꾸는 경로는 존재하지 않는다.
 */
export function enforceGeneratedMedicalConfig(config: SiteConfig): {
  config: SiteConfig;
  result: MedicalSitePolicyResult;
  usedFallback: boolean;
} {
  const first = screenMedicalSiteConfig(config);
  if (!first.medical || first.ok) {
    return {
      config: first.medical
        ? {
            ...config,
            meta: { ...config.meta, medicalAdPolicyVersion: MEDICAL_AD_POLICY_VERSION },
          }
        : config,
      result: first,
      usedFallback: false,
    };
  }
  if (first.classificationMismatch) return { config, result: first, usedFallback: false };

  const sanitized = sanitizeGeneratedValue(config) as SiteConfig;
  const withRiskDisclosure = first.warnViolations.some(
    (violation) => violation.ruleId === 'medical-side-effect-disclosure',
  )
    ? {
        ...sanitized,
        meta: {
          ...sanitized.meta,
          description: 'Review available services, visit information, material risks, and individual limitations before care.',
        },
      }
    : sanitized;
  const tagged: SiteConfig = {
    ...withRiskDisclosure,
    meta: { ...withRiskDisclosure.meta, medicalAdPolicyVersion: MEDICAL_AD_POLICY_VERSION },
  };
  return {
    config: tagged,
    result: screenMedicalSiteConfig(tagged),
    usedFallback: true,
  };
}

export async function generateMedicalSafeCopy(input: {
  industryClass: SiteConfig['meta']['industryClass'];
  prompt: string;
  scope: MedicalCopyScope;
  generate: (prompt: string) => Promise<string>;
}): Promise<{ text: string; resolution: 'original' | 'constrained-retry' | 'catalog-fallback' }> {
  const first = await input.generate(input.prompt);
  if (input.industryClass !== 'medical') return { text: first, resolution: 'original' };
  const firstScreen = screenMedicalCopy(first, { scope: input.scope });
  if (!firstScreen.violations.length) return { text: first, resolution: 'original' };

  const retryPrompt = [
    input.prompt,
    '',
    'Medical advertising constraints:',
    '- Do not promise or compare outcomes, safety, rank, pricing, or testimonials.',
    '- Use only verified services and visit information in neutral language.',
    '- Return only the final copy.',
  ].join('\n');
  const retried = await input.generate(retryPrompt);
  if (!screenMedicalCopy(retried, { scope: input.scope }).violations.length) {
    return { text: retried, resolution: 'constrained-retry' };
  }
  return { text: SAFE_COPY[input.scope], resolution: 'catalog-fallback' };
}

export function medicalPolicyErrorDetails(result: MedicalSitePolicyResult): {
  policyVersion: typeof MEDICAL_AD_POLICY_VERSION;
  violations: {
    path: string;
    severity: 'block' | 'warn';
    ruleId: string;
    safeReplacementHint: string;
  }[];
} {
  return {
    policyVersion: result.policyVersion,
    violations: result.violations.map((violation) => (
      violation.kind === 'classification'
        ? {
            path: violation.path,
            severity: violation.severity,
            ruleId: violation.code,
            safeReplacementHint: violation.safeReplacementHint,
          }
        : {
            path: violation.path,
            severity: violation.severity,
            ruleId: violation.ruleId,
            safeReplacementHint: violation.safeReplacementHint,
          }
    )),
  };
}

export class MedicalAdPublicBoundaryError extends Error {
  readonly code = MEDICAL_AD_COPY_BLOCKED;

  constructor(readonly result: MedicalSitePolicyResult) {
    super('Medical site public copy failed the current advertising policy.');
    this.name = 'MedicalAdPublicBoundaryError';
  }
}

export function assertMedicalPublicConfig(config: SiteConfig): void {
  const result = screenMedicalSiteConfig(config);
  if (!result.ok) throw new MedicalAdPublicBoundaryError(result);
}
