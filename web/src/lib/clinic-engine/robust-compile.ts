import { createHash } from 'node:crypto';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyKoreanFontPairing,
  applyLatinFontPairing,
} from '@/lib/fonts/selection';
import { resolveClinicMasterTheme } from '@/lib/clinic-master/tokens';
import type {
  ClinicMasterPin,
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

function contentUnits(input: {
  blocks: readonly RobustClinicSourceBlock[];
  images: RobustClinicSourcePage['images'];
}): ClinicLayoutContentUnit[] {
  const units: ClinicLayoutContentUnit[] = [];
  let cursor = 0;
  let imageIndex = 0;
  while (cursor < input.blocks.length) {
    const title = input.blocks[cursor];
    const next = input.blocks[cursor + 1];
    const pairNext = Boolean(
      next
      && (
        title.heading
        || (!title.heading && !next.heading)
      ),
    );
    const body = pairNext ? next : undefined;
    const image = input.images[imageIndex];
    if (image) imageIndex += 1;
    units.push({
      id: `robust-unit-${title.id}`,
      title,
      ...(body ? { body } : {}),
      ...(image ? { image } : {}),
    });
    cursor += body ? 2 : 1;
  }
  return units;
}

function candidatesFor(units: readonly ClinicLayoutContentUnit[]) {
  if (
    units.length >= 3
    && units.length <= 8
    && units.every((unit) => /[?？]\s*$/u.test(unit.title.text) && Boolean(unit.body))
  ) {
    return ['features.faq-accordion', 'features.prose-article'] as const;
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
    sections.push(...buildClinicFeatureSections({
      id: `${input.page.id}-content-${Math.floor(offset / FEATURE_SECTION_MAXIMUM_UNITS) + 1}`,
      name: input.locale === 'ko-KR' ? '진료 안내' : 'Clinical information',
      units: chunk,
      theme: input.theme,
      candidates: candidatesFor(chunk),
      maximumItems: chunk.length > 6 ? FEATURE_SECTION_MAXIMUM_UNITS : 6,
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
