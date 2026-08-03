import { buildJsonLd } from '@/lib/seo/jsonld';
import type {
  BusinessInfo,
  ButtonElement,
  CanvasElement,
  DividerElement,
  FormElement,
  ImageElement,
  MapElement,
  MotionMedia,
  MotionScene,
  PublicContact,
  ScrollytellingAct,
  Section,
  ShapeElement,
  SiteConfig,
  SiteMeta,
  SitePage,
  SocialLinksElement,
  TextElement,
  VideoElement,
} from '@/lib/types/site';

export const MEDICAL_AD_POLICY_VERSION = 'us-medical-ad-2026-08-v1' as const;

export const MEDICAL_AD_AUTHORITY_SOURCES = Object.freeze({
  ftcHealthProducts:
    'https://www.ftc.gov/business-guidance/resources/health-products-compliance-guidance',
  ftcAdvertisingBasics:
    'https://www.ftc.gov/business-guidance/advertising-marketing/advertising-marketing-basics',
  ftcEndorsements:
    'https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews',
} as const);

export type MedicalAdSeverity = 'block' | 'warn';

export type MedicalCopyScope =
  | 'meta'
  | 'page'
  | 'section'
  | 'headline'
  | 'body'
  | 'cta'
  | 'form'
  | 'alt'
  | 'social'
  | 'faq'
  | 'proof'
  | 'qualification'
  | 'motion'
  | 'identity'
  | 'schema'
  | 'semantic-outline';

export type MedicalCopySourceKind =
  | 'site-config'
  | 'customer-identity'
  | 'derived-jsonld'
  | 'derived-semantic-outline';

export interface MedicalPublicCopy {
  path: string;
  text: string;
  scope: MedicalCopyScope;
  sourceKind: MedicalCopySourceKind;
}

export type MedicalStatuteRef =
  | 'FTC Act Sections 5 and 12'
  | 'FTC Health Products Compliance Guidance'
  | 'FTC Endorsement Guides'
  | 'US review required';

interface RegexMatcher {
  kind: 'regex';
  source: string;
}

interface StructuralMatcher {
  kind: 'structural';
  check: 'side-effect-disclosure';
}

export type MedicalAdMatcher = RegexMatcher | StructuralMatcher;

export interface MedicalAdRule {
  id: string;
  category:
    | 'superlative-absolute'
    | 'guarantee-safety'
    | 'instant-effect'
    | 'treatment-testimonial'
    | 'comparison'
    | 'disparagement'
    | 'patient-inducement'
    | 'unassessed-technology'
    | 'qualification-endorsement'
    | 'article-format'
    | 'side-effect-omission';
  severity: MedicalAdSeverity;
  enabled: boolean;
  usDisposition: 'valid' | 'modified' | 'inactive-review-required';
  statuteRefs: readonly MedicalStatuteRef[];
  matchers: readonly MedicalAdMatcher[];
  scopes?: readonly MedicalCopyScope[];
  safeReplacementHint: string;
  rationale: string;
}

