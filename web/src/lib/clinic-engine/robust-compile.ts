import { createHash } from 'node:crypto';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyKoreanFontPairing,
  applyLatinFontPairing,
} from '@/lib/fonts/selection';
import type { ProductionKoreanFontPairId } from '@/lib/fonts/types';
import { expandTokens } from '@/lib/design/dna/expand-tokens';
import { tokenSetToSiteTheme } from '@/lib/design/dna/site-theme-adapter';
import { resolveClinicMasterTheme } from '@/lib/clinic-master/tokens';
import type { ClinicMasterSourceBlock } from '@/lib/clinic-master/compiler';
import type {
  ClinicMasterPin,
  ImageElement,
  Section,
  SiteConfig,
  SitePage,
  SiteTheme,
} from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import type {
  ClinicEngineGateEvidence,
  ClinicEngineProfile,
} from './contracts';
import type { FeatureLayoutVariantId } from '@/lib/layout';
import {
  buildClinicFeatureSections,
  buildClinicHeroSection,
  type ClinicLayoutContentUnit,
} from './layout-sections';
import { runClinicEngine } from './pipeline';
import {
  extractRobustClinicSource,
  type RobustClinicImageDecision,
  type RobustClinicDocument,
  type RobustClinicExclusionKind,
  type RobustClinicSourceBlock,
  type RobustClinicSourcePage,
  type RobustClinicSourcePlan,
} from './robust-source';
import { sourceTextIsOperationalBlob } from './source-text-gates';
import {
  clinicMaterialAxesForUnit,
  isClinicFaqUnit,
  selectClinicVariantBlueprints,
  type ClinicMaterialAxisId,
  type ClinicMotionSignatureId,
  type ClinicVariantBlueprint,
} from './variants';

const FEATURE_SECTION_MAXIMUM_UNITS = 100;

export interface RobustClinicCompilationAudit {
  sourceBlockCount: number;
  targetBlockCount: number;
  excludedBlockCount: number;
  exclusions: Readonly<Record<RobustClinicExclusionKind, number>>;
  placedBlockIds: string[];
  unplacedTargetBlockIds: string[];
  renderBlockViolationCount: number;
  routedBusinessInfoBlockCount: number;
  imageSelection: {
    sourceRecordCount: number;
    selectedPhotoCount: number;
    brandCandidateCount: number;
    routedBrandLogo?: {
      sourcePageUrl: string;
      url: string;
      alt: string;
    };
    rejected: RobustClinicImageDecision[];
  };
  variant?: {
    id: string;
    expression: ClinicVariantBlueprint['expression'];
    activeMaterialAxes: ClinicVariantBlueprint['activeMaterialAxes'];
    emphasizedAxis?: ClinicMaterialAxisId;
    faqSourceUnitCount: number;
    faqRenderedUnitCount: number;
    syntheticContentBlockCount: 0;
  };
  pages: Array<{
    sourceUrl: string;
    finalUrl: string;
    slug: string | null;
    sourceBlockCount: number;
    targetBlockCount: number;
    placedBlockCount: number;
    layoutVariants: string[];
    headline: RobustClinicHeadlineEvidence;
    navigation: RobustClinicNavigationEvidence;
  }>;
}

export type RobustClinicHeadlineSource =
  | 'text-h1'
  | 'body-heading'
  | 'og-title'
  | 'document-title'
  | 'source-text'
  | 'hostname';

export interface RobustClinicHeadlineEvidence {
  source: RobustClinicHeadlineSource;
  sourceText: string;
  value: string;
  brandSuffixRemoved: boolean;
  substringVerified: boolean;
}

export type RobustClinicNavigationSource =
  | 'anchor'
  | 'anchor-brand-suffix'
  | 'path'
  | 'headline';

export interface RobustClinicNavigationEvidence {
  source: RobustClinicNavigationSource;
  sourceText: string;
  value: string;
  exactRepeatCollapsed: boolean;
  brandSuffixRemoved: boolean;
  substringVerified: boolean;
}

function brandLogoElement(image: RobustClinicSourcePage['brandImages'][number]): ImageElement {
  return {
    id: `clinic-route-brand-logo-${image.id}`,
    kind: 'image',
    src: image.src,
    alt: image.alt,
    frame: { x: 0, y: 0, w: 1, h: 1 },
    z: 0,
    style: { objectFit: 'contain', shadow: false },
    entrance: { effect: 'none' },
  };
}

export interface RobustClinicCompilation {
  config: SiteConfig;
  sourcePageUrls: string[];
  audit: RobustClinicCompilationAudit;
}

export interface RobustClinicVariantCompilation extends RobustClinicCompilation {
  variant: ClinicVariantBlueprint;
}

