import type { CSSProperties } from 'react';
import type { SiteThemeTokens } from '@/lib/types/site';
import { tokenRemToPx } from '@/lib/design/site-theme-tokens';

/**
 * Readable hierarchy is a product contract, not a collection of component guesses.
 * Marketing uses the largest possible body size as the conservative denominator.
 * Generated sites apply the section-title floor only in flow/stack playback; the
 * persisted DESIGN_WIDTH canvas remains byte-for-byte faithful to authored geometry.
 */
export const DABOIM_TYPOGRAPHY_HIERARCHY = {
  marketing: {
    bodyMinPx: 16,
    bodyMaxPx: 18,
    typeStepPx: 2,
    sectionTitleMinPx: 36,
    sectionTitleMinRatioToBody: 1.5,
    cardAndTableTitleMinPx: 22,
    cardAndTableTitleMinStepsAboveBody: 2,
  },
  generatedSite: {
    bodyMaxPx: 18,
    flowSectionTitleMinPx: 30,
    sectionTitleMinRatioToBody: 1.5,
    fixedCanvasPolicy: 'preserve-stored',
  },
} as const;

const toRem = (px: number): string => `${px / 16}rem`;

function assertTypographyHierarchyContract(): void {
  const marketing = DABOIM_TYPOGRAPHY_HIERARCHY.marketing;
  const generated = DABOIM_TYPOGRAPHY_HIERARCHY.generatedSite;
  if (marketing.sectionTitleMinPx / marketing.bodyMaxPx < marketing.sectionTitleMinRatioToBody) {
    throw new Error('Marketing section-title hierarchy must be at least 1.5x body.');
  }
  if (
    (marketing.cardAndTableTitleMinPx - marketing.bodyMaxPx) / marketing.typeStepPx
    < marketing.cardAndTableTitleMinStepsAboveBody
  ) {
    throw new Error('Marketing card/table titles must remain at least two type steps above body.');
  }
  if (generated.flowSectionTitleMinPx / generated.bodyMaxPx < generated.sectionTitleMinRatioToBody) {
    throw new Error('Generated flow section-title hierarchy must be at least 1.5x body.');
  }
}

assertTypographyHierarchyContract();

/**
 * LP$ typography source of truth.
 *
 * Marketing roles are fluid CSS values. Generated-site roles are numeric because the
 * DESIGN_WIDTH canvas persists typography inside SiteConfig documents. The same roles
 * also provide a conservative render-time uplift for paragraph-like legacy text, which
 * is the explicitly approved existing-publish visual change in LP$ L3.
 */
export const DABOIM_TYPOGRAPHY = {
  marketing: {
    hero: { fontSize: 'clamp(2.75rem, 7vw, 5.25rem)', lineHeight: 1.01 },
    pageTitle: { fontSize: 'clamp(2.25rem, 5vw, 3.25rem)', lineHeight: 1.12 },
    sectionTitle: {
      fontSize: `clamp(${toRem(DABOIM_TYPOGRAPHY_HIERARCHY.marketing.sectionTitleMinPx)}, 6vw, 3.5rem)`,
      lineHeight: 1.16,
    },
    cardTitle: {
      fontSize: `clamp(${toRem(DABOIM_TYPOGRAPHY_HIERARCHY.marketing.cardAndTableTitleMinPx)}, 1.8vw, 1.625rem)`,
      lineHeight: 1.3,
    },
    tableTitle: {
      fontSize: `clamp(${toRem(DABOIM_TYPOGRAPHY_HIERARCHY.marketing.cardAndTableTitleMinPx)}, 1.8vw, 1.625rem)`,
      lineHeight: 1.3,
    },
    body: {
      fontSize: `clamp(${toRem(DABOIM_TYPOGRAPHY_HIERARCHY.marketing.bodyMinPx)}, calc(.96rem + .25vw), ${toRem(DABOIM_TYPOGRAPHY_HIERARCHY.marketing.bodyMaxPx)})`,
      lineHeight: 1.75,
    },
    support: { fontSize: 'clamp(.8125rem, .95vw, .875rem)', lineHeight: 1.6 },
    eyebrow: { fontSize: '.8125rem', lineHeight: 1.4 },
    control: { fontSize: '1rem', lineHeight: 1.5 },
  },
  generatedSite: {
    sectionTitle: {
      fontSize: DABOIM_TYPOGRAPHY_HIERARCHY.generatedSite.flowSectionTitleMinPx,
      lineHeight: 1.35,
    },
    heroBody: { fontSize: 18, lineHeight: 1.8 },
    sectionIntro: { fontSize: 18, lineHeight: 1.8 },
    longBody: { fontSize: 18, lineHeight: 1.9 },
    body: { fontSize: 17, lineHeight: 1.8 },
    cardBody: { fontSize: 16, lineHeight: 1.75 },
    support: { fontSize: 14, lineHeight: 1.6 },
  },
} as const;