/** US federal baseline only. State-specific rules remain inactive until counsel review. */
export const MEDICAL_AD_RULES = [
  {
    id: 'medical-superlative-absolute',
    category: 'superlative-absolute',
    severity: 'block',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Health Products Compliance Guidance'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:best|number\\s+one|top[- ]rated|leading|only\\s+(?:clinic|practice|provider)|1\\s+(?:clinic|practice|provider))\\b',
      },
    ],
    safeReplacementHint: 'Use verifiable services, provider details, and operating facts instead.',
    rationale: 'An objective superiority or exclusivity claim requires substantiation before publication.',
  },
  {
    id: 'medical-guarantee-safety',
    category: 'guarantee-safety',
    severity: 'block',
    enabled: true,
    usDisposition: 'valid',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Health Products Compliance Guidance'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:100\\s*%|guarante(?:e|ed|es)|cure(?:d|s)?|completely\\s+safe|absolutely\\s+safe|no\\s+side\\s+effects?|pain[- ]free|permanent\\s+results?)\\b',
      },
    ],
    safeReplacementHint: 'Describe the procedure without guaranteeing safety, efficacy, or outcome.',
    rationale: 'Absolute safety and outcome promises are likely to mislead without adequate substantiation.',
  },
  {
    id: 'medical-instant-effect',
    category: 'instant-effect',
    severity: 'block',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Health Products Compliance Guidance'],
    matchers: [
      {
        kind: 'regex',
        source: '(?:\\b(?:instant(?:ly)?|immediate(?:ly)?|in\\s+one\\s+visit)\\b.{0,40}\\b(?:results?|relief|recovery|cure|improvement)\\b|\\b(?:results?|relief|recovery|cure|improvement)\\b.{0,20}\\bin\\s+one\\s+visit\\b)',
      },
    ],
    safeReplacementHint: 'Describe timing as a sourced clinical fact, not a promised result.',
    rationale: 'An immediate-results claim is an objective health claim that requires reliable support.',
  },
  {
    id: 'medical-treatment-testimonial',
    category: 'treatment-testimonial',
    severity: 'warn',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Endorsement Guides', 'FTC Health Products Compliance Guidance'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:patient\\s+(?:testimonial|story)|before[- ]and[- ]after|my\\s+(?:treatment|procedure).{0,80}(?:cured|fixed|healed|recovered))\\b',
      },
    ],
    safeReplacementHint: 'Hold the testimonial until claims, typical results, and material connections are reviewed.',
    rationale: 'A testimonial cannot substantiate a health claim and may require clear typical-results and connection disclosures.',
  },
  {
    id: 'medical-comparison',
    category: 'comparison',
    severity: 'block',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:better|safer|faster|more\\s+effective)\\s+than\\b|\\bcompared\\s+(?:with|to)\\s+other\\s+(?:clinics|practices|providers)\\b',
      },
    ],
    safeReplacementHint: 'Use the practice\'s verifiable facts without an unsupported comparison.',
    rationale: 'Objective comparative claims must be truthful, non-misleading, and substantiated.',
  },
  {
    id: 'medical-disparagement',
    category: 'disparagement',
    severity: 'block',
    enabled: false,
    usDisposition: 'inactive-review-required',
    statuteRefs: ['US review required'],
    matchers: [],
    safeReplacementHint: 'US review required.',
    rationale: 'The former rule encoded a Korea-specific categorical prohibition. Applicable state law requires counsel review.',
  },
  {
    id: 'medical-patient-inducement',
    category: 'patient-inducement',
    severity: 'block',
    enabled: false,
    usDisposition: 'inactive-review-required',
    statuteRefs: ['US review required'],
    matchers: [],
    safeReplacementHint: 'US review required.',
    rationale: 'Fee and patient-inducement restrictions vary by state and cannot be inferred from the former Korean rule.',
  },
  {
    id: 'medical-unassessed-technology',
    category: 'unassessed-technology',
    severity: 'block',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Health Products Compliance Guidance'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:miracle|breakthrough|clinically\\s+proven|scientifically\\s+proven)\\b.{0,40}\\b(?:treatment|procedure|technology|results?)\\b',
      },
    ],
    safeReplacementHint: 'Use the precise technology name and publish only claims supported by competent and reliable evidence.',
    rationale: 'Objective health-benefit and evidence-level claims require adequate substantiation.',
  },
  {
    id: 'medical-qualification-endorsement',
    category: 'qualification-endorsement',
    severity: 'warn',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Endorsement Guides'],
    matchers: [
      {
        kind: 'regex',
        source: '\\b(?:board[- ]certified|certified\\s+specialist|award[- ]winning|accredited|fellowship[- ]trained|expert[- ]recommended)\\b',
      },
    ],
    safeReplacementHint: 'Publish the exact credential only after its source and any material connection are verified.',
    rationale: 'Credentials and expert endorsements must be accurate and appropriately supported.',
  },
  {
    id: 'medical-article-format',
    category: 'article-format',
    severity: 'block',
    enabled: false,
    usDisposition: 'inactive-review-required',
    statuteRefs: ['US review required'],
    matchers: [],
    safeReplacementHint: 'US review required.',
    rationale: 'Native-advertising analysis is context dependent; the former Korea-specific format ban is not reused.',
  },
  {
    id: 'medical-side-effect-disclosure',
    category: 'side-effect-omission',
    severity: 'warn',
    enabled: true,
    usDisposition: 'modified',
    statuteRefs: ['FTC Act Sections 5 and 12', 'FTC Health Products Compliance Guidance'],
    matchers: [{ kind: 'structural', check: 'side-effect-disclosure' }],
    safeReplacementHint: 'Hold the claim until material risks, limitations, and qualifications are reviewed.',
    rationale: 'A material safety omission can make an otherwise literal claim misleading.',
  },
] as const satisfies readonly MedicalAdRule[];