export interface RobustClinicVariantSet {
  variants: RobustClinicVariantCompilation[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function masterPin(
  profile: ClinicEngineProfile,
  artifact: CrawlArtifactPayload,
  variant?: ClinicVariantBlueprint,
): ClinicMasterPin {
  return {
    version: 1,
    masterId: 'premium-dental-v1',
    accentPreset: variant?.expression.accentPreset ?? 'clean-blue',
    typographyPreset: variant?.expression.typographyPreset
      ?? (profile.locale === 'ko-KR' ? 'clinic-neutral' : 'clinic-editorial'),
    density: variant?.expression.density ?? 'balanced',
    focus: 'balanced',
    demoPitchLocale: profile.locale === 'ko-KR' ? 'ko-owner' : 'en',
    paletteSource: {
      version: 1,
      kind: 'neutral',
      sourceSha256: sha256(`${artifact.finalOrigin}\n${artifact.seedUrl}`),
    },
    stockManifestVersion: 1,
  };
}

function themeFor(
  profile: ClinicEngineProfile,
  artifact: CrawlArtifactPayload,
  pin: ClinicMasterPin,
  variant?: ClinicVariantBlueprint,
): SiteTheme {
  const resolved = resolveClinicMasterTheme(
    emptySiteConfig(new URL(artifact.seedUrl).hostname).theme,
    pin,
  );
  const koreanPairing: ProductionKoreanFontPairId = variant
    ? variant.expression.typographyPreset === 'clinic-editorial'
      ? 'kr-nanum-myeongjo-readable'
      : variant.expression.typographyPreset === 'clinic-geometric'
        ? 'kr-gmarket-noto-structured'
        : 'kr-pretendard-neutral'
    : 'kr-nanum-myeongjo-readable';
  const paired = profile.locale === 'ko-KR'
    ? applyKoreanFontPairing(resolved, koreanPairing)
    : applyLatinFontPairing(resolved, {
    locale: 'en-US',
    id: 'us-clinical-neutral',
    assetVersion: 1,
    systemFallback: false,
    typographyPreset: pin.typographyPreset,
  });
  if (!variant) return paired;
  const tokenTheme = tokenSetToSiteTheme(expandTokens(
    'medical-clinical-clarity',
    clinicVariantHueSeed(variant),
    { density: variant.expression.density },
  ));
  return {
    ...paired,
    tokens: tokenTheme.tokens,
    customCss: clinicVariantCss(variant),
  };
}

function clinicVariantHueSeed(variant: ClinicVariantBlueprint): number {
  switch (variant.expression.accentPreset) {
    case 'clean-blue': return 210;
    case 'clean-teal': return 184;
    case 'clean-green': return 150;
    case 'clean-warm-neutral': return 25;
  }
}

const CLINIC_VARIANT_EASING = 'cubic-bezier(.16,1,.3,1)';

function clinicVariantCss(variant: ClinicVariantBlueprint): string {
  const motion = variant.expression.motionSignature;
  const duration = motion === 'calm-fade'
    ? 800
    : motion === 'rise-stagger'
      ? 1000
      : motion === 'cinematic'
        ? 1200
        : 0;
  const translateDesktop = motion === 'calm-fade' ? 0 : 24;
  const translateMobile = motion === 'calm-fade' ? 0 : 16;
  const hero = variant.expression.heroLayout;
  return `
[data-clinic-motion-signature="${motion}"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
  opacity: 0;
  transform: translateY(${translateDesktop}px);
}
[data-clinic-motion-signature="${motion}"] [data-clinic-variant-reveal][data-m="reveal"].m-show {
  opacity: 1;
  transform: none;
  transition-duration: ${duration}ms;
  transition-timing-function: ${CLINIC_VARIANT_EASING};
}
[data-clinic-motion-signature="cinematic"] [data-clinic-flow-inner] {
  transform: translateY(calc((.5 - var(--scroll-progress,0)) * 12px));
}
[data-clinic-flow-section="${hero}"] [data-clinic-flow-hero-copy] {
  ${hero === 'hero.split-right' ? 'justify-items: end; text-align: right;' : ''}
  ${hero === 'hero.fullbleed-centered' ? 'justify-items: center; text-align: center;' : ''}
}
[data-clinic-flow-section="${hero}"] [data-clinic-flow-hero-copy] :is(h1,p) {
  ${hero === 'hero.split-right' ? 'margin-left: auto;' : ''}
  ${hero === 'hero.fullbleed-centered' ? 'margin-inline: auto;' : ''}
}
[data-clinic-flow-section="hero.image-below"] [data-clinic-flow-hero-media] {
  min-height: 0;
  grid-template-rows: auto minmax(22rem,50vh);
}
[data-clinic-flow-section="hero.image-below"] [data-clinic-flow-hero-media] > img {
  position: relative;
  grid-row: 2;
  z-index: 0;
}
@media (max-width: 767.98px) {
  [data-clinic-motion-signature="${motion}"] [data-clinic-variant-reveal][data-m="reveal"].m-hide {
    transform: translateY(${translateMobile}px);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-clinic-motion-signature] [data-clinic-variant-reveal] {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    animation: none !important;
  }
}`.trim();
}

function safeSlug(value: string, index: number, claimed: Set<string>): string {
  if (index === 0) return '';
  const parsed = new URL(value);
  const candidate = decodeURIComponent(`${parsed.pathname}-${parsed.searchParams.toString()}`)
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 28);
  const base = candidate || `page-${index + 1}`;
  let slug = `${base}-${sha256(value).slice(0, 8)}`.slice(0, 40).replace(/-$/u, '');
  let collision = 1;
  while (claimed.has(slug)) {
    collision += 1;
    const suffix = `-${collision}`;
    slug = `${base.slice(0, 40 - suffix.length)}${suffix}`;
  }
  claimed.add(slug);
  return slug;
}

const BRAND_TITLE_SEPARATOR_RE = /(?:\||·|—)/gu;

function lastBrandSuffix(value: string): { prefix: string; suffix: string } | undefined {
  const matches = [...value.matchAll(BRAND_TITLE_SEPARATOR_RE)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) return undefined;
  const prefix = value.slice(0, last.index).trim();
  const suffix = value.slice(last.index + last[0].length).trim();
  return prefix && suffix ? { prefix, suffix } : undefined;
}

function repeatedBrandSuffixes(pages: readonly RobustClinicSourcePage[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const values = [page.metadataTitle?.text, page.metadataOgTitle?.text]
      .filter((value): value is string => Boolean(value));
    for (const value of new Set(values)) {
      const suffix = lastBrandSuffix(value)?.suffix.toLocaleLowerCase('en-US');
      if (suffix) counts.set(suffix, (counts.get(suffix) ?? 0) + 1);
    }
  }
  return new Set([...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([suffix]) => suffix));
}

function withoutRepeatedBrandSuffix(
  value: string,
  suffixes: ReadonlySet<string>,
): { value: string; removed: boolean } {
  const parts = lastBrandSuffix(value);
  if (!parts || !suffixes.has(parts.suffix.toLocaleLowerCase('en-US'))) {
    return { value, removed: false };
  }
  return { value: parts.prefix, removed: true };
}

function collapseExactRepeatedAnchorLabel(value: string): {
  value: string;
  collapsed: boolean;
} {
  const normalized = value.trim();
  const characters = [...normalized];
  if (characters.length >= 2 && characters.length % 2 === 0) {
    const middle = characters.length / 2;
    const left = characters.slice(0, middle).join('');
    const right = characters.slice(middle).join('');
    if (left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')) {
      return { value: left, collapsed: true };
    }
  }
  const words = normalized.split(/\s+/u);
  if (words.length < 2 || words.length % 2 !== 0) return { value, collapsed: false };
  const middle = words.length / 2;
  const left = words.slice(0, middle).join(' ');
  const right = words.slice(middle).join(' ');
  return left.toLocaleLowerCase('en-US') === right.toLocaleLowerCase('en-US')
    ? { value: left, collapsed: true }
    : { value, collapsed: false };
}

function normalizedPageUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
  return parsed.toString();
}