export type MarketingTypographyRole = keyof typeof DABOIM_TYPOGRAPHY.marketing;
export type GeneratedTypographyRole = keyof typeof DABOIM_TYPOGRAPHY.generatedSite;

export type TextFlowKind = 'heading' | 'body';

/**
 * Korean line-breaking contract shared by the production renderer and editor mirror.
 * `anywhere` is only the emergency fallback for an unbroken URL/Latin token; ordinary
 * Korean still wraps between words because `keep-all` remains authoritative.
 */
export const DABOIM_TEXT_FLOW = {
  heading: {
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
    textWrap: 'balance',
  },
  body: {
    wordBreak: 'keep-all',
    overflowWrap: 'anywhere',
    textWrap: 'pretty',
  },
} as const satisfies Record<
  TextFlowKind,
  Pick<CSSProperties, 'wordBreak' | 'overflowWrap' | 'textWrap'>
>;

export function textFlowFor(fontFamily?: 'heading' | 'body'): Pick<
  CSSProperties,
  'wordBreak' | 'overflowWrap' | 'textWrap'
> {
  return { ...DABOIM_TEXT_FLOW[fontFamily === 'heading' ? 'heading' : 'body'] };
}

export interface GeneratedTextRoleRule {
  fragments: readonly string[];
  role: GeneratedTypographyRole;
  lines: number;
}

/**
 * Semantic roles for text emitted by the deterministic site builder.
 *
 * Element ids are already the stable builder vocabulary. Keeping this mapping beside
 * the scale makes generation and every renderer resolve the exact same role instead of
 * guessing again from the stored number. Unknown/editor-created ids remain fail-safe.
 */
export const GENERATED_TEXT_ROLE_RULES: readonly GeneratedTextRoleRule[] = [
  { fragments: ['hero-sub'], role: 'heroBody', lines: 2 },
  { fragments: ['subtitle'], role: 'sectionIntro', lines: 2 },
  { fragments: ['cta-sub'], role: 'sectionIntro', lines: 1 },
  { fragments: ['about-body'], role: 'longBody', lines: 4 },
  { fragments: ['greet-body'], role: 'longBody', lines: 3 },
  { fragments: ['feat-desc'], role: 'cardBody', lines: 3 },
  {
    fragments: ['menu-desc', 'price-desc', 'team-career', 'case-desc', 'faq-a', 'teaser-desc'],
    role: 'cardBody',
    lines: 2,
  },
  { fragments: ['proj-col-body'], role: 'cardBody', lines: 3 },
  {
    fragments: ['about-point', 'contact-value', 'map-value', 'mini-line'],
    role: 'body',
    lines: 1,
  },
  { fragments: ['form-desc', 'custom-body'], role: 'body', lines: 2 },
  {
    fragments: [
      'kicker',
      'greet-sign',
      'resume-period',
      'menu-meta',
      'work-cap',
      'tm-attr',
      'contact-label',
      'map-label',
      'map-hint',
      'team-title',
      'proj-col-label',
      'case-title',
      'contact-footer',
    ],
    role: 'support',
    lines: 1,
  },
  { fragments: ['hero-chip-label'], role: 'support', lines: 2 },
] as const;

/**
 * Exact deterministic-builder vocabulary for real section headings. Numeric sequence
 * suffixes are stripped before comparison. This deliberately excludes hero-title and
 * card/body labels such as feat-title, team-title, case-title, and teaser-title.
 */
export const GENERATED_SECTION_TITLE_ID_BASES = [
  'el-title',
  'el-about-title',
  'el-greet-title',
  'el-links-title',
  'el-cta-title',
  'el-custom-title',
] as const;

export function isGeneratedSectionTitleId(elementId: string): boolean {
  const base = elementId.replace(/-\d+$/u, '');
  return GENERATED_SECTION_TITLE_ID_BASES.some((candidate) => candidate === base);
}

export function generatedStackFontFloor(elementId: string): number | undefined {
  return isGeneratedSectionTitleId(elementId)
    ? DABOIM_TYPOGRAPHY_HIERARCHY.generatedSite.flowSectionTitleMinPx
    : undefined;
}

export function generatedTextRoleFor(elementId: string): GeneratedTextRoleRule | undefined {
  return GENERATED_TEXT_ROLE_RULES.find((rule) =>
    rule.fragments.some((fragment) => elementId.includes(fragment)),
  );
}

