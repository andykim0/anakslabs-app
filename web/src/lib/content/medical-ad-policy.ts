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

export const MEDICAL_AD_POLICY_VERSION = 'medical-ad-2026-07-v1' as const;

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
  | '의료법 제56조 제2항 제1호'
  | '의료법 제56조 제2항 제2호'
  | '의료법 제56조 제2항 제3호'
  | '의료법 제56조 제2항 제4호'
  | '의료법 제56조 제2항 제5호'
  | '의료법 제56조 제2항 제7호'
  | '의료법 제56조 제2항 제8호'
  | '의료법 제56조 제2항 제9호'
  | '의료법 제56조 제2항 제10호'
  | '의료법 제56조 제2항 제13호'
  | '의료법 제56조 제2항 제14호'
  | '의료법 제27조 제3항'
  | '의료광고 자율심의기준 금지표현 예시';

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
  statuteRefs: readonly MedicalStatuteRef[];
  matchers: readonly MedicalAdMatcher[];
  scopes?: readonly MedicalCopyScope[];
  safeReplacementHint: string;
  rationale: string;
}

/**
 * 의료광고 카피 정책의 단일 소스.
 *
 * 현행 의료법 제56조 제3항은 광고 방법에 관한 조항이므로 이 콘텐츠 레지스트리의 근거로
 * 사용하지 않는다. 최상급·보장·즉효 표현에는 전용 호를 만들어 붙이지 않고, 제2항 제8호
 * (객관적 사실 과장)·제3호(거짓)·제2호(치료경험담 오인)와 자율심의 금지표현 예시를 함께
 * 기록한다.
 */