export interface MedicalAdViolation {
  ruleId: string;
  category: MedicalAdRule['category'];
  severity: MedicalAdSeverity;
  matchedText: string;
  statuteRefs: readonly MedicalStatuteRef[];
  safeReplacementHint: string;
  rationale: string;
}

export interface MedicalSiteAdViolation extends MedicalAdViolation {
  path: string;
  scope: MedicalCopyScope;
  sourceKind: MedicalCopySourceKind;
}

export interface MedicalAdScreenResult {
  policyVersion: typeof MEDICAL_AD_POLICY_VERSION;
  violations: readonly MedicalAdViolation[];
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/gu;
const PUNCTUATION = /[^\p{L}\p{N}%+]+/gu;

/**
 * 매처용 정규화. 전체 공백 제거는 하지 않는다. 구두점은 단일 공백으로 바꾸고,
 * 규칙별 정규식만 필요한 음절 사이의 선택적 공백을 허용한다.
 */
export function normalizeMedicalCopy(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(ZERO_WIDTH, '')
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function ruleAppliesToScope(rule: MedicalAdRule, scope: MedicalCopyScope): boolean {
  return !rule.scopes || rule.scopes.includes(scope);
}

export function screenMedicalCopy(
  text: string,
  context: { scope?: MedicalCopyScope } = {},
): MedicalAdScreenResult {
  const normalized = normalizeMedicalCopy(text);
  if (!normalized) return { policyVersion: MEDICAL_AD_POLICY_VERSION, violations: [] };
  const scope = context.scope ?? 'body';
  const violations: MedicalAdViolation[] = [];

  for (const rule of MEDICAL_AD_RULES) {
    if (!rule.enabled) continue;
    if (!ruleAppliesToScope(rule, scope)) continue;
    let matchedText = '';
    for (const matcher of rule.matchers) {
      if (matcher.kind !== 'regex') continue;
      const match = new RegExp(matcher.source, 'iu').exec(normalized);
      if (match) {
        matchedText = match[0];
        break;
      }
    }
    if (!matchedText) continue;
    violations.push({
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      matchedText,
      statuteRefs: rule.statuteRefs,
      safeReplacementHint: rule.safeReplacementHint,
      rationale: rule.rationale,
    });
  }

  return { policyVersion: MEDICAL_AD_POLICY_VERSION, violations };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled public-copy variant: ${JSON.stringify(value)}`);
}

function addCopy(
  copies: MedicalPublicCopy[],
  path: string,
  value: string | undefined,
  scope: MedicalCopyScope,
  sourceKind: MedicalCopySourceKind = 'site-config',
): void {
  const text = value?.trim();
  if (!text) return;
  copies.push({ path, text, scope, sourceKind });
}

function collectMediaCopy(copies: MedicalPublicCopy[], path: string, media: MotionMedia): void {
  addCopy(copies, `${path}.alt`, media.alt, 'alt');
  addCopy(copies, `${path}.caption`, media.caption, 'motion');
}

function elementTextScope(section: Section, element: TextElement): MedicalCopyScope {
  if (section.type === 'faq' || section.id.includes('faq')) return 'faq';
  if (
    section.type === 'testimonials'
    || section.type === 'cases'
    || section.id.includes('testimonial')
    || section.id.includes('proof')
  ) {
    return 'proof';
  }
  if (section.type === 'team' || section.id.includes('qualification')) return 'qualification';
  return element.style.fontFamily === 'heading' ? 'headline' : 'body';
}

function collectElementCopy(
  copies: MedicalPublicCopy[],
  path: string,
  section: Section,
  element: CanvasElement,
): void {
  switch (element.kind) {
    case 'text':
      addCopy(copies, `${path}.text`, element.text, elementTextScope(section, element));
      return;
    case 'image':
      addCopy(copies, `${path}.alt`, element.alt, 'alt');
      return;
    case 'button':
      addCopy(copies, `${path}.label`, element.label, 'cta');
      return;
    case 'form':
      addCopy(copies, `${path}.submitLabel`, element.submitLabel, 'form');
      return;
    case 'socialLinks':
      element.links.forEach((link, index) => {
        addCopy(copies, `${path}.links[${index}].label`, link.label, 'social');
      });
      return;
    case 'shape':
    case 'divider':
    case 'video':
    case 'map':
      return;
    default:
      return assertNever(element);
  }
}

function collectMotionSceneCopy(
  copies: MedicalPublicCopy[],
  path: string,
  scene: MotionScene,
): void {
  switch (scene.signatureId) {
    case 'cinematic-scrub':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      addCopy(copies, `${path}.body`, scene.body, 'motion');
      collectMediaCopy(copies, `${path}.media`, scene.media);
      return;
    case 'scrollytelling-manifesto':
      collectMediaCopy(copies, `${path}.media`, scene.media);
      scene.acts.forEach((act, index) => {
        addCopy(copies, `${path}.acts[${index}].heading`, act.heading, 'motion');
        addCopy(copies, `${path}.acts[${index}].body`, act.body, 'motion');
      });
      return;
    case 'sticky-chapters':
      scene.chapters.forEach((chapter, index) => {
        addCopy(copies, `${path}.chapters[${index}].heading`, chapter.heading, 'motion');
        addCopy(copies, `${path}.chapters[${index}].body`, chapter.body, 'motion');
        if (chapter.media) collectMediaCopy(copies, `${path}.chapters[${index}].media`, chapter.media);
      });
      return;
    case 'true-card-stack':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      scene.cards.forEach((card, index) => {
        addCopy(copies, `${path}.cards[${index}].heading`, card.heading, 'motion');
        addCopy(copies, `${path}.cards[${index}].body`, card.body, 'motion');
        addCopy(copies, `${path}.cards[${index}].caption`, card.caption, 'motion');
        if (card.media) collectMediaCopy(copies, `${path}.cards[${index}].media`, card.media);
      });
      return;
    case 'portal-zoom':
    case 'scroll-curtain':
      scene.scenes.forEach((item, index) => {
        addCopy(copies, `${path}.scenes[${index}].heading`, item.heading, 'motion');
        addCopy(copies, `${path}.scenes[${index}].body`, item.body, 'motion');
        if (item.media) collectMediaCopy(copies, `${path}.scenes[${index}].media`, item.media);
      });
      return;
    case 'mosaic-reveal':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      scene.images.forEach((image, index) => {
        collectMediaCopy(copies, `${path}.images[${index}]`, image);
      });
      return;
    case 'path-journey':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      scene.milestones.forEach((milestone, index) => {
        addCopy(copies, `${path}.milestones[${index}].heading`, milestone.heading, 'motion');
        addCopy(copies, `${path}.milestones[${index}].body`, milestone.body, 'motion');
        addCopy(copies, `${path}.milestones[${index}].caption`, milestone.caption, 'motion');
      });
      return;
    case 'before-after-scrub':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      collectMediaCopy(copies, `${path}.before`, scene.before);
      collectMediaCopy(copies, `${path}.after`, scene.after);
      return;
    case 'horizontal-story':
      addCopy(copies, `${path}.heading`, scene.heading, 'motion');
      scene.panels.forEach((panel, index) => {
        addCopy(copies, `${path}.panels[${index}].heading`, panel.heading, 'motion');
        addCopy(copies, `${path}.panels[${index}].body`, panel.body, 'motion');
        if (panel.media) collectMediaCopy(copies, `${path}.panels[${index}].media`, panel.media);
      });
      return;
    default:
      return assertNever(scene);
  }
}

function collectIdentityCopy(copies: MedicalPublicCopy[], config: SiteConfig): void {
  const info = config.businessInfo;
  if (info) {
    addCopy(copies, 'businessInfo.businessName', info.businessName, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.ownerName', info.ownerName, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.businessNumber', info.businessNumber, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.address', info.address, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.phone', info.phone, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.email', info.email, 'identity', 'customer-identity');
    addCopy(copies, 'businessInfo.mailOrderNumber', info.mailOrderNumber, 'identity', 'customer-identity');
  }
  const contact = config.publicContact;
  if (contact) {
    addCopy(copies, 'publicContact.phone', contact.phone, 'identity', 'customer-identity');
    addCopy(copies, 'publicContact.address', contact.address, 'identity', 'customer-identity');
  }
}

function collectSemanticOutlineCopy(copies: MedicalPublicCopy[], config: SiteConfig): void {
  config.pages.forEach((page, pageIndex) => {
    const pagePath = `semanticOutline.pages[${pageIndex}]`;
    const title = page.slug === ''
      ? config.businessInfo?.businessName?.trim()
        || config.meta.title
        || config.businessInfo?.ownerName
        || 'Website'
      : page.title;
    addCopy(copies, `${pagePath}.h1`, title, 'semantic-outline', 'derived-semantic-outline');
    if (page.slug === '') {
      addCopy(
        copies,
        `${pagePath}.description`,
        config.meta.description,
        'semantic-outline',
        'derived-semantic-outline',
      );
    }
    page.sections.forEach((section, sectionIndex) => {
      if (section.hidden) return;
      const sectionPath = `${pagePath}.sections[${sectionIndex}]`;
      addCopy(
        copies,
        `${sectionPath}.h2`,
        section.name,
        'semantic-outline',
        'derived-semantic-outline',
      );
      section.acts?.forEach((act, actIndex) => {
        addCopy(
          copies,
          `${sectionPath}.acts[${actIndex}].heading`,
          act.heading,
          'semantic-outline',
          'derived-semantic-outline',
        );
        addCopy(
          copies,
          `${sectionPath}.acts[${actIndex}].body`,
          act.body,
          'semantic-outline',
          'derived-semantic-outline',
        );
      });
      section.elements.forEach((element, elementIndex) => {
        if (element.kind === 'text') {
          addCopy(
            copies,
            `${sectionPath}.elements[${elementIndex}].text`,
            element.text,
            'semantic-outline',
            'derived-semantic-outline',
          );
        } else if (
          element.kind === 'button'
          && /^https:\/\//iu.test(element.href)
          && /^\ucd9c\ucc98\s*·/u.test(element.label)
        ) {
          addCopy(
            copies,
            `${sectionPath}.elements[${elementIndex}].sourceLabel`,
            element.label,
            'semantic-outline',
            'derived-semantic-outline',
          );
        }
      });
    });
  });
}

function collectJsonLdStrings(
  copies: MedicalPublicCopy[],
  value: unknown,
  path: string,
): void {
  if (typeof value === 'string') {
    addCopy(copies, path, value, 'schema', 'derived-jsonld');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonLdStrings(copies, item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    collectJsonLdStrings(copies, item, `${path}.${key}`);
  }
}

/**
 * 발행·tenant·정적 export가 내보낼 수 있는 의료 사이트 문구의 단일 수집기.
 * JSON-LD와 SemanticOutline 파생 출력도 같은 원천에서 명시적으로 수집한다.
 */
export function collectMedicalPublicCopy(config: SiteConfig): readonly MedicalPublicCopy[] {
  const copies: MedicalPublicCopy[] = [];
  addCopy(copies, 'meta.title', config.meta.title, 'meta');
  addCopy(copies, 'meta.description', config.meta.description, 'meta');
  addCopy(copies, 'meta.region', config.meta.region, 'meta');

  config.pages.forEach((page, pageIndex) => {
    const pagePath = `pages[${pageIndex}]`;
    addCopy(copies, `${pagePath}.title`, page.title, 'page');
    addCopy(copies, `${pagePath}.navLabel`, page.navLabel, 'page');
    page.sections.forEach((section, sectionIndex) => {
      const sectionPath = `${pagePath}.sections[${sectionIndex}]`;
      addCopy(copies, `${sectionPath}.name`, section.name, 'section');
      section.acts?.forEach((act, actIndex) => {
        addCopy(copies, `${sectionPath}.acts[${actIndex}].heading`, act.heading, 'headline');
        addCopy(copies, `${sectionPath}.acts[${actIndex}].body`, act.body, 'body');
      });
      section.elements.forEach((element, elementIndex) => {
        collectElementCopy(copies, `${sectionPath}.elements[${elementIndex}]`, section, element);
      });
    });
  });

  config.motion?.signatures?.forEach((scene, index) => {
    collectMotionSceneCopy(copies, `motion.signatures[${index}]`, scene);
  });
  collectIdentityCopy(copies, config);
  collectSemanticOutlineCopy(copies, config);
  config.pages.forEach((page) => {
    const pageSlug = page.slug;
    const nodes = buildJsonLd(config, 'https://medical-copy.invalid', pageSlug);
    collectJsonLdStrings(copies, nodes, `jsonLd[${JSON.stringify(pageSlug)}]`);
  });
  return copies;
}

type FieldDisposition = 'collect' | 'derive' | 'ignore';
type FieldCoverage<T> = { readonly [K in keyof T]-?: FieldDisposition };

function defineFieldCoverage<T>() {
  return <C extends FieldCoverage<T>>(coverage: C): C => coverage;
}

type Scene<ID extends MotionScene['signatureId']> = Extract<MotionScene, { signatureId: ID }>;
type ArrayMember<T> = T extends readonly (infer Member)[] ? Member : never;

/**
 * 타입수준 수집 계약. 이 타입들에 키가 추가되면 해당 표가 완전하지 않아 tsc가 실패한다.
 * `collect`/`derive`로 표시한 문자열은 위 수집기에 대응하며 나머지는 공개 카피가 아님을 명시한다.
 */
export const MEDICAL_COPY_FIELD_COVERAGE = {
  siteConfig: defineFieldCoverage<SiteConfig>()({
    version: 'ignore',
    theme: 'ignore',
    designDna: 'ignore',
    namedTemplate: 'ignore',
    clinicMaster: 'ignore',
    siteCinematic: 'ignore',
    meta: 'collect',
    pages: 'collect',
    assetRefs: 'ignore',
    assetUsages: 'ignore',
    directions: 'ignore',
    businessInfo: 'collect',
    publicContact: 'collect',
    connectors: 'ignore',
    searchVerification: 'ignore',
    nav: 'ignore',
    motion: 'collect',
  }),
  siteMeta: defineFieldCoverage<SiteMeta>()({
    title: 'collect',
    description: 'collect',
    ogImage: 'ignore',
    locale: 'ignore',
    market: 'ignore',
    jurisdiction: 'ignore',
    purposeId: 'ignore',
    templateId: 'ignore',
    industryClass: 'ignore',
    industryId: 'ignore',
    medicalAdPolicyVersion: 'ignore',
    imageDirectionId: 'ignore',
    region: 'collect',
    sourceScanId: 'ignore',
  }),
  sitePage: defineFieldCoverage<SitePage>()({
    id: 'ignore',
    title: 'collect',
    description: 'collect',
    slug: 'ignore',
    sections: 'collect',
    showInNav: 'ignore',
    navLabel: 'collect',
  }),
  section: defineFieldCoverage<Section>()({
    id: 'ignore',
    type: 'ignore',
    name: 'collect',
    height: 'ignore',
    background: 'ignore',
    elements: 'collect',
    layout: 'ignore',
    acts: 'collect',
    heroLayout: 'ignore',
    sectionLayout: 'ignore',
    surfaceTone: 'ignore',
    proceduralBackground: 'ignore',
    hidden: 'ignore',
  }),
  act: defineFieldCoverage<ScrollytellingAct>()({
    heading: 'collect',
    body: 'collect',
    kind: 'ignore',
    band: 'ignore',
  }),
  text: defineFieldCoverage<TextElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    text: 'collect',
    style: 'ignore',
  }),
  image: defineFieldCoverage<ImageElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    src: 'ignore',
    alt: 'collect',
    style: 'ignore',
  }),
  button: defineFieldCoverage<ButtonElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    label: 'collect',
    href: 'ignore',
    style: 'ignore',
  }),
  shape: defineFieldCoverage<ShapeElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    assetFallback: 'ignore',
    shape: 'ignore',
    style: 'ignore',
  }),
  divider: defineFieldCoverage<DividerElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    style: 'ignore',
  }),
  video: defineFieldCoverage<VideoElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    src: 'ignore',
    poster: 'ignore',
    style: 'ignore',
  }),
  form: defineFieldCoverage<FormElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    formType: 'ignore',
    fields: 'ignore',
    submitLabel: 'collect',
    style: 'ignore',
  }),
  map: defineFieldCoverage<MapElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    embedUrl: 'ignore',
    style: 'ignore',
  }),
  socialLinks: defineFieldCoverage<SocialLinksElement>()({
    id: 'ignore',
    kind: 'ignore',
    frame: 'ignore',
    z: 'ignore',
    rotation: 'ignore',
    opacity: 'ignore',
    locked: 'ignore',
    hiddenOnMobile: 'ignore',
    entrance: 'ignore',
    links: 'collect',
    style: 'ignore',
  }),
  businessInfo: defineFieldCoverage<BusinessInfo>()({
    isPersonal: 'ignore',
    businessName: 'collect',
    ownerName: 'collect',
    businessNumber: 'collect',
    address: 'collect',
    phone: 'collect',
    email: 'collect',
    mailOrderNumber: 'collect',
  }),
  publicContact: defineFieldCoverage<PublicContact>()({
    version: 'ignore',
    phone: 'collect',
    address: 'collect',
  }),
  motionMedia: defineFieldCoverage<MotionMedia>()({
    id: 'ignore',
    kind: 'ignore',
    src: 'ignore',
    poster: 'ignore',
    alt: 'collect',
    caption: 'collect',
    width: 'ignore',
    height: 'ignore',
    focalPoint: 'ignore',
    compactFocalPoint: 'ignore',
    mobileFocalPoint: 'ignore',
    responsivePromotion: 'ignore',
    provenance: 'ignore',
    assetId: 'ignore',
  }),
  cinematicScrub: defineFieldCoverage<Scene<'cinematic-scrub'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    body: 'collect',
    media: 'collect',
  }),
  manifesto: defineFieldCoverage<Scene<'scrollytelling-manifesto'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    media: 'collect',
    acts: 'collect',
  }),
  manifestoAct: defineFieldCoverage<ArrayMember<Scene<'scrollytelling-manifesto'>['acts']>>()({
    id: 'ignore',
    heading: 'collect',
    body: 'collect',
    kind: 'ignore',
    band: 'ignore',
  }),
  stickyChapters: defineFieldCoverage<Scene<'sticky-chapters'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    chapters: 'collect',
  }),
  stickyChapter: defineFieldCoverage<ArrayMember<Scene<'sticky-chapters'>['chapters']>>()({
    id: 'ignore',
    sourceSectionId: 'ignore',
    heading: 'collect',
    body: 'collect',
    media: 'collect',
  }),
  trueCardStack: defineFieldCoverage<Scene<'true-card-stack'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    cards: 'collect',
  }),
  trueCard: defineFieldCoverage<ArrayMember<Scene<'true-card-stack'>['cards']>>()({
    id: 'ignore',
    heading: 'collect',
    body: 'collect',
    caption: 'collect',
    media: 'collect',
  }),
  portalZoom: defineFieldCoverage<Scene<'portal-zoom'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    scenes: 'collect',
  }),
  scrollCurtain: defineFieldCoverage<Scene<'scroll-curtain'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    scenes: 'collect',
  }),
  sceneItem: defineFieldCoverage<ArrayMember<Scene<'portal-zoom'>['scenes']>>()({
    id: 'ignore',
    sourceSectionId: 'ignore',
    heading: 'collect',
    body: 'collect',
    media: 'collect',
  }),
  mosaicReveal: defineFieldCoverage<Scene<'mosaic-reveal'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    images: 'collect',
  }),
  pathJourney: defineFieldCoverage<Scene<'path-journey'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    milestones: 'collect',
  }),
  pathMilestone: defineFieldCoverage<ArrayMember<Scene<'path-journey'>['milestones']>>()({
    id: 'ignore',
    heading: 'collect',
    body: 'collect',
    caption: 'collect',
  }),
  beforeAfter: defineFieldCoverage<Scene<'before-after-scrub'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    caseId: 'ignore',
    before: 'collect',
    after: 'collect',
    sameCaseAttested: 'ignore',
    publicationRightsAttested: 'ignore',
  }),
  horizontalStory: defineFieldCoverage<Scene<'horizontal-story'>>()({
    signatureId: 'ignore',
    pageId: 'ignore',
    sectionId: 'ignore',
    heading: 'collect',
    panels: 'collect',
  }),
  horizontalPanel: defineFieldCoverage<ArrayMember<Scene<'horizontal-story'>['panels']>>()({
    id: 'ignore',
    sourceSectionId: 'ignore',
    heading: 'collect',
    body: 'collect',
    media: 'collect',
  }),
} as const;