export const MARKETING_TYPOGRAPHY_VARS = {
  '--mkt-type-hero-size': DABOIM_TYPOGRAPHY.marketing.hero.fontSize,
  '--mkt-type-hero-leading': DABOIM_TYPOGRAPHY.marketing.hero.lineHeight,
  '--mkt-type-page-title-size': DABOIM_TYPOGRAPHY.marketing.pageTitle.fontSize,
  '--mkt-type-page-title-leading': DABOIM_TYPOGRAPHY.marketing.pageTitle.lineHeight,
  '--mkt-type-section-title-size': DABOIM_TYPOGRAPHY.marketing.sectionTitle.fontSize,
  '--mkt-type-section-title-leading': DABOIM_TYPOGRAPHY.marketing.sectionTitle.lineHeight,
  '--mkt-type-card-title-size': DABOIM_TYPOGRAPHY.marketing.cardTitle.fontSize,
  '--mkt-type-card-title-leading': DABOIM_TYPOGRAPHY.marketing.cardTitle.lineHeight,
  '--mkt-type-table-title-size': DABOIM_TYPOGRAPHY.marketing.tableTitle.fontSize,
  '--mkt-type-table-title-leading': DABOIM_TYPOGRAPHY.marketing.tableTitle.lineHeight,
  '--mkt-type-body-size': DABOIM_TYPOGRAPHY.marketing.body.fontSize,
  '--mkt-type-body-leading': DABOIM_TYPOGRAPHY.marketing.body.lineHeight,
  '--mkt-type-support-size': DABOIM_TYPOGRAPHY.marketing.support.fontSize,
  '--mkt-type-support-leading': DABOIM_TYPOGRAPHY.marketing.support.lineHeight,
  '--mkt-type-eyebrow-size': DABOIM_TYPOGRAPHY.marketing.eyebrow.fontSize,
  '--mkt-type-eyebrow-leading': DABOIM_TYPOGRAPHY.marketing.eyebrow.lineHeight,
  '--mkt-type-control-size': DABOIM_TYPOGRAPHY.marketing.control.fontSize,
  '--mkt-type-control-leading': DABOIM_TYPOGRAPHY.marketing.control.lineHeight,
} as CSSProperties;

export function generatedType(role: GeneratedTypographyRole): {
  fontSize: number;
  lineHeight: number;
} {
  return { ...DABOIM_TYPOGRAPHY.generatedSite[role] };
}

export function minTextFrameHeight(
  role: GeneratedTypographyRole,
  lines: number,
  verticalPadding = 0,
): number {
  const type = DABOIM_TYPOGRAPHY.generatedSite[role];
  return Math.ceil(type.fontSize * type.lineHeight * Math.max(1, lines) + verticalPadding);
}

interface RenderedSiteTypographyInput {
  elementId: string;
  style: {
    fontSize: number;
    lineHeight?: number;
    fontFamily?: 'heading' | 'body';
    readabilityGuard?: 'long-hero';
  };
  variant: 'canvas' | 'stack';
  /** Persisted DESIGN_WIDTH frame height. Required for the fixed canvas safety gate. */
  frameHeight: number;
  /** DNA 경로에서만 주입. 미지정이면 기존 발행본 계산을 한 줄도 바꾸지 않는다. */
  tokens?: SiteThemeTokens['typography'];
}

function inferredLegacyRole(style: RenderedSiteTypographyInput['style']): GeneratedTypographyRole | undefined {
  if (style.fontFamily === 'heading' || style.fontSize > 18) return undefined;
  if (style.fontSize <= DABOIM_TYPOGRAPHY.generatedSite.support.fontSize) return 'support';
  if (style.lineHeight == null || style.lineHeight < 1.6) return undefined;
  if (style.lineHeight >= 1.85) return 'longBody';
  return 'body';
}

/**
 * Existing published SiteConfigs receive the LP$ readability uplift only when their
 * persisted fixed canvas frame can contain it. Mobile stack playback has no fixed text
 * height, so it can always consume the semantic token. This keeps the intended visual
 * uplift while making legacy overflow fail closed.
 */