function urlDerivedNavigationLabel(
  value: string,
  expanded = false,
): { label: string; sourceText: string } {
  const parsed = new URL(value);
  const sourceText = decodeURIComponent(parsed.toString());
  const hostOffset = sourceText.indexOf(parsed.host);
  const relativeSource = hostOffset >= 0
    ? sourceText.slice(hostOffset + parsed.host.length)
    : sourceText;
  const queryValue = [...parsed.searchParams.values()]
    .map((candidate) => decodeURIComponent(candidate).trim())
    .find(Boolean);
  const pathValue = decodeURIComponent(parsed.pathname)
    .split('/')
    .filter(Boolean)
    .at(-1)
    ?.trim();
  const candidate = expanded
    ? relativeSource || parsed.hostname
    : queryValue ?? pathValue ?? parsed.hostname;
  const characters = [...candidate];
  return {
    label: characters.length <= 40 ? candidate : characters.slice(-40).join(''),
    sourceText,
  };
}

function derivedHeadlineBlock(
  block: ClinicMasterSourceBlock,
  text: string,
): ClinicMasterSourceBlock {
  return text === block.text
    ? block
    : { ...block, id: `${block.id}-brand-trim-${sha256(text).slice(0, 8)}`, text };
}

function eligibleHeadlineBlock(block: RobustClinicSourceBlock): boolean {
  const text = block.text.replace(/\s+/gu, ' ').trim();
  return Boolean(text)
    && !HIERARCHY_PRICE_OR_NUMBER.test(text)
    && !HIERARCHY_WIDGET_LABEL.test(text)
    && !sourceTextIsOperationalBlob(text);
}

function selectHeadline(
  page: RobustClinicSourcePage,
  suffixes: ReadonlySet<string>,
): { block: ClinicMasterSourceBlock; evidence: RobustClinicHeadlineEvidence } {
  const candidates: Array<{
    block: ClinicMasterSourceBlock | undefined;
    source: RobustClinicHeadlineSource;
    trimBrand: boolean;
  }> = [
    {
      block: page.targetBlocks.find((block) => block.tagName === 'h1' && eligibleHeadlineBlock(block)),
      source: 'text-h1',
      trimBrand: false,
    },
    {
      block: page.targetBlocks.find((block) => block.heading && eligibleHeadlineBlock(block)),
      source: 'body-heading',
      trimBrand: false,
    },
    { block: page.metadataOgTitle, source: 'og-title', trimBrand: true },
    { block: page.metadataTitle, source: 'document-title', trimBrand: true },
    {
      block: page.targetBlocks.find((block) => (
        block.text.length <= 200 && eligibleHeadlineBlock(block)
      )),
      source: 'source-text',
      trimBrand: false,
    },
  ];
  for (const candidate of candidates) {
    if (!candidate.block) continue;
    const selected = candidate.trimBrand
      ? withoutRepeatedBrandSuffix(candidate.block.text, suffixes)
      : { value: candidate.block.text, removed: false };
    return {
      block: derivedHeadlineBlock(candidate.block, selected.value),
      evidence: {
        source: candidate.source,
        sourceText: candidate.block.text,
        value: selected.value,
        brandSuffixRemoved: selected.removed,
        substringVerified: candidate.block.text.includes(selected.value),
      },
    };
  }
  const hostname = new URL(page.finalUrl).hostname;
  return {
    block: {
      id: `robust-hostname-${page.id}-${sha256(hostname).slice(0, 8)}`,
      kind: 'introduction',
      text: hostname,
      sourceUrl: page.sourceUrl,
    },
    evidence: {
      source: 'hostname',
      sourceText: page.finalUrl,
      value: hostname,
      brandSuffixRemoved: false,
      substringVerified: page.finalUrl.includes(hostname),
    },
  };
}

