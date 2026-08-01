import { createHash } from 'node:crypto';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyKoreanFontPairing,
  applyLatinFontPairing,
} from '@/lib/fonts/selection';
import { resolveClinicMasterTheme } from '@/lib/clinic-master/tokens';
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
  pages: Array<{
    sourceUrl: string;
    finalUrl: string;
    slug: string | null;
    sourceBlockCount: number;
    targetBlockCount: number;
    placedBlockCount: number;
    layoutVariants: string[];
  }>;
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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function masterPin(profile: ClinicEngineProfile, artifact: CrawlArtifactPayload): ClinicMasterPin {
  return {
    version: 1,
    masterId: 'premium-dental-v1',
    accentPreset: 'clean-blue',
    typographyPreset: profile.locale === 'ko-KR' ? 'clinic-neutral' : 'clinic-editorial',
    density: 'balanced',
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
): SiteTheme {
  const resolved = resolveClinicMasterTheme(
    emptySiteConfig(new URL(artifact.seedUrl).hostname).theme,
    pin,
  );
  if (profile.locale === 'ko-KR') {
    return applyKoreanFontPairing(resolved, 'kr-nanum-myeongjo-readable');
  }
  return applyLatinFontPairing(resolved, {
    locale: 'en-US',
    id: 'us-clinical-neutral',
    assetVersion: 1,
    systemFallback: false,
    typographyPreset: pin.typographyPreset,
  });
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

interface HierarchyCluster {
  blocks: RobustClinicSourceBlock[];
  repeatedStructure: boolean;
}

const HIERARCHY_PRICE_OR_NUMBER = /^(?:[-+]?\d[\d,.]*(?:\s*(?:원|%))?|[₩$€¥£]\s*\d[\d,.]*)$/u;
const HIERARCHY_WIDGET_LABEL = /^(?:전체랭킹|실시간\s*(?:검색|인기\s*검색\s*순위)|검색|장바구니|전체메뉴|전체\s*메뉴)$/iu;

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
  if (/\n/u.test(block.text) && /(?:[₩$€¥£]|\d[\d,]*(?:\.\d+)?\s*(?:원|%))/u.test(block.text)) {
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

function sectionsForPage(input: {
  page: RobustClinicSourcePage;
  theme: SiteTheme;
  locale: ClinicEngineProfile['locale'];
}): { sections: Section[]; placedBlockIds: string[] } | null {
  if (input.page.accessFailure || input.page.targetBlocks.length === 0) return null;
  const title = input.page.metadataTitle ?? input.page.targetBlocks[0];
  const titleOwnsTargetBlock = input.page.targetBlocks.some((block) => block.id === title.id);
  const lead = input.page.metadataDescription
    ?? input.page.targetBlocks.find((block) => block.id !== title.id);
  const bodyBlocks = input.page.targetBlocks.filter((block) => (
    (!titleOwnsTargetBlock || block.id !== title.id)
    && block.id !== lead?.id
  ));
  const sections: Section[] = [buildClinicHeroSection({
    id: `${input.page.id}-hero`,
    name: input.locale === 'ko-KR' ? '소개' : 'Introduction',
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
      name: input.locale === 'ko-KR' ? '진료 안내' : 'Clinical information',
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
}): RobustClinicCompilation {
  const pin = masterPin(input.plan.profile, input.artifact);
  const theme = themeFor(input.plan.profile, input.artifact, pin);
  const claimedSlugs = new Set<string>();
  const pages: SitePage[] = [];
  const auditPages: RobustClinicCompilationAudit['pages'] = [];
  const brandRoute = input.plan.pages.flatMap((page) => (
    page.brandImages.map((image) => ({ image, sourcePageUrl: page.sourceUrl }))
  )).sort((left, right) => (
    (right.image.selectionScore ?? 0) - (left.image.selectionScore ?? 0)
  ))[0];
  for (const sourcePage of input.plan.pages) {
    const compiled = sectionsForPage({
      page: sourcePage,
      theme,
      locale: input.plan.profile.locale,
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
      });
      continue;
    }
    const slug = safeSlug(sourcePage.finalUrl, pages.length, claimedSlugs);
    const title = sourcePage.metadataTitle?.text
      ?? sourcePage.targetBlocks.find((block) => block.heading && block.text.length <= 200)?.text
      ?? (sourcePage.artifactPage.title && sourcePage.artifactPage.title.length <= 200
        ? sourcePage.artifactPage.title
        : sourcePage.targetBlocks.find((block) => block.text.length <= 200)?.text)
      ?? new URL(sourcePage.finalUrl).hostname;
    if (pages.length === 0 && brandRoute) {
      const hero = compiled.sections.find((section) => section.type === 'hero');
      hero?.elements.push(brandLogoElement(brandRoute.image));
    }
    pages.push({
      id: sourcePage.id,
      title,
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
      hueSeed: 210,
      overrides: {},
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
        ? { locale: 'en-US', market: 'US-CA', jurisdiction: 'US' }
        : {}),
    },
    pages,
    nav: { enabled: pages.length > 1 },
    motion: { presetId: 'clinic-premium', intensity: 'subtle' },
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
      pages: auditPages,
    },
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
  gateEvidence?: ClinicEngineGateEvidence;
}): RobustClinicCompilation {
  return runClinicEngine({
    profile: input.profile,
    value: {
      artifact: input.artifact,
      documents: input.documents,
      profile: input.profile,
    },
    extractSource: extractRobustClinicSource,
    splitPages: (source) => source,
    resolveLayouts: (plan) => compilePagePlan({ plan, artifact: input.artifact }),
    gateEvidence: () => input.gateEvidence ?? {},
  });
}