export const MEDICAL_AD_RULES = [
  {
    id: 'medical-superlative-absolute',
    category: 'superlative-absolute',
    severity: 'block',
    statuteRefs: [
      '의료법 제56조 제2항 제8호',
      '의료법 제56조 제2항 제3호',
      '의료법 제56조 제2항 제2호',
      '의료광고 자율심의기준 금지표현 예시',
    ],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:최\\s*고|최\\s*상|제\\s*일|유\\s*일|무\\s*이|최\\s*초|국\\s*내\\s*유\\s*일|1\\s*위|1\\s*등|no\\s*1|넘\\s*버\\s*원|베\\s*스\\s*트|top(?:\\s*1)?)',
      },
    ],
    safeReplacementHint: '검증 가능한 진료 범위·의료진 정보·운영 원칙을 사실대로 적어 주세요.',
    rationale:
      '객관적으로 입증하기 어려운 최상급·절대 순위는 거짓 또는 객관적 사실 과장과 치료결과 오인을 만들 수 있다.',
  },
  {
    id: 'medical-guarantee-safety',
    category: 'guarantee-safety',
    severity: 'block',
    statuteRefs: [
      '의료법 제56조 제2항 제8호',
      '의료법 제56조 제2항 제3호',
      '의료법 제56조 제2항 제2호',
      '의료법 제56조 제2항 제7호',
      '의료광고 자율심의기준 금지표현 예시',
    ],
    matchers: [
      { kind: 'regex', source: '100\\s*%' },
      { kind: 'regex', source: '완\\s*치' },
      {
        kind: 'regex',
        source:
          '(?:완\\s*벽|무\\s*조\\s*건|확\\s*실(?:한|히)?)(?:\\s+[가-힣a-z0-9%]+){0,2}\\s*(?:효\\s*과|치\\s*료|개\\s*선|회\\s*복|결\\s*과|시\\s*술)',
      },
      {
        kind: 'regex',
        source:
          '(?:부\\s*작\\s*용\\s*(?:이\\s*)?(?:없|없는|없이)|무\\s*통|통\\s*증\\s*(?:이\\s*)?(?:없|없는|없이)|영\\s*구(?:적|히)?|재\\s*발\\s*(?:이\\s*)?(?:없|없는|없이)|절\\s*대\\s*안\\s*전)',
      },
    ],
    safeReplacementHint: '효과를 단정하지 말고 진료 과정·개인차·주의사항을 함께 설명해 주세요.',
    rationale:
      '완치·안전·효과를 절대적으로 보장하는 표현은 거짓·과장과 중요 부작용 누락 위험이 있다.',
  },
  {
    id: 'medical-instant-effect',
    category: 'instant-effect',
    severity: 'block',
    statuteRefs: [
      '의료법 제56조 제2항 제8호',
      '의료법 제56조 제2항 제3호',
      '의료법 제56조 제2항 제2호',
      '의료광고 자율심의기준 금지표현 예시',
    ],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:즉\\s*시|단\\s*번\\s*에)\\s*(?:효\\s*과|개\\s*선|회\\s*복|치\\s*료|완\\s*화)|바\\s*로\\s*(?:효\\s*과|낫|개\\s*선|회\\s*복))',
      },
    ],
    safeReplacementHint: '효과가 나타나는 시점을 단정하지 말고 치료 과정과 개인차를 안내해 주세요.',
    rationale:
      '즉효를 단정하면 객관적 사실을 과장하거나 치료 결과를 오인하게 할 수 있다.',
  },
  {
    id: 'medical-treatment-testimonial',
    category: 'treatment-testimonial',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제2호'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:치\\s*료|시\\s*술|진\\s*료|수\\s*술|환\\s*자)\\s*(?:후\\s*기|체\\s*험\\s*담|경\\s*험\\s*담|스\\s*토\\s*리)|(?:완\\s*치|치\\s*료)\\s*(?:체\\s*험\\s*담|경\\s*험\\s*담))',
      },
      {
        kind: 'regex',
        source:
          '(?:제\\s*가|환\\s*자\\s*가).{0,60}?(?:치\\s*료|시\\s*술).{0,60}?(?:좋\\s*아|나\\s*아|회\\s*복)',
      },
    ],
    safeReplacementHint: '환자 경험 대신 진료 절차와 확인 가능한 공식 정보를 설명해 주세요.',
    rationale: '환자의 치료 경험담은 치료 효과를 일반화해 소비자를 현혹할 수 있다.',
  },
  {
    id: 'medical-comparison',
    category: 'comparison',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제4호'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:타|다\\s*른)\\s*(?:병\\s*원|의\\s*원|클\\s*리\\s*닉|치\\s*과)(?:\\s+[가-힣a-z0-9%]+){0,8}\\s*보\\s*다|(?:대\\s*비|비\\s*교\\s*해)(?:\\s+[가-힣a-z0-9%]+){0,8}\\s*(?:우\\s*수|뛰\\s*어))',
      },
    ],
    safeReplacementHint: '다른 의료기관과 비교하지 말고 이곳의 확인 가능한 진료 정보를 적어 주세요.',
    rationale: '다른 의료기관의 진료 방법·기능과 비교하는 광고는 금지된다.',
  },
  {
    id: 'medical-disparagement',
    category: 'disparagement',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제5호'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:다\\s*른|타)\\s*(?:병\\s*원|의\\s*원|클\\s*리\\s*닉|치\\s*과)(?:은|는|이|가)?(?:\\s+[가-힣a-z0-9%]+){0,8}?\\s*(?:위\\s*험|부\\s*실|문\\s*제)|(?:저\\s*렴\\s*한|싼)\\s*(?:곳|병\\s*원|의\\s*원)(?:은|는|이|가)?(?:\\s+[가-힣a-z0-9%]+){0,8}?\\s*(?:위\\s*험|부\\s*실))',
      },
    ],
    safeReplacementHint: '타 기관을 평가하지 말고 자체 진료 원칙만 사실대로 안내해 주세요.',
    rationale: '다른 의료기관이나 의료인의 기능·진료 방법을 비방하는 광고는 금지된다.',
  },
  {
    id: 'medical-patient-inducement',
    category: 'patient-inducement',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제13호', '의료법 제27조 제3항'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:무\\s*료(?!\\s*(?:주\\s*차|와\\s*이\\s*파\\s*이))|할\\s*인|특\\s*가|1\\s*\\+\\s*1|사\\s*은\\s*품|페\\s*이\\s*백|선\\s*착\\s*순)(?:\\s+[가-힣a-z0-9%]+){0,3}?\\s*(?:시\\s*술|치\\s*료|진\\s*료|수\\s*술|검\\s*사|비\\s*급\\s*여|진\\s*료\\s*비|치\\s*료\\s*비|수\\s*술\\s*비)|(?:시\\s*술|치\\s*료|진\\s*료|수\\s*술|검\\s*사|비\\s*급\\s*여|진\\s*료\\s*비|치\\s*료\\s*비|수\\s*술\\s*비)(?:\\s+[가-힣a-z0-9%]+){0,3}?\\s*(?:무\\s*료|할\\s*인|특\\s*가|1\\s*\\+\\s*1|사\\s*은\\s*품|페\\s*이\\s*백|선\\s*착\\s*순))',
      },
    ],
    safeReplacementHint: '가격 유인 문구를 빼고 진료비와 적용 조건을 사실대로 안내해 주세요.',
    rationale:
      '비급여 진료비 할인·면제를 오인시키거나 금품·향응 등으로 환자를 유인하는 표현을 막는다.',
  },
  {
    id: 'medical-unassessed-technology',
    category: 'unassessed-technology',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제1호', '의료법 제56조 제2항 제8호'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:(?:미\\s*검\\s*증|검\\s*증\\s*되\\s*지\\s*않\\s*은)\\s*신\\s*의\\s*료\\s*기\\s*술|(?:기\\s*적|획\\s*기\\s*적)(?:의)?\\s*(?:치\\s*료|효\\s*과|시\\s*술))',
      },
    ],
    safeReplacementHint: '평가·허가 상태와 객관적 근거가 확인된 기술만 정확한 명칭으로 적어 주세요.',
    rationale: '평가받지 않은 신의료기술과 객관적 근거 없는 효능·효과 광고를 차단한다.',
  },
  {
    id: 'medical-qualification-endorsement',
    category: 'qualification-endorsement',
    severity: 'warn',
    statuteRefs: [
      '의료법 제56조 제2항 제9호',
      '의료법 제56조 제2항 제14호',
    ],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:세\\s*계\\s*적\\s*명\\s*의|대\\s*한\\s*민\\s*국\\s*대\\s*표\\s*명\\s*의|공\\s*식\\s*인\\s*증\\s*전\\s*문\\s*의|국\\s*가\\s*인\\s*증\\s*병\\s*원|추\\s*천\\s*병\\s*원|수\\s*상\\s*병\\s*원|보\\s*증\\s*된\\s*의\\s*료\\s*진)',
      },
    ],
    safeReplacementHint: '법적 근거와 게시 가능한 증빙이 있는 자격·인증만 정확한 명칭으로 적어 주세요.',
    rationale:
      '법적 근거 없는 자격·명칭과 법정 예외가 확인되지 않은 인증·보증·추천 표시는 검토가 필요하다.',
  },
  {
    id: 'medical-article-format',
    category: 'article-format',
    severity: 'block',
    statuteRefs: ['의료법 제56조 제2항 제10호'],
    matchers: [
      {
        kind: 'regex',
        source:
          '(?:전\\s*문\\s*가\\s*가\\s*추\\s*천\\s*하\\s*는|언\\s*론\\s*이\\s*주\\s*목\\s*한|기\\s*사\\s*로\\s*보\\s*는|뉴\\s*스\\s*에\\s*서\\s*소\\s*개\\s*한)',
      },
    ],
    safeReplacementHint: '기사나 전문가 의견처럼 보이는 형식 대신 의료기관이 직접 제공하는 정보로 적어 주세요.',
    rationale: '기사 또는 전문가 의견 형태로 표현되는 의료광고는 금지된다.',
  },
  {
    id: 'medical-side-effect-disclosure',
    category: 'side-effect-omission',
    severity: 'warn',
    statuteRefs: ['의료법 제56조 제2항 제7호'],
    matchers: [{ kind: 'structural', check: 'side-effect-disclosure' }],
    safeReplacementHint: '치료 효과를 설명하는 구간에 부작용·위험·주의사항 안내를 함께 추가해 주세요.',
    rationale: '치료 효과와 함께 중요한 부작용 등 정보를 누락하면 소비자의 판단을 흐릴 수 있다.',
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
    .toLocaleLowerCase('ko-KR')
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
        || '사이트'
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
          && /^출처\s*·/u.test(element.label)
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