function navigationEvidenceByPage(input: {
  pages: readonly RobustClinicSourcePage[];
  headlines: ReadonlyMap<string, ReturnType<typeof selectHeadline>>;
  brandSuffixes: ReadonlySet<string>;
}): ReadonlyMap<string, RobustClinicNavigationEvidence> {
  const anchors = new Map<string, Array<{ label: string }>>();
  for (const page of input.pages) {
    for (const block of page.excludedBlocks) {
      for (const destination of block.navigationDestinations ?? []) {
        const key = normalizedPageUrl(destination.url);
        const values = anchors.get(key) ?? [];
        values.push({ label: destination.label });
        anchors.set(key, values);
      }
    }
  }
  const initial = new Map<string, RobustClinicNavigationEvidence>();
  for (const page of input.pages) {
    const candidates = (anchors.get(normalizedPageUrl(page.finalUrl)) ?? [])
      .map(({ label }) => {
        const repeated = collapseExactRepeatedAnchorLabel(label);
        const trimmed = withoutRepeatedBrandSuffix(repeated.value, input.brandSuffixes);
        return {
          sourceText: label,
          value: trimmed.value,
          collapsed: repeated.collapsed,
          suffixRemoved: trimmed.removed,
        };
      })
      .filter((candidate) => candidate.value)
      .sort((left, right) => left.value.length - right.value.length);
    const anchor = candidates[0];
    if (anchor) {
      initial.set(page.id, {
        source: anchor.suffixRemoved ? 'anchor-brand-suffix' : 'anchor',
        sourceText: anchor.sourceText,
        value: [...anchor.value].slice(0, 40).join(''),
        exactRepeatCollapsed: anchor.collapsed,
        brandSuffixRemoved: anchor.suffixRemoved,
        substringVerified: anchor.sourceText.includes([...anchor.value].slice(0, 40).join('')),
      });
      continue;
    }
    const parsed = new URL(page.finalUrl);
    if (parsed.pathname === '/' && parsed.search === '') {
      const headline = input.headlines.get(page.id)!;
      initial.set(page.id, {
        source: 'headline',
        sourceText: headline.evidence.sourceText,
        value: [...headline.evidence.value].slice(0, 40).join(''),
        exactRepeatCollapsed: false,
        brandSuffixRemoved: headline.evidence.brandSuffixRemoved,
        substringVerified: headline.evidence.sourceText.includes(
          [...headline.evidence.value].slice(0, 40).join(''),
        ),
      });
      continue;
    }
    const pathLabel = urlDerivedNavigationLabel(page.finalUrl);
    initial.set(page.id, {
      source: 'path',
      sourceText: pathLabel.sourceText,
      value: pathLabel.label,
      exactRepeatCollapsed: false,
      brandSuffixRemoved: false,
      substringVerified: pathLabel.sourceText.includes(pathLabel.label),
    });
  }
  const duplicates = new Map<string, string[]>();
  for (const page of input.pages) {
    const label = initial.get(page.id)!;
    const key = label.value.toLocaleLowerCase('en-US');
    const values = duplicates.get(key) ?? [];
    values.push(page.id);
    duplicates.set(key, values);
  }
  for (const ids of duplicates.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const page = input.pages.find((candidate) => candidate.id === id)!;
      const parsed = new URL(page.finalUrl);
      if (parsed.pathname === '/' && parsed.search === '') continue;
      const pathLabel = urlDerivedNavigationLabel(page.finalUrl);
      initial.set(id, {
        source: 'path',
        sourceText: pathLabel.sourceText,
        value: pathLabel.label,
        exactRepeatCollapsed: false,
        brandSuffixRemoved: false,
        substringVerified: pathLabel.sourceText.includes(pathLabel.label),
      });
    }
  }
  const pathDuplicates = new Map<string, string[]>();
  for (const page of input.pages) {
    const label = initial.get(page.id)!;
    const key = label.value.toLocaleLowerCase('en-US');
    const values = pathDuplicates.get(key) ?? [];
    values.push(page.id);
    pathDuplicates.set(key, values);
  }
  for (const ids of pathDuplicates.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      const page = input.pages.find((candidate) => candidate.id === id)!;
      const pathLabel = urlDerivedNavigationLabel(page.finalUrl, true);
      initial.set(id, {
        source: 'path',
        sourceText: pathLabel.sourceText,
        value: pathLabel.label,
        exactRepeatCollapsed: false,
        brandSuffixRemoved: false,
        substringVerified: pathLabel.sourceText.includes(pathLabel.label),
      });
    }
  }
  return initial;
}

interface HierarchyCluster {
  blocks: RobustClinicSourceBlock[];
  repeatedStructure: boolean;
}

const HIERARCHY_PRICE_OR_NUMBER = /^(?:[-+]?\d[\d,.]*(?:\s*(?:\uC6D0|%))?|[₩$€¥£]\s*\d[\d,.]*)$/u;
const HIERARCHY_WIDGET_LABEL = /^(?:\uC804\uCCB4\uB7AD\uD0B9|\uC2E4\uC2DC\uAC04\s*(?:\uAC80\uC0C9|\uC778\uAE30\s*\uAC80\uC0C9\s*\uC21C\uC704)|\uAC80\uC0C9|\uC7A5\uBC14\uAD6C\uB2C8|\uC804\uCCB4\uBA54\uB274|\uC804\uCCB4\s*\uBA54\uB274|\uC804\uCCB4\s*\uCE74\uD14C\uACE0\uB9AC)$/iu;

function pathSegments(block: RobustClinicSourceBlock): string[] {
  return block.sourceElementPath.split('>').filter(Boolean);
}

function normalizedStructurePath(value: string): string {
  return value.replace(/:nth-of-type\(\d+\)/gu, ':nth-of-type(*)');
}