function resolveLegacyRenderedSiteTypography({
  elementId,
  style,
  variant,
  frameHeight,
}: RenderedSiteTypographyInput): { fontSize: number; lineHeight: number } {
  const storedLineHeight = style.lineHeight ?? 1.45;
  const stored = { fontSize: style.fontSize, lineHeight: storedLineHeight };
  if (isGeneratedSectionTitleId(elementId)) {
    if (variant === 'canvas') return stored;
    const readable = DABOIM_TYPOGRAPHY.generatedSite.sectionTitle;
    return {
      fontSize: Math.max(stored.fontSize, readable.fontSize),
      lineHeight: Math.max(storedLineHeight, readable.lineHeight),
    };
  }
  if (style.fontFamily === 'heading') return stored;

  const rule = generatedTextRoleFor(elementId);
  const role = rule?.role ?? inferredLegacyRole(style);
  if (!role) return stored;

  const readable = DABOIM_TYPOGRAPHY.generatedSite[role];
  const candidate = {
    fontSize: Math.max(style.fontSize, readable.fontSize),
    lineHeight: Math.max(storedLineHeight, readable.lineHeight),
  };

  if (
    variant === 'stack' ||
    (candidate.fontSize === stored.fontSize && candidate.lineHeight === stored.lineHeight)
  ) {
    return candidate;
  }

  // An unknown/editor-created canvas id has no trustworthy line-count contract. It is
  // still uplifted in the flow-based mobile stack, but fixed-canvas playback fails closed.
  if (!rule) return stored;

  // If the new token cannot fit the role's authored line capacity, legacy canvas
  // playback keeps the stored values. Newly generated configs reserve this geometry.
  const requiredHeight = candidate.fontSize * candidate.lineHeight * rule.lines;
  return requiredHeight <= frameHeight + 0.01 ? candidate : stored;
}

type DnaTypographyRole = keyof SiteThemeTokens['typography']['size'];

function dnaTypographyRole(
  elementId: string,
  style: RenderedSiteTypographyInput['style'],
  frameHeight: number,
): { role: DnaTypographyRole; lines: number } {
  if (elementId.includes('hero-title')) {
    const storedLineHeight = style.lineHeight ?? 1.45;
    const authoredLines = style.readabilityGuard === 'long-hero'
      ? Math.max(3, Math.round(frameHeight / (style.fontSize * storedLineHeight)))
      : 2;
    return { role: 'display', lines: authoredLines };
  }
  if (isGeneratedSectionTitleId(elementId)) return { role: 'title', lines: 2 };
  const generatedRule = generatedTextRoleFor(elementId);
  if (generatedRule?.role === 'support') return { role: 'caption', lines: generatedRule.lines };
  if (generatedRule?.role === 'heroBody' || generatedRule?.role === 'sectionIntro') {
    return { role: 'lead', lines: generatedRule.lines };
  }
  if (style.fontFamily === 'heading') return { role: 'title', lines: 1 };
  return { role: 'body', lines: generatedRule?.lines ?? 1 };
}

/**
 * DNA는 별도 타이포 엔진을 만들지 않는다. 기존 semantic-role/readability/fixed-canvas
 * 안전 계산을 먼저 통과한 뒤, 선택된 modular ratio를 같은 결과에 제한적으로 적용한다.
 */
export function resolveRenderedSiteTypography(input: RenderedSiteTypographyInput): {
  fontSize: number;
  lineHeight: number;
} {
  const legacy = resolveLegacyRenderedSiteTypography(input);
  const tokens = input.tokens;
  if (!tokens) return legacy;

  const { role, lines } = dnaTypographyRole(input.elementId, input.style, input.frameHeight);
  const ratioFactor = tokens.ratio / 1.2;
  const tokenSize = tokenRemToPx(tokens.size[role]);
  const fontSize = role === 'display'
    ? legacy.fontSize * ratioFactor ** 2
    : role === 'title'
      ? legacy.fontSize * ratioFactor
      : tokenSize;
  const lineHeight = role === 'caption'
    ? legacy.lineHeight
    : input.style.fontFamily === 'heading' || role === 'display' || role === 'title'
      ? tokens.lineHeight.heading
      : tokens.lineHeight.body;
  const candidate = {
    fontSize: Number(fontSize.toFixed(4)),
    lineHeight,
  };

  if (input.variant === 'stack') {
    // HERO2 H2: 3줄 이상 히어로는 모바일에서 DNA display를 title 단계로
    // 낮춘다. 임의 크기를 만들지 않고 선택된 DNA의 모듈러 스케일 안에서만 축소한다.
    if (role === 'display' && lines >= 3) {
      return {
        fontSize: Number(Math.min(
          legacy.fontSize,
          tokenRemToPx(tokens.size.title),
        ).toFixed(4)),
        lineHeight: tokens.lineHeight.heading,
      };
    }
    return candidate;
  }
  if (candidate.fontSize <= legacy.fontSize && candidate.lineHeight <= legacy.lineHeight) return candidate;
  const requiredHeight = candidate.fontSize * candidate.lineHeight * lines;
  return requiredHeight <= input.frameHeight + 0.01 ? candidate : legacy;
}