function hierarchyClusters(blocks: readonly RobustClinicSourceBlock[]): HierarchyCluster[] {
  const prefixBlocks = new Map<string, Set<string>>();
  for (const block of blocks) {
    const segments = pathSegments(block);
    for (let length = 1; length < segments.length; length += 1) {
      const prefix = segments.slice(0, length).join('>');
      const values = prefixBlocks.get(prefix) ?? new Set<string>();
      values.add(block.id);
      prefixBlocks.set(prefix, values);
    }
  }
  const signatureInstances = new Map<string, Set<string>>();
  for (const prefix of prefixBlocks.keys()) {
    const signature = normalizedStructurePath(prefix);
    const values = signatureInstances.get(signature) ?? new Set<string>();
    values.add(prefix);
    signatureInstances.set(signature, values);
  }
  const groupFor = (block: RobustClinicSourceBlock) => {
    const segments = pathSegments(block);
    const candidates = segments.slice(0, -1).map((_, index) => (
      segments.slice(0, index + 1).join('>')
    ));
    for (const prefix of candidates.reverse()) {
      const tail = prefix.split('>').at(-1) ?? '';
      const semanticItem = /^(?:li|tr|article)(?::|#|$)/u.test(tail);
      const blockCount = prefixBlocks.get(prefix)?.size ?? 0;
      const repeated = (signatureInstances.get(normalizedStructurePath(prefix))?.size ?? 0) >= 2;
      if (blockCount >= 2 && (semanticItem || repeated)) {
        return { key: prefix, repeated };
      }
    }
    return undefined;
  };
  const assigned = new Map(blocks.map((block) => [block.id, groupFor(block)]));
  const result: HierarchyCluster[] = [];
  let cursor = 0;
  while (cursor < blocks.length) {
    const block = blocks[cursor];
    const group = assigned.get(block.id);
    if (group) {
      const grouped = [block];
      cursor += 1;
      while (cursor < blocks.length && assigned.get(blocks[cursor].id)?.key === group.key) {
        grouped.push(blocks[cursor]);
        cursor += 1;
      }
      result.push({ blocks: grouped, repeatedStructure: group.repeated });
      continue;
    }
    if (block.heading) {
      const grouped = [block];
      cursor += 1;
      while (
        cursor < blocks.length
        && !blocks[cursor].heading
        && !assigned.get(blocks[cursor].id)
      ) {
        grouped.push(blocks[cursor]);
        cursor += 1;
      }
      result.push({ blocks: grouped, repeatedStructure: false });
      continue;
    }
    result.push({ blocks: [block], repeatedStructure: false });
    cursor += 1;
  }
  return result;
}

function canLeadHierarchyItem(block: RobustClinicSourceBlock): boolean {
  const text = block.text.replace(/\s+/gu, ' ').trim();
  if (!text || HIERARCHY_PRICE_OR_NUMBER.test(text) || HIERARCHY_WIDGET_LABEL.test(text)) {
    return false;
  }
  if (/\n/u.test(block.text) && /(?:[₩$€¥£]|\d[\d,]*(?:\.\d+)?\s*(?:\uC6D0|%))/u.test(block.text)) {
    return false;
  }
  return block.heading || [...text].length >= 4;
}

function contentUnits(input: {
  blocks: readonly RobustClinicSourceBlock[];
  images: RobustClinicSourcePage['images'];
}): Array<ClinicLayoutContentUnit & { repeatedStructure: boolean }> {
  const units: Array<ClinicLayoutContentUnit & { repeatedStructure: boolean }> = [];
  let imageIndex = 0;
  for (const [clusterIndex, cluster] of hierarchyClusters(input.blocks).entries()) {
    const title = cluster.blocks.find(canLeadHierarchyItem) ?? cluster.blocks[0];
    const remainder = cluster.blocks.filter((block) => block.id !== title.id);
    const body = remainder[0];
    const image = input.images[imageIndex];
    if (image) imageIndex += 1;
    units.push({
      id: `robust-hierarchy-${clusterIndex}-${title.id}`,
      title,
      ...(body ? { body } : {}),
      ...(remainder.length > 1 ? { details: remainder.slice(1) } : {}),
      ...(!canLeadHierarchyItem(title) ? { titleAsCopy: true } : {}),
      ...(image ? { image } : {}),
      repeatedStructure: cluster.repeatedStructure,
    });
  }
  return units;
}

function candidatesFor(
  units: readonly (ClinicLayoutContentUnit & { repeatedStructure?: boolean })[],
) {
  if (
    units.length >= 3
    && units.length <= 8
    && units.every((unit) => /[?？]\s*$/u.test(unit.title.text) && Boolean(unit.body))
  ) {
    return ['features.faq-accordion', 'features.prose-article'] as const;
  }
  const repeatedCount = units.filter((unit) => unit.repeatedStructure).length;
  if (repeatedCount >= 2 && repeatedCount / units.length >= 0.3) {
    return [
      'features.three-column-cards',
      'features.icon-grid',
      'features.prose-article',
    ] as const;
  }
  const imageCount = units.filter((unit) => Boolean(unit.image)).length;
  if (units.length <= 6 && imageCount >= 2) {
    return [
      'features.zigzag-media',
      'features.featured-first',
      'features.three-column-cards',
      'features.prose-article',
    ] as const;
  }
  if (units.length >= 2 && units.length <= 6) {
    return [
      'features.icon-grid',
      'features.sticky-heading-two-column',
      'features.numbered-list',
      'features.prose-article',
    ] as const;
  }
  return ['features.prose-article'] as const;
}

function variantCandidatesFor(
  units: readonly (ClinicLayoutContentUnit & { repeatedStructure?: boolean })[],
  emphasizedAxis?: ClinicMaterialAxisId,
): readonly FeatureLayoutVariantId[] {
  if (!emphasizedAxis) return candidatesFor(units);
  if (
    emphasizedAxis === 'beforeafter'
    || emphasizedAxis === 'videos'
    || emphasizedAxis === 'events'
    || emphasizedAxis === 'gallery'
    || emphasizedAxis === 'us-procedure-gallery'
  ) {
    return [
      'features.zigzag-media',
      'features.featured-first',
      'features.three-column-cards',
      'features.prose-article',
    ];
  }
  if (
    emphasizedAxis === 'reviews'
    || emphasizedAxis === 'providers'
    || emphasizedAxis === 'us-trust-rich'
  ) {
    return [
      'features.three-column-cards',
      'features.icon-grid',
      'features.sticky-heading-two-column',
      'features.prose-article',
    ];
  }
  return [
    'features.icon-grid',
    'features.numbered-list',
    'features.sticky-heading-two-column',
    'features.prose-article',
  ];
}

function markedVariantSectionId(
  value: string,
  motionSignature: ClinicMotionSignatureId,
): string {
  return `${value}-clinic-variant-motion-${motionSignature}`;
}

function variantOrderedUnits(
  units: readonly (ClinicLayoutContentUnit & { repeatedStructure?: boolean })[],
  profile: ClinicEngineProfile,
  emphasizedAxis?: ClinicMaterialAxisId,
): Array<ClinicLayoutContentUnit & { repeatedStructure?: boolean }> {
  if (!emphasizedAxis) return [...units];
  return units
    .map((unit, sourceIndex) => ({
      unit,
      sourceIndex,
      emphasized: clinicMaterialAxesForUnit(unit, profile).includes(emphasizedAxis),
    }))
    .sort((left, right) => (
      Number(right.emphasized) - Number(left.emphasized)
      || left.sourceIndex - right.sourceIndex
    ))
    .map(({ unit }) => unit);
}

function variantSectionsForPage(input: {
  page: RobustClinicSourcePage;
  theme: SiteTheme;
  profile: ClinicEngineProfile;
  title: ClinicMasterSourceBlock;
  variant: ClinicVariantBlueprint;
}): {
  sections: Section[];
  placedBlockIds: string[];
  faqSourceUnitCount: number;
  faqRenderedUnitCount: number;
} | null {
  if (input.page.accessFailure || input.page.targetBlocks.length === 0) return null;
  const titleOwnsTargetBlock = input.page.targetBlocks.some((block) => block.id === input.title.id);
  const lead = input.page.metadataDescription
    ?? input.page.targetBlocks.find((block) => block.id !== input.title.id);
  const bodyBlocks = input.page.targetBlocks.filter((block) => (
    (!titleOwnsTargetBlock || block.id !== input.title.id)
    && block.id !== lead?.id
  ));
  const motion = input.variant.expression.motionSignature;
  const heroImage = input.page.images[0];
  const requestedHero = heroImage
    ? input.variant.expression.heroLayout
    : 'hero.text-only-bold';
  const hero = buildClinicHeroSection({
    id: markedVariantSectionId(`${input.page.id}-hero`, motion),
    name: 'Introduction',
    title: input.title,
    ...(lead ? { lead } : {}),
    theme: input.theme,
    ...(heroImage ? { image: heroImage } : {}),
    requestedId: requestedHero,
  });
  hero.surfaceTone = input.variant.expression.tone === 'dark' ? 'dark' : 'base';

  const sourceUnits = contentUnits({
    blocks: bodyBlocks,
    images: input.page.images.slice(1),
  });
  const faqUnits = sourceUnits.filter(isClinicFaqUnit);
  // The catalog contract requires 3 complete Q/A pairs. Below that threshold every source
  // unit remains in the ordinary content stream; no empty FAQ shell is emitted.
  const renderedFaqUnits = faqUnits.length >= 3 ? faqUnits.slice(0, 8) : [];
  const renderedFaqIds = new Set(renderedFaqUnits.map((unit) => unit.id));
  const ordinaryUnits = variantOrderedUnits(
    sourceUnits.filter((unit) => !renderedFaqIds.has(unit.id)),
    input.profile,
    input.variant.emphasizedAxis,
  );
  const contentSections: Section[] = [];
  for (let offset = 0; offset < ordinaryUnits.length; offset += FEATURE_SECTION_MAXIMUM_UNITS) {
    const chunk = ordinaryUnits.slice(offset, offset + FEATURE_SECTION_MAXIMUM_UNITS);
    const candidates = variantCandidatesFor(chunk, input.variant.emphasizedAxis);
    const cardFirst = candidates[0] === 'features.three-column-cards';
    contentSections.push(...buildClinicFeatureSections({
      id: markedVariantSectionId(
        `${input.page.id}-content-${Math.floor(offset / FEATURE_SECTION_MAXIMUM_UNITS) + 1}`,
        motion,
      ),
      name: 'Clinical information',
      units: chunk,
      theme: input.theme,
      candidates,
      maximumItems: cardFirst ? 6 : chunk.length > 6 ? FEATURE_SECTION_MAXIMUM_UNITS : 6,
      allowSingleFeature: true,
      surface: Math.floor(offset / FEATURE_SECTION_MAXIMUM_UNITS) % 2 === 1,
    }));
  }
  const faqSections = renderedFaqUnits.length > 0
    ? buildClinicFeatureSections({
        id: markedVariantSectionId(`${input.page.id}-faq`, motion),
        name: 'FAQ',
        units: renderedFaqUnits,
        theme: input.theme,
        candidates: ['features.faq-accordion', 'features.prose-article'],
        maximumItems: 8,
        surface: true,
      })
    : [];
  const sections = [hero, ...contentSections, ...faqSections];
  if (
    input.variant.expression.closingBlock === 'faq-last'
    && faqSections.length > 0
  ) {
    // Already last by construction. Keeping the branch explicit makes the expression
    // choice auditable without inventing a closing section.
  } else if (
    input.variant.expression.closingBlock === 'visual-last'
    || input.variant.expression.closingBlock === 'trust-last'
  ) {
    const axis = input.variant.expression.closingBlock === 'visual-last'
      ? new Set<ClinicMaterialAxisId>([
          'beforeafter', 'videos', 'events', 'gallery', 'us-procedure-gallery',
        ])
      : new Set<ClinicMaterialAxisId>([
          'reviews', 'providers', 'us-trust-rich',
        ]);
    const firstMatchingIndex = contentSections.findIndex((section) => {
      const sectionUnitIds = new Set(section.sectionLayout?.items.map((item) => item.id) ?? []);
      return ordinaryUnits.some((unit) => (
        sectionUnitIds.has(unit.id)
        && clinicMaterialAxesForUnit(unit, input.profile).some((value) => axis.has(value))
      ));
    });
    if (firstMatchingIndex >= 0) {
      const matching = contentSections[firstMatchingIndex];
      sections.splice(sections.indexOf(matching), 1);
      const insertionIndex = faqSections.length > 0 ? sections.length - 1 : sections.length;
      sections.splice(insertionIndex, 0, matching);
    }
  }
  return {
    sections,
    placedBlockIds: input.page.targetBlocks.map((block) => block.id),
    faqSourceUnitCount: faqUnits.length,
    faqRenderedUnitCount: renderedFaqUnits.length,
  };
}

function sectionsForPage(input: {
  page: RobustClinicSourcePage;
  theme: SiteTheme;
  locale: ClinicEngineProfile['locale'];
  title: ClinicMasterSourceBlock;
}): { sections: Section[]; placedBlockIds: string[] } | null {
  if (input.page.accessFailure || input.page.targetBlocks.length === 0) return null;
  const title = input.title;
  const titleOwnsTargetBlock = input.page.targetBlocks.some((block) => block.id === title.id);
  const lead = input.page.metadataDescription
    ?? input.page.targetBlocks.find((block) => block.id !== title.id);
  const bodyBlocks = input.page.targetBlocks.filter((block) => (
    (!titleOwnsTargetBlock || block.id !== title.id)
    && block.id !== lead?.id
  ));
  const sections: Section[] = [buildClinicHeroSection({
    id: `${input.page.id}-hero`,
    name: 'Introduction',
    title,
    ...(lead ? { lead } : {}),
    theme: input.theme,
    ...(input.page.images[0] ? { image: input.page.images[0] } : {}),
    requestedId: input.page.images[0] ? 'hero.split-left' : 'hero.text-only-bold',
  })];
  const units = contentUnits({
    blocks: bodyBlocks,
    images: input.page.images.slice(1),
  });
  for (let offset = 0; offset < units.length; offset += FEATURE_SECTION_MAXIMUM_UNITS) {
    const chunk = units.slice(offset, offset + FEATURE_SECTION_MAXIMUM_UNITS);
    const candidates = candidatesFor(chunk);
    const cardFirst = candidates[0] === 'features.three-column-cards';
    sections.push(...buildClinicFeatureSections({
      id: `${input.page.id}-content-${Math.floor(offset / FEATURE_SECTION_MAXIMUM_UNITS) + 1}`,
      name: 'Clinical information',
      units: chunk,
      theme: input.theme,
      candidates,
      maximumItems: cardFirst ? 6 : chunk.length > 6 ? FEATURE_SECTION_MAXIMUM_UNITS : 6,
      allowSingleFeature: true,
      surface: Math.floor(offset / FEATURE_SECTION_MAXIMUM_UNITS) % 2 === 1,
    }));
  }
  return {
    sections,
    placedBlockIds: input.page.targetBlocks.map((block) => block.id),
  };
}

function layoutVariantIds(sections: readonly Section[]): string[] {
  const result: string[] = [];
  for (const section of sections) {
    if (section.heroLayout?.resolvedId) result.push(section.heroLayout.resolvedId);
    if (section.sectionLayout?.resolvedId) result.push(section.sectionLayout.resolvedId);
  }
  return result;
}

function exclusionCounts(
  plan: RobustClinicSourcePlan,
): Record<RobustClinicExclusionKind, number> {
  return {
    'footer-legal': plan.excludedBlocks.filter((block) => block.exclusion === 'footer-legal').length,
    'navigation-label': plan.excludedBlocks.filter((block) => block.exclusion === 'navigation-label').length,
    'skip-link': plan.excludedBlocks.filter((block) => block.exclusion === 'skip-link').length,
    'overlay-ui-chrome': plan.excludedBlocks.filter(
      (block) => block.exclusion === 'overlay-ui-chrome',
    ).length,
  };
}

function sourceRenderAudit(input: {
  config: SiteConfig;
  blocks: readonly RobustClinicSourceBlock[];
}): {
  placedBlockIds: string[];
  unplacedTargetBlockIds: string[];
  violationCount: number;
} {
  const textElements = input.config.pages.flatMap((page) => (
    page.sections.flatMap((section) => (
      section.elements.filter((element) => element.kind === 'text')
    ))
  ));
  const occurrences = new Map<string, typeof textElements>();
  for (const element of textElements) {
    const match = /^source-(robust-page-\d{3}-[a-f0-9]{10}-\d+-[a-f0-9]{12})-/u.exec(element.id);
    if (!match) continue;
    const values = occurrences.get(match[1]) ?? [];
    values.push(element);
    occurrences.set(match[1], values);
  }
  const placedBlockIds: string[] = [];
  const unplacedTargetBlockIds: string[] = [];
  let violationCount = 0;
  for (const block of input.blocks) {
    const matches = occurrences.get(block.id) ?? [];
    if (matches.length === 1 && matches[0].text === block.text) {
      placedBlockIds.push(block.id);
      continue;
    }
    unplacedTargetBlockIds.push(block.id);
    violationCount += 1;
  }
  return { placedBlockIds, unplacedTargetBlockIds, violationCount };
}

function compilePagePlan(input: {
  plan: RobustClinicSourcePlan;
  artifact: CrawlArtifactPayload;
  variant?: ClinicVariantBlueprint;
}): RobustClinicCompilation {
  const pin = masterPin(input.plan.profile, input.artifact, input.variant);
  const theme = themeFor(input.plan.profile, input.artifact, pin, input.variant);
  const claimedSlugs = new Set<string>();
  const pages: SitePage[] = [];
  const auditPages: RobustClinicCompilationAudit['pages'] = [];
  let faqSourceUnitCount = 0;
  let faqRenderedUnitCount = 0;
  const suffixes = repeatedBrandSuffixes(input.plan.pages);
  const headlines = new Map(input.plan.pages.map((page) => [
    page.id,
    selectHeadline(page, suffixes),
  ]));
  const navigation = navigationEvidenceByPage({
    pages: input.plan.pages,
    headlines,
    brandSuffixes: suffixes,
  });
  const brandRoute = input.plan.pages.flatMap((page) => (
    page.brandImages.map((image) => ({ image, sourcePageUrl: page.sourceUrl }))
  )).sort((left, right) => (
    (right.image.selectionScore ?? 0) - (left.image.selectionScore ?? 0)
  ))[0];
  for (const sourcePage of input.plan.pages) {
    const variantCompiled = input.variant
      ? variantSectionsForPage({
          page: sourcePage,
          theme,
          profile: input.plan.profile,
          title: headlines.get(sourcePage.id)!.block,
          variant: input.variant,
        })
      : null;
    const compiled = input.variant
      ? variantCompiled
      : sectionsForPage({
        page: sourcePage,
        theme,
        locale: input.plan.profile.locale,
        title: headlines.get(sourcePage.id)!.block,
      });
    if (!compiled) {
      auditPages.push({
        sourceUrl: sourcePage.sourceUrl,
        finalUrl: sourcePage.finalUrl,
        slug: null,
        sourceBlockCount: sourcePage.blocks.length,
        targetBlockCount: sourcePage.targetBlocks.length,
        placedBlockCount: 0,
        layoutVariants: [],
        headline: headlines.get(sourcePage.id)!.evidence,
        navigation: navigation.get(sourcePage.id)!,
      });
      continue;
    }
    if (variantCompiled) {
      faqSourceUnitCount += variantCompiled.faqSourceUnitCount;
      faqRenderedUnitCount += variantCompiled.faqRenderedUnitCount;
    }
    const slug = safeSlug(sourcePage.finalUrl, pages.length, claimedSlugs);
    const title = headlines.get(sourcePage.id)!.block.text;
    if (pages.length === 0 && brandRoute) {
      const hero = compiled.sections.find((section) => section.type === 'hero');
      hero?.elements.push(brandLogoElement(brandRoute.image));
    }
    pages.push({
      id: sourcePage.id,
      title,
      navLabel: navigation.get(sourcePage.id)!.value,
      slug,
      showInNav: pages.length < 7,
      sections: compiled.sections,
    });
    auditPages.push({
      sourceUrl: sourcePage.sourceUrl,
      finalUrl: sourcePage.finalUrl,
      slug,
      sourceBlockCount: sourcePage.blocks.length,
      targetBlockCount: sourcePage.targetBlocks.length,
      placedBlockCount: compiled.placedBlockIds.length,
      layoutVariants: layoutVariantIds(compiled.sections),
      headline: headlines.get(sourcePage.id)!.evidence,
      navigation: navigation.get(sourcePage.id)!,
    });
  }
  if (pages.length === 0) {
    throw new Error('CLINIC_SOURCE_INSUFFICIENT:NO_RENDERABLE_PAGES');
  }
  const title = pages[0].title;
  const config: SiteConfig = {
    version: 2,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: 'medical-clinical-clarity',
      hueSeed: input.variant ? clinicVariantHueSeed(input.variant) : 210,
      overrides: input.variant ? { density: input.variant.expression.density } : {},
    },
    namedTemplate: {
      catalogVersion: 1,
      templateId: 'premium-dental-v1',
    },
    clinicMaster: pin,
    ...(input.plan.businessInfo ? { businessInfo: input.plan.businessInfo.info } : {}),
    meta: {
      title,
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
      ...(input.plan.profile.locale === 'en-US'
        ? { locale: 'en-US', jurisdiction: 'US' }
        : {}),
    },
    pages,
    nav: { enabled: pages.length > 1 },
    motion: input.variant
      ? motionConfigFor(input.variant.expression.motionSignature)
      : { presetId: 'clinic-premium', intensity: 'subtle' },
  };
  const renderAudit = sourceRenderAudit({
    config,
    blocks: input.plan.targetBlocks,
  });
  return {
    config,
    sourcePageUrls: auditPages
      .filter((page) => page.slug !== null)
      .map((page) => page.sourceUrl),
    audit: {
      sourceBlockCount: input.plan.blocks.length,
      targetBlockCount: input.plan.targetBlocks.length,
      excludedBlockCount: input.plan.excludedBlocks.length,
      exclusions: exclusionCounts(input.plan),
      placedBlockIds: renderAudit.placedBlockIds,
      unplacedTargetBlockIds: renderAudit.unplacedTargetBlockIds,
      renderBlockViolationCount: renderAudit.violationCount,
      routedBusinessInfoBlockCount: input.plan.businessInfo?.sourceBlockIds.length ?? 0,
      imageSelection: {
        sourceRecordCount: input.plan.pages.reduce(
          (total, page) => total + page.imageDecisions.length,
          0,
        ),
        selectedPhotoCount: input.plan.pages.reduce(
          (total, page) => total + page.images.length,
          0,
        ),
        brandCandidateCount: input.plan.pages.reduce(
          (total, page) => total + page.brandImages.length,
          0,
        ),
        ...(brandRoute
          ? {
              routedBrandLogo: {
                sourcePageUrl: brandRoute.sourcePageUrl,
                url: brandRoute.image.src,
                alt: brandRoute.image.alt,
              },
            }
          : {}),
        rejected: input.plan.pages.flatMap((page) => page.imageDecisions.filter(
          (decision) => decision.disposition === 'blocked'
            || decision.disposition === 'indeterminate',
        )),
      },
      ...(input.variant
        ? {
            variant: {
              id: input.variant.id,
              expression: input.variant.expression,
              activeMaterialAxes: input.variant.activeMaterialAxes,
              ...(input.variant.emphasizedAxis
                ? { emphasizedAxis: input.variant.emphasizedAxis }
                : {}),
              faqSourceUnitCount,
              faqRenderedUnitCount,
              syntheticContentBlockCount: 0 as const,
            },
          }
        : {}),
      pages: auditPages,
    },
  };
}

function motionConfigFor(signature: ClinicMotionSignatureId): NonNullable<SiteConfig['motion']> {
  if (signature === 'static') {
    return {
      presetId: 'base-calm-v2',
      intensity: 'off',
      catalogVersion: 2,
      heroTechnique: 'none',
    };
  }
  if (signature === 'calm-fade') {
    return {
      presetId: 'base-calm-v2',
      intensity: 'subtle',
      catalogVersion: 2,
      heroTechnique: 'none',
    };
  }
  if (signature === 'rise-stagger') {
    return {
      presetId: 'base-flow-v2',
      intensity: 'subtle',
      catalogVersion: 2,
      heroTechnique: 'none',
    };
  }
  return {
    presetId: 'base-premium-v2',
    intensity: 'normal',
    catalogVersion: 2,
    heroTechnique: 'ken-burns',
  };
}

/**
 * Arbitrary-site clinic entry. The page plan is intentionally passed into resolveLayouts;
 * small-business import projection remains a separate product path.
 */
export function compileRobustClinicArtifact(input: {
  artifact: CrawlArtifactPayload;
  documents?: readonly RobustClinicDocument[];
  profile: ClinicEngineProfile;
  gateEvidence?: ClinicEngineGateEvidence | ((output: RobustClinicCompilation) => ClinicEngineGateEvidence);
  /** Additive policy adapter; existing profiles omit it and retain byte-identical output. */
  transformSourcePlan?: (plan: RobustClinicSourcePlan) => RobustClinicSourcePlan;
}): RobustClinicCompilation {
  return runClinicEngine({
    profile: input.profile,
    value: {
      artifact: input.artifact,
      documents: input.documents,
      profile: input.profile,
    },
    extractSource: (value) => {
      const source = extractRobustClinicSource(value);
      return input.transformSourcePlan?.(source) ?? source;
    },
    splitPages: (source) => source,
    resolveLayouts: (plan) => compilePagePlan({ plan, artifact: input.artifact }),
    gateEvidence: (output) => typeof input.gateEvidence === 'function'
      ? input.gateEvidence(output)
      : input.gateEvidence ?? {},
  });
}

/**
 * Additive multi-proposal entry for arbitrary clinic sources. The established single-output
 * compiler above remains byte-stable; variants share one extracted source plan and differ only
 * through pinned expression policy and source-backed structural emphasis.
 */
export function compileRobustClinicVariants(input: {
  artifact: CrawlArtifactPayload;
  documents?: readonly RobustClinicDocument[];
  profile: ClinicEngineProfile;
  /** Additive policy adapter; identical to the single-output entry's source boundary. */
  transformSourcePlan?: (plan: RobustClinicSourcePlan) => RobustClinicSourcePlan;
}): RobustClinicVariantSet {
  const extracted = extractRobustClinicSource({
    artifact: input.artifact,
    documents: input.documents,
    profile: input.profile,
  });
  const plan = input.transformSourcePlan?.(extracted) ?? extracted;
  const blueprints = selectClinicVariantBlueprints(plan);
  if (blueprints.length < 3) {
    throw new Error(`CLINIC_VARIANT_MINIMUM_UNMET:${blueprints.length}`);
  }
  return {
    variants: blueprints.map((variant) => ({
      ...compilePagePlan({ plan, artifact: input.artifact, variant }),
      variant,
    })),
  };
}
