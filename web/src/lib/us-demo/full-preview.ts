import { createHash } from 'node:crypto';
import {
  isValidPageSlug,
  type CanvasElement,
  type Section,
  type SiteConfig,
  type SitePage,
  type SiteTheme,
} from '@/lib/types/site';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyDentalStockToClinicMaster,
  buildClinicCtaSection,
  buildClinicFaqSection,
  buildClinicFeatureSections,
  buildClinicGallerySections,
  buildClinicHeroSection,
  buildClinicStatStripSection,
  CLINIC_RADIUS_TOKENS,
  compilePremiumDentalMaster,
  dentalStockCategoryForSource,
  orderClinicServices,
  verifyClinicUsDestination,
  verifyClinicSourcePhone,
  type ClinicLayoutContentUnit,
  type ClinicLayoutImage,
  type ClinicMasterExperience,
  type ClinicSourcePhoneProjection,
  type DentalStockCategory,
} from '@/lib/clinic-master';
import type {
  ProspectPublicSourceBlock,
  ProspectPublicSourceImage,
  UsDemoRenderMode,
} from './contracts';
import {
  clinicPhotoGate,
  clinicPhotoPoolForTopic,
  clinicPhotoSlotPool,
  prospectPublicSourceImages,
  sourceImageIsBeforeAfter,
  sourceImageIsInsuranceLogo,
  sourceImageIsProvider,
  type ClinicImagePageTopic,
  type ProjectedUsDemoSourceImage,
} from './source-images';
import {
  prospectPublicSourceContentUnits,
  prospectPublicSourceOperationalStats,
  type ProspectPublicSourceContentUnit,
} from './source-extraction';

export type ClinicProcedureCategory =
  | 'implant'
  | 'orthodontic'
  | 'cosmetic-restorative'
  | 'preventive-general';

const CATEGORY_ORDER = [
  'implant',
  'orthodontic',
  'cosmetic-restorative',
  'preventive-general',
] as const satisfies readonly ClinicProcedureCategory[];

export const MIN_BLOCKS_FOR_INDIVIDUAL_PAGE = 3;

/** Matches the home practice gallery so one subpage cannot absorb the whole photo pool. */
const PROCEDURE_GALLERY_MAXIMUM = 12;

/**
 * Body budget for one procedure page, split between the feature units and the trailing gallery.
 * Without it a fallback pool of every eligible practice photo lands on the first subpage.
 */
export const PROCEDURE_BODY_IMAGE_BUDGET = 16;

const CATEGORY_META = Object.freeze({
  implant: { slug: 'implants', navLabel: 'Implants', stock: 'implant' },
  orthodontic: { slug: 'orthodontics', navLabel: 'Orthodontics', stock: 'orthodontic' },
  'cosmetic-restorative': {
    slug: 'cosmetic-restorative',
    navLabel: 'Cosmetic & Restorative',
    stock: 'cosmetic-restorative',
  },
  'preventive-general': {
    slug: 'preventive-dentistry',
    navLabel: 'Preventive Dentistry',
    stock: 'preventive-general',
  },
} as const satisfies Record<ClinicProcedureCategory, {
  slug: string;
  navLabel: string;
  stock: DentalStockCategory;
}>);

const IMPLANT_RE =
  /\b(?:dental\s+)?implants?\b|\ball[- ]on[- ](?:4|6)\b|\bfull[- ]arch\b/iu;
const ORTHODONTIC_RE =
  /\borthodont(?:ic|ics|ist)?\b|\bbraces\b|\binvisalign\b|\bclear aligners?\b/iu;
const COSMETIC_RE =
  /\bcosmetic\b|\bveneers?\b|\bwhitening\b|\brestorative\b|\bcrowns?\b|\bbridges?\b|\bdentures?\b/iu;

function procedureCategory(text: string): ClinicProcedureCategory {
  if (IMPLANT_RE.test(text)) return 'implant';
  if (ORTHODONTIC_RE.test(text)) return 'orthodontic';
  if (COSMETIC_RE.test(text)) return 'cosmetic-restorative';
  return 'preventive-general';
}

interface PlannedProcedurePage {
  category: ClinicProcedureCategory;
  blocks: ProspectPublicSourceBlock[];
  sourceUrls: Set<string>;
  sourceUrl?: string;
}

function sourceUrlParent(raw: string): string | undefined {
  const url = new URL(raw);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  segments.pop();
  url.pathname = segments.length > 0 ? `/${segments.join('/')}` : '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function nearestSourceParent(
  sourceUrl: string,
  knownUrls: ReadonlySet<string>,
): string | undefined {
  let parent = sourceUrlParent(sourceUrl);
  while (parent) {
    if (knownUrls.has(parent)) return parent;
    const next = sourceUrlParent(parent);
    if (!next || next === parent) return undefined;
    parent = next;
  }
  return undefined;
}

/**
 * A crawl page earns an individual demo page only with three source blocks. Thin pages merge into
 * their nearest crawled URL parent, then a factual service category, and finally Home.
 */
export function planProcedurePages(
  blocks: readonly ProspectPublicSourceBlock[],
): {
  pages: PlannedProcedurePage[];
  homeBlocks: ProspectPublicSourceBlock[];
} {
  const allByUrl = new Map<string, ProspectPublicSourceBlock[]>();
  for (const block of blocks) {
    const current = allByUrl.get(block.sourceUrl) ?? [];
    current.push(block);
    allByUrl.set(block.sourceUrl, current);
  }
  const servicesByUrl = new Map<string, ProspectPublicSourceBlock[]>();
  for (const block of blocks.filter((candidate) => candidate.kind === 'service')) {
    const current = servicesByUrl.get(block.sourceUrl) ?? [];
    current.push(block);
    servicesByUrl.set(block.sourceUrl, current);
  }
  const knownServiceUrls = new Set(servicesByUrl.keys());
  const aggregates = new Map<string, {
    blocks: ProspectPublicSourceBlock[];
    sourceUrls: Set<string>;
    sourceBlockCount: number;
  }>();
  const categoryBuckets = new Map<ClinicProcedureCategory, {
    blocks: ProspectPublicSourceBlock[];
    sourceUrls: Set<string>;
    sourceBlockCount: number;
  }>();

  const appendCategory = (
    category: ClinicProcedureCategory,
    sourceBlocks: readonly ProspectPublicSourceBlock[],
    sourceUrl: string,
    sourceBlockCount: number,
  ) => {
    const bucket = categoryBuckets.get(category) ?? {
      blocks: [],
      sourceUrls: new Set<string>(),
      sourceBlockCount: 0,
    };
    bucket.blocks.push(...sourceBlocks);
    bucket.sourceUrls.add(sourceUrl);
    bucket.sourceBlockCount += sourceBlockCount;
    categoryBuckets.set(category, bucket);
  };

  const pages: PlannedProcedurePage[] = [];
  const homeBlocks: ProspectPublicSourceBlock[] = [];
  for (const [sourceUrl, serviceBlocks] of servicesByUrl) {
    aggregates.set(sourceUrl, {
      blocks: [...(allByUrl.get(sourceUrl) ?? serviceBlocks)],
      sourceUrls: new Set([sourceUrl]),
      sourceBlockCount: allByUrl.get(sourceUrl)?.length ?? serviceBlocks.length,
    });
  }
  const urlsByDepth = [...servicesByUrl.keys()].sort((left, right) => (
    new URL(right).pathname.split('/').filter(Boolean).length
    - new URL(left).pathname.split('/').filter(Boolean).length
    || left.localeCompare(right)
  ));
  for (const sourceUrl of urlsByDepth) {
    const bucket = aggregates.get(sourceUrl)!;
    if (bucket.sourceBlockCount >= MIN_BLOCKS_FOR_INDIVIDUAL_PAGE) {
      pages.push({
        category: procedureCategory(bucket.blocks.map((block) => block.text).join(' ')),
        blocks: bucket.blocks,
        sourceUrls: bucket.sourceUrls,
        sourceUrl,
      });
      continue;
    }
    const parent = nearestSourceParent(sourceUrl, knownServiceUrls);
    if (parent) {
      const parentBucket = aggregates.get(parent)!;
      parentBucket.blocks.push(...bucket.blocks);
      bucket.sourceUrls.forEach((url) => parentBucket.sourceUrls.add(url));
      parentBucket.sourceBlockCount += bucket.sourceBlockCount;
      continue;
    }
    appendCategory(
      procedureCategory(bucket.blocks.map((block) => block.text).join(' ')),
      bucket.blocks,
      sourceUrl,
      bucket.sourceBlockCount,
    );
  }
  for (const category of CATEGORY_ORDER) {
    const bucket = categoryBuckets.get(category);
    if (!bucket) continue;
    if (bucket.sourceBlockCount >= MIN_BLOCKS_FOR_INDIVIDUAL_PAGE) {
      pages.push({
        category,
        blocks: bucket.blocks,
        sourceUrls: bucket.sourceUrls,
      });
    } else {
      homeBlocks.push(...bucket.blocks);
    }
  }
  pages.sort((left, right) => (
    CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
    || (left.sourceUrl ?? '').localeCompare(right.sourceUrl ?? '')
    || left.blocks[0].id.localeCompare(right.blocks[0].id)
  ));
  return { pages, homeBlocks };
}

function procedureSlug(
  plan: PlannedProcedurePage,
  used: Set<string>,
): string {
  const fallback = CATEGORY_META[plan.category].slug;
  const sourceSegment = plan.sourceUrl
    ? new URL(plan.sourceUrl).pathname.split('/').filter(Boolean).at(-1)
    : undefined;
  const normalized = sourceSegment
    ?.toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  let slug = normalized
    && isValidPageSlug(normalized)
    && !['about', 'contact'].includes(normalized)
    ? normalized
    : fallback;
  if (used.has(slug)) {
    const suffix = createHash('sha256')
      .update(plan.sourceUrl ?? plan.blocks.map((block) => block.id).join('|'), 'utf8')
      .digest('hex')
      .slice(0, 8);
    slug = `${slug.slice(0, 31)}-${suffix}`;
  }
  used.add(slug);
  return slug;
}

function section(input: {
  id: string;
  type: Section['type'];
  name: string;
  height: number;
  elements: CanvasElement[];
  theme: SiteTheme;
  surface?: boolean;
}): Section {
  return {
    id: input.id,
    type: input.type,
    name: input.name,
    height: input.height,
    layout: 'canvas',
    background: {
      color: input.surface ? input.theme.palette.surface : input.theme.palette.background,
    },
    elements: input.elements,
  };
}

function layoutImage(image: ProjectedUsDemoSourceImage): ClinicLayoutImage {
  return {
    id: image.source.id,
    src: image.source.url,
    alt: image.source.alt,
    ...(image.candidate.declaredWidth && image.candidate.declaredHeight
      ? {
          sourceWidth: image.candidate.declaredWidth,
          sourceHeight: image.candidate.declaredHeight,
        }
      : {}),
  };
}

function sourceLayoutImage(image: ProspectPublicSourceImage | undefined): ClinicLayoutImage | undefined {
  return image
    ? {
        id: image.id,
        src: image.url,
        alt: image.alt,
      }
    : undefined;
}

function insuranceStripSection(input: {
  id: string;
  images: readonly ProjectedUsDemoSourceImage[];
  theme: SiteTheme;
}): Section | null {
  const images = input.images.slice(0, 12);
  if (images.length === 0) return null;
  return section({
    id: input.id,
    type: 'custom',
    name: 'Accepted Insurance',
    height: 300,
    theme: input.theme,
    surface: true,
    elements: [
      {
        id: `${input.id}-title`,
        kind: 'text',
        text: 'Accepted Insurance',
        frame: { x: 0, y: 0, w: 1, h: 1 },
        z: 2,
        style: {
          fontSize: 40,
          fontWeight: 600,
          fontFamily: 'heading',
          color: input.theme.palette.text,
          lineHeight: 1.2,
        },
        entrance: { effect: 'none' },
      },
      ...images.map((image, index) => ({
        id: `source-image-${image.source.id}-insurance-${index}`,
        kind: 'image' as const,
        src: image.source.url,
        alt: image.source.alt,
        frame: { x: 0, y: 0, w: 1, h: 1 },
        z: 1,
        style: {
          objectFit: 'contain' as const,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
          shadow: false,
        },
        entrance: { effect: 'none' as const },
      })),
    ],
  });
}

const PROCESS_RE =
  /\b(?:step|process|consultation|placement|healing|recovery|procedure|what to expect)\b/iu;
const BENEFIT_RE =
  /\b(?:benefits?|advantages?|why choose|candidates?|improve|restore|comfort|confidence)\b/iu;
const LONG_PROSE_MINIMUM = 420;
type ClinicFeatureCandidates = Parameters<typeof buildClinicFeatureSections>[0]['candidates'];

/** The count is the matched real-photo pool remaining after the page hero is assigned. */
export function clinicProcedureMediaCandidates(
  remainingImageCount: number,
): ClinicFeatureCandidates {
  if (remainingImageCount >= 5) {
    return ['features.zigzag-media', 'features.featured-first', 'features.icon-grid'];
  }
  if (remainingImageCount >= 2) {
    return ['features.featured-first', 'features.three-column-cards', 'features.icon-grid'];
  }
  return ['features.icon-grid', 'features.sticky-heading-two-column', 'features.numbered-list'];
}

const CLINIC_PROSE_RESET_VARIANTS = new Set([
  'features.numbered-list',
  'features.icon-grid',
  'features.faq-accordion',
  'features.stat-strip',
]);

export function clinicSectionIsProse(section: Section): boolean {
  const resolvedId = section.sectionLayout?.resolvedId;
  if (!resolvedId || section.sectionLayout?.kind !== 'features') return false;
  if (CLINIC_PROSE_RESET_VARIANTS.has(resolvedId)) return false;
  return !section.elements.some((element) => (
    element.kind === 'image' || element.kind === 'video'
  ));
}

export function clinicMaximumConsecutiveProseSections(
  sections: readonly Section[],
): number {
  let current = 0;
  let maximum = 0;
  for (const section of sections) {
    current = clinicSectionIsProse(section) ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function isPreFooterCta(section: Section): boolean {
  return section.type === 'cta'
    || section.sectionLayout?.kind === 'cta'
    || section.sectionLayout?.resolvedId.startsWith('cta.') === true;
}

export function clinicSectionHasPlaceholder(section: Section): boolean {
  return /placeholder/iu.test(section.id)
    || section.elements.some((element) => (
      element.kind === 'image'
        ? /placeholder/iu.test(element.src)
        : element.kind === 'text'
          ? /\b(?:preview note|placeholder|can be added|can appear)\b/iu.test(element.text)
          : false
    ));
}

function tintPairFor(
  content: readonly Section[],
  darkIndex: number | undefined,
): readonly [number, number] | null {
  for (let index = 0; index < content.length - 1; index += 1) {
    if (index === darkIndex || index + 1 === darkIndex) continue;
    if (isPreFooterCta(content[index]) || isPreFooterCta(content[index + 1])) continue;
    return [index, index + 1];
  }
  return null;
}

/**
 * premium-dental-v1 opt-in cadence. Every section receives an enum, while Basic/non-clinic
 * configs never call this projector. Short pages stay semantic base; substantial pages gain one
 * isolated mid-page dark punctuation and a contiguous two-section tint block.
 */
export function applyClinicSurfaceCadence(pages: readonly SitePage[]): SitePage[] {
  return pages.map((page) => {
    const sections = page.sections.map((section) => ({
      ...section,
      surfaceTone: section.surfaceTone ?? section.sectionLayout?.surfaceTone ?? 'base' as const,
    }));
    const contentIndices = sections.flatMap((section, index) => (
      section.type === 'hero' ? [] : [index]
    ));
    if (contentIndices.length < 4) return { ...page, sections };

    const existingDarkContentIndex = contentIndices.findIndex((sectionIndex) => (
      sections[sectionIndex].surfaceTone === 'dark'
      && !isPreFooterCta(sections[sectionIndex])
      && !clinicSectionHasPlaceholder(sections[sectionIndex])
    ));
    const midpoint = Math.floor((contentIndices.length - 1) / 2);
    const content = contentIndices.map((index) => sections[index]);
    const regularDarkCandidates = [...contentIndices.keys()]
      .filter((contentIndex) => (
        contentIndex > 0
        && contentIndex < contentIndices.length - 1
        && !isPreFooterCta(sections[contentIndices[contentIndex]])
        && !clinicSectionHasPlaceholder(sections[contentIndices[contentIndex]])
      ));
    const fallbackDarkContentIndex = [...contentIndices.keys()]
      .filter((contentIndex) => (
        !clinicSectionHasPlaceholder(sections[contentIndices[contentIndex]])
        && (
          sections[contentIndices[contentIndex]].type === 'faq'
          || isPreFooterCta(sections[contentIndices[contentIndex]])
        )
      ))
      .sort((left, right) => (
        Math.abs(left - midpoint) - Math.abs(right - midpoint)
        || left - right
      ))[0];
    const darkContentIndex = existingDarkContentIndex >= 0
      ? existingDarkContentIndex
      : regularDarkCandidates
          .sort((left, right) => (
            Number(tintPairFor(content, left) === null)
            - Number(tintPairFor(content, right) === null)
            || Math.abs(left - midpoint) - Math.abs(right - midpoint)
            || left - right
          ))[0] ?? fallbackDarkContentIndex;

    const tintPair = tintPairFor(content, darkContentIndex);
    for (const [contentIndex, sectionIndex] of contentIndices.entries()) {
      const section = sections[sectionIndex];
      const requestedTone = contentIndex === darkContentIndex
        ? 'dark'
        : tintPair?.includes(contentIndex)
          ? 'tint'
          : isPreFooterCta(section)
            ? 'brand'
            : 'base';
      sections[sectionIndex] = { ...section, surfaceTone: requestedTone };
    }
    return { ...page, sections };
  });
}

function unitContext(unit: ProspectPublicSourceContentUnit): string {
  return `${unit.parentTitle?.text ?? ''} ${unit.title.text} ${unit.body?.text ?? ''}`;
}

function clinicLayoutUnit(
  unit: ProspectPublicSourceContentUnit,
  image: ProjectedUsDemoSourceImage | undefined,
  href?: string,
): ClinicLayoutContentUnit {
  return {
    id: unit.id,
    title: unit.title,
    ...(unit.body ? { body: unit.body } : {}),
    ...(image ? { image: layoutImage(image) } : {}),
    ...(href ? { href } : {}),
  };
}

function procedureContentSections(input: {
  id: string;
  name: string;
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
  theme: SiteTheme;
  bookingUrl?: string;
  phone?: string;
}): { sections: Section[]; usedImageIds: Set<string> } {
  const sourceUnits = prospectPublicSourceContentUnits(input.blocks);
  const images = input.images.filter((image) => !sourceImageIsInsuranceLogo(image));
  const buckets = {
    overview: [] as ProspectPublicSourceContentUnit[],
    process: [] as ProspectPublicSourceContentUnit[],
    benefits: [] as ProspectPublicSourceContentUnit[],
    long: [] as ProspectPublicSourceContentUnit[],
  };
  for (const unit of sourceUnits) {
    const context = unitContext(unit);
    if (PROCESS_RE.test(context)) buckets.process.push(unit);
    else if ((unit.body?.text.length ?? 0) >= LONG_PROSE_MINIMUM) buckets.long.push(unit);
    else if (BENEFIT_RE.test(context)) buckets.benefits.push(unit);
    else buckets.overview.push(unit);
  }
  const usedImageIds = new Set<string>();
  const imageByUnit = new Map<string, ProjectedUsDemoSourceImage>();
  [...buckets.overview, ...buckets.benefits].forEach((unit, index) => {
    const image = images[index];
    if (!image) return;
    imageByUnit.set(unit.id, image);
    usedImageIds.add(image.source.id);
  });
  const mediaCandidates = clinicProcedureMediaCandidates(images.length);
  const sections: Section[] = [];
  let proseRun = 0;
  const pushSection = (section: Section) => {
    sections.push(section);
    proseRun = clinicSectionIsProse(section) ? proseRun + 1 : 0;
  };
  const append = (
    key: keyof typeof buckets,
    name: string,
    candidates: Parameters<typeof buildClinicFeatureSections>[0]['candidates'],
    numbered = false,
  ) => {
    const units = buckets[key].map((unit) => clinicLayoutUnit(
      unit,
      imageByUnit.get(unit.id),
    ));
    const breakDeviceCandidates = proseRun >= 2 && units.length >= 2
      ? ['features.icon-grid' as const, ...candidates.filter(
          (candidate) => candidate !== 'features.icon-grid',
        )]
      : candidates;
    buildClinicFeatureSections({
      id: `${input.id}-${key}`,
      name,
      units,
      theme: input.theme,
      candidates: breakDeviceCandidates,
      titleSourceIdPrefix: 'procedure-service',
      numbered,
      surface: sections.length % 2 === 1,
    }).forEach(pushSection);
  };
  append(
    'overview',
    `${input.name} Overview`,
    mediaCandidates,
  );
  const operationalStats = prospectPublicSourceOperationalStats(input.blocks);
  const statStrip = buildClinicStatStripSection({
    id: `${input.id}-operational-stats`,
    name: 'Practice at a glance',
    theme: input.theme,
    units: operationalStats.map((stat) => ({
      id: stat.id,
      title: stat.title,
      marker: { source: stat.title, text: stat.marker },
    })),
  });
  if (statStrip) pushSection(statStrip);
  append(
    'process',
    'Treatment Process',
    ['features.numbered-list', 'features.sticky-heading-two-column', 'features.icon-grid'],
    true,
  );
  append(
    'benefits',
    'Treatment Benefits',
    mediaCandidates,
  );
  append(
    'long',
    `${input.name} Details`,
    ['features.sticky-heading-two-column', 'features.numbered-list', 'features.icon-grid'],
  );

  const questions = input.blocks.filter((block) => block.kind === 'faq_question');
  const answers = input.blocks.filter((block) => block.kind === 'faq_answer');
  const faq = buildClinicFaqSection({
    id: `${input.id}-faq`,
    name: 'Frequently Asked Questions',
    theme: input.theme,
    items: questions.map((question) => ({
      question,
      answer: answers.find((answer) => (
        answer.sourceUrl === question.sourceUrl
        && answer.sourceLocation.ordinal === question.sourceLocation.ordinal
      )),
    })),
  });
  if (faq) pushSection(faq);
  if (input.bookingUrl) {
    const ctaTitle = input.blocks.find((block) => block.kind === 'cta')
      ?? sourceUnits[0]?.title
      ?? input.blocks.find((block) => block.kind === 'service');
    if (ctaTitle) {
      pushSection(buildClinicCtaSection({
        id: `${input.id}-cta`,
        name: 'Book Appointment',
        theme: input.theme,
        title: ctaTitle,
        href: input.bookingUrl,
        ...(input.phone ? { phoneHref: `tel:${input.phone}` } : {}),
      }));
    }
  }
  return { sections, usedImageIds };
}

function firstHomeImage(
  artifact: CrawlArtifactPayload,
  images: readonly ProjectedUsDemoSourceImage[],
): ProjectedUsDemoSourceImage | undefined {
  const home = artifact.pages.find((page) => new URL(page.url).pathname === '/')
    ?? artifact.pages[0];
  const homeImages = images.filter((image) => (
    image.page.url === home?.url
    && !sourceImageIsProvider(image)
    && !sourceImageIsBeforeAfter(image)
    && !sourceImageIsInsuranceLogo(image)
  ));
  return homeImages.find((image) => image.candidate.role === 'atmosphere')
    ?? homeImages[0]
    ?? images.find((image) => (
      image.candidate.role === 'atmosphere'
      && !sourceImageIsProvider(image)
      && !sourceImageIsBeforeAfter(image)
      && !sourceImageIsInsuranceLogo(image)
    ));
}

function procedureImageTopic(
  plan: PlannedProcedurePage,
  slug: string,
): ClinicImagePageTopic {
  const routeContext = [
    slug,
    plan.sourceUrl ?? '',
  ].join(' ').replace(/[-_/]+/gu, ' ');
  if (/\b(?:emergency|toothache|urgent)\b/iu.test(routeContext)) return 'emergency';
  if (/\b(?:endodontics?|root canal)\b/iu.test(routeContext)) return 'endodontic';
  if (/\b(?:oral surgery|bone graft|extraction)\b/iu.test(routeContext)) return 'oral-surgery';
  if (/\b(?:porcelain veneer|veneers?)\b/iu.test(routeContext)) return 'porcelain-veneers';
  if (plan.category === 'implant') return 'implant';
  if (plan.category === 'orthodontic') return 'orthodontic';
  if (plan.category === 'cosmetic-restorative') return 'cosmetic-restorative';
  return 'contact';
}

function rotateSourceOrder<T>(items: readonly T[], offset: number): T[] {
  if (items.length < 2) return [...items];
  const normalized = offset % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function sourcePhoneFromBlocks(
  artifact: CrawlArtifactPayload,
  blocks: readonly ProspectPublicSourceBlock[],
): ClinicSourcePhoneProjection | undefined {
  const pageOrder = new Map(
    artifact.pages.map((page, index) => [page.url, index]),
  );
  const orderedPhones = blocks
    .filter((block) => block.kind === 'phone' && pageOrder.has(block.sourceUrl))
    .map((block) => ({ block, pageIndex: pageOrder.get(block.sourceUrl)! }))
    .sort((left, right) => (
      left.pageIndex - right.pageIndex
      || left.block.sourceLocation.ordinal - right.block.sourceLocation.ordinal
      || left.block.sourceLocation.field.localeCompare(right.block.sourceLocation.field)
      || left.block.id.localeCompare(right.block.id)
    ));
  for (const { block } of orderedPhones) {
    const verified = verifyClinicSourcePhone({
      sourceBlockId: block.id,
      sourceText: block.text,
      sourceSha256: block.originalSha256,
    });
    if (verified) return verified;
  }
  return undefined;
}

function previewExperience(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
}): Extract<ClinicMasterExperience, { mode: 'preview-full' }> {
  const sourcePhone = sourcePhoneFromBlocks(input.artifact, input.blocks);
  const bookingUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'us_booking')?.url;
  const googleMapsUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'google_maps')?.url;
  const destination = verifyClinicUsDestination({
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(sourcePhone ? { phone: sourcePhone.sourceText } : {}),
    ...(googleMapsUrl ? { googleMapsUrl } : {}),
  }) ?? undefined;
  const providers = input.blocks.filter((block) => block.kind === 'provider_bio');
  const providerPhotos = providers.flatMap((bio, index) => {
    const occurrence = providers.slice(0, index).filter(
      (candidate) => candidate.sourceUrl === bio.sourceUrl,
    ).length;
    const exactPageImages = input.images.filter((image) => (
      image.page.url === bio.sourceUrl
      && !sourceImageIsBeforeAfter(image)
      && clinicPhotoGate(image).eligibleForPhotoSlot
    ));
    const providerImages = exactPageImages.filter(sourceImageIsProvider);
    const photo = providerImages[occurrence] ?? exactPageImages[occurrence];
    return photo
      ? [{
          version: 1 as const,
          providerBioBlockId: bio.id,
          src: photo.source.url,
          alt: photo.source.alt,
          origin: 'prospect_public_source' as const,
          sourceImageId: photo.source.id,
        }]
      : [];
  });
  const beforeAfterImages = input.images
    .filter(sourceImageIsBeforeAfter)
    .slice(0, 8)
    .map((image) => ({
      sourceImageId: image.source.id,
      src: image.source.url,
      alt: image.source.alt,
    }));
  return {
    mode: 'preview-full',
    ...(destination ? { destination } : {}),
    ...(sourcePhone ? { sourcePhone } : {}),
    ...(providerPhotos.length > 0 ? { providerPhotos } : {}),
    ...(beforeAfterImages.length >= 2 ? { beforeAfterImages } : {}),
  };
}

function pageHeroHasImage(page: SitePage): boolean {
  return Boolean(page.sections.find((candidate) => candidate.type === 'hero')?.background.image);
}

function sourceIdsFromSections(sections: readonly Section[]): string[] {
  return sections.flatMap((item) => item.elements).flatMap((element) => {
    const match = /^source-image-(pps-image-[a-f0-9]{16}-\d+)-/u.exec(element.id);
    return match ? [match[1]] : [];
  });
}

function compilationDate(artifact: CrawlArtifactPayload): string {
  const observedAt = new Date(artifact.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('CLINIC_ARTIFACT_OBSERVED_AT_INVALID');
  }
  return observedAt.toISOString().slice(0, 10);
}

export interface FullPreviewCompilation {
  config: SiteConfig;
  experience: Extract<ClinicMasterExperience, { mode: UsDemoRenderMode }>;
  sourceImages: readonly ProspectPublicSourceImage[];
  usedImageIds: readonly string[];
}

export function compileUsMedicalFullPreview(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  baseConfig: SiteConfig;
  hospitalStableId: string;
  renderMode: UsDemoRenderMode;
}): FullPreviewCompilation {
  const { artifact, blocks, baseConfig, hospitalStableId, renderMode } = input;
  const theme = baseConfig.theme;
  const pin = baseConfig.clinicMaster;
  if (!pin) throw new Error('CLINIC_MASTER_PIN_REQUIRED');
  const projectedImages = prospectPublicSourceImages(artifact);
  const photoSlotPool = clinicPhotoSlotPool(projectedImages);
  const heroUseCounts = new Map<string, number>();
  let previousHeroImageId: string | undefined;
  const allocateHeroImage = (
    candidates: readonly ProjectedUsDemoSourceImage[],
  ): ProjectedUsDemoSourceImage | undefined => {
    const available = candidates.filter((candidate) => (
      candidate.source.id !== previousHeroImageId
      && (heroUseCounts.get(candidate.source.id) ?? 0) < 2
    ));
    available.sort((left, right) => (
      (heroUseCounts.get(left.source.id) ?? 0) - (heroUseCounts.get(right.source.id) ?? 0)
      || photoSlotPool.indexOf(left) - photoSlotPool.indexOf(right)
    ));
    const selected = available[0];
    if (!selected) {
      previousHeroImageId = undefined;
      return undefined;
    }
    heroUseCounts.set(selected.source.id, (heroUseCounts.get(selected.source.id) ?? 0) + 1);
    previousHeroImageId = selected.source.id;
    return selected;
  };
  const experience: Extract<ClinicMasterExperience, { mode: UsDemoRenderMode }> =
    renderMode === 'preview-full'
      ? previewExperience({
          artifact,
          blocks,
          images: projectedImages,
        })
      : outreachSafeExperienceFromArtifact({ artifact, blocks });
  const businessName = blocks.find((block) => block.kind === 'business_name')!;
  const articleAuthor = blocks.find((block) => block.kind === 'provider_name');
  const articleDateModified = compilationDate(artifact);
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const homeCandidate = firstHomeImage(artifact, photoSlotPool);
  const homeImage = allocateHeroImage(homeCandidate
    ? [
        homeCandidate,
        ...photoSlotPool.filter((image) => image !== homeCandidate),
      ]
    : photoSlotPool);
  const services = blocks.filter((block) => block.kind === 'service');
  const procedurePlan = planProcedurePages(blocks);
  const procedureCategoryCounts = new Map(CATEGORY_ORDER.map((category) => [
    category,
    procedurePlan.pages.filter((page) => page.category === category).length,
  ]));
  const usedProcedureSlugs = new Set<string>(['', 'about', 'contact']);
  const plannedPages = procedurePlan.pages.map((planned) => ({
    planned,
    slug: procedureSlug(planned, usedProcedureSlugs),
  }));
  const masterSections = compilePremiumDentalMaster({
    blocks,
    theme,
    pin,
    experience,
  }).map((candidate) => (
    candidate.type === 'hero' && homeImage
      ? buildClinicHeroSection({
          id: candidate.id,
          name: candidate.name,
          title: businessName,
          ...(introduction ? { lead: introduction } : {}),
          theme,
          image: sourceLayoutImage(homeImage.source),
          requestedId: 'hero.split-left',
        })
      : candidate
  ));
  const reservedImages = new Set([
    homeImage?.source.id,
    ...(experience.mode === 'preview-full'
      ? experience.providerPhotos?.map((photo) => photo.sourceImageId) ?? []
      : []),
    ...(experience.mode === 'preview-full'
      ? experience.beforeAfterImages?.map((image) => image.sourceImageId) ?? []
      : []),
  ].filter((id): id is string => Boolean(id)));
  const homeServiceImageIds = new Set<string>();
  const homeServiceUnits = plannedPages.slice(0, 12).flatMap(({ planned, slug }) => {
    const orderedServices = orderClinicServices(
      planned.blocks.filter((block) => block.kind === 'service'),
      pin.focus,
    );
    const title = orderedServices.find((block) => (
      block.kind === 'service' && block.text.length <= 72
    )) ?? orderedServices[0];
    if (!title) return [];
    const body = planned.blocks.find((block) => (
      block.kind === 'service_detail' && block.sourceUrl === title.sourceUrl
    ));
    const topic = procedureImageTopic(planned, slug);
    const image = clinicPhotoPoolForTopic(projectedImages, topic).find((candidate) => (
      !homeServiceImageIds.has(candidate.source.id)
      && candidate.source.id !== homeImage?.source.id
    ));
    if (image) homeServiceImageIds.add(image.source.id);
    return [{
      id: `clinic-home-summary-${slug}`,
      title,
      ...(body ? { body } : {}),
      ...(image ? { image: layoutImage(image) } : {}),
      href: `/${slug}`,
    }];
  });
  const homeServiceSections = buildClinicFeatureSections({
    id: 'us-demo-services',
    name: 'Services',
    units: homeServiceUnits,
    theme,
    candidates: homeServiceUnits.some((unit) => unit.image)
      ? ['features.three-column-cards', 'features.icon-grid']
      : ['features.icon-grid', 'features.three-column-cards'],
  });
  const gallerySections = buildClinicGallerySections({
    id: 'clinic-practice-gallery',
    name: 'Practice Gallery',
    images: photoSlotPool
      .filter((image) => (
        !reservedImages.has(image.source.id)
        && !homeServiceImageIds.has(image.source.id)
        && !sourceImageIsInsuranceLogo(image)
      ))
      .slice(0, 12)
      .map(layoutImage),
    theme,
    surface: true,
    candidates: ['gallery.uniform-grid'],
  });
  const homeGalleryImageIds = new Set(
    gallerySections
      .flatMap((candidate) => candidate.elements)
      .flatMap((element) => (element.kind === 'image' ? [element.src] : []))
      .flatMap((src) => {
        const match = photoSlotPool.find((image) => image.source.url === src);
        return match ? [match.source.id] : [];
      }),
  );
  /**
   * Topic matching reads filenames and alt text, which most practices never write in treatment
   * terms, so a thin match is the normal case rather than a signal that the practice has no usable
   * photography. The hero still prefers a topic match, but the body falls back to the rest of the
   * eligible pool — least-committed first — so a subpage keeps the practice's own photographs
   * instead of dropping to a single stock hero.
   */
  const committedImageIds = new Set([
    ...reservedImages,
    ...homeServiceImageIds,
    ...homeGalleryImageIds,
  ]);
  const topicPhotoPool = (topic: ClinicImagePageTopic): {
    hero: ProjectedUsDemoSourceImage[];
    body: ProjectedUsDemoSourceImage[];
  } => {
    const matched = clinicPhotoPoolForTopic(projectedImages, topic);
    const matchedIds = new Set(matched.map((image) => image.source.id));
    const rest = photoSlotPool.filter((image) => (
      !matchedIds.has(image.source.id) && !sourceImageIsInsuranceLogo(image)
    ));
    const broadened = [
      ...matched,
      ...rest.filter((image) => !committedImageIds.has(image.source.id)),
      ...rest.filter((image) => committedImageIds.has(image.source.id)),
    ];
    return {
      hero: matched.length > 0 ? matched : broadened,
      body: broadened,
    };
  };
  const insuranceLogos = projectedImages.filter(sourceImageIsInsuranceLogo);
  const homeInsuranceStrip = insuranceStripSection({
    id: 'clinic-accepted-insurance',
    images: insuranceLogos,
    theme,
  });
  const homeFaqQuestions = blocks
    .filter((block) => block.kind === 'faq_question')
    .slice(0, 4);
  const allFaqQuestions = blocks.filter((block) => block.kind === 'faq_question');
  const allFaqAnswers = blocks.filter((block) => block.kind === 'faq_answer');
  const homeFaq = buildClinicFaqSection({
    id: 'clinic-home-faq',
    name: 'Frequently Asked Questions',
    theme,
    items: homeFaqQuestions.map((question) => {
      const originalIndex = allFaqQuestions.indexOf(question);
      const occurrence = allFaqQuestions.slice(0, originalIndex).filter(
        (candidate) => candidate.sourceUrl === question.sourceUrl,
      ).length;
      return {
        question,
        answer: allFaqAnswers.filter(
          (candidate) => candidate.sourceUrl === question.sourceUrl,
        )[occurrence],
      };
    }),
  });
  const homeCta = buildClinicCtaSection({
    id: 'clinic-home-cta',
    name: 'Book Appointment',
    theme,
    title: introduction ?? businessName,
    href: '#clinic-home-faq',
    candidates: ['cta.fullwidth-band'],
  });
  const homeHero = masterSections.find((candidate) => candidate.type === 'hero');
  const providerTeaser = masterSections.find(
    (candidate) => candidate.id === 'us-demo-providers',
  );
  const beforeAfter = masterSections.filter(
    (candidate) => (
      candidate.id.startsWith('clinic-before-after-preview-full')
      || candidate.id === 'clinic-before-after-placeholder'
    ),
  );
  const ratingAggregate = masterSections.find(
    (candidate) => candidate.id === 'clinic-rating-aggregate',
  );
  const insurancePricing = masterSections.find(
    (candidate) => candidate.id === 'clinic-insurance-pricing',
  );
  const homeLocation = masterSections.find(
    (candidate) => candidate.id === 'us-demo-contact',
  );
  const homeSections = [
    ...(homeHero ? [homeHero] : []),
    ...homeServiceSections,
    ...(providerTeaser ? [providerTeaser] : []),
    ...(ratingAggregate ? [ratingAggregate] : []),
    ...gallerySections.slice(0, 1),
    ...beforeAfter.slice(0, 1),
    ...(homeInsuranceStrip
      ? [homeInsuranceStrip]
      : insurancePricing
        ? [insurancePricing]
        : []),
    ...(homeLocation ? [homeLocation] : []),
    ...(homeFaq ? [homeFaq] : []),
    homeCta,
  ];
  const pages: SitePage[] = [{
    id: 'clinic-home-v2',
    title: 'Home',
    slug: '',
    sections: homeSections,
  }];

  for (const [pageIndex, { planned, slug }] of plannedPages.entries()) {
    const { category, blocks: pageSourceBlocks, sourceUrls } = planned;
    const categoryServices = orderClinicServices(
      pageSourceBlocks.filter((block) => block.kind === 'service'),
      pin.focus,
    );
    const meta = CATEGORY_META[category];
    const displayTitle = categoryServices.find((block) => block.text.length <= 60)?.text
      ?? meta.navLabel;
    const pageTopic = procedureImageTopic(planned, slug);
    const categoryImages = topicPhotoPool(pageTopic);
    const heroImage = allocateHeroImage(categoryImages.hero);
    const bodyImages = rotateSourceOrder(
      categoryImages.body.filter((image) => image.source.id !== heroImage?.source.id),
      pageIndex,
    ).slice(0, PROCEDURE_BODY_IMAGE_BUDGET);
    const detail = procedureContentSections({
      id: `clinic-procedure-${category}-details`,
      name: displayTitle,
      blocks: pageSourceBlocks,
      images: bodyImages,
      theme,
      bookingUrl: '#clinic-sticky-booking',
    });
    const galleryImages = bodyImages
      .filter((image) => !detail.usedImageIds.has(image.source.id))
      .slice(0, PROCEDURE_GALLERY_MAXIMUM);
    const gallery = buildClinicGallerySections({
      id: `clinic-procedure-${category}-gallery`,
      name: `${meta.navLabel} Gallery`,
      images: galleryImages.map(layoutImage),
      theme,
      surface: true,
      candidates: ['gallery.uniform-grid'],
    });
    for (const id of detail.usedImageIds) committedImageIds.add(id);
    for (const image of galleryImages) committedImageIds.add(image.source.id);
    if (heroImage) committedImageIds.add(heroImage.source.id);
    pages.push({
      id: `clinic-procedure-${category}-${createHash('sha256')
        .update(planned.sourceUrl ?? [...sourceUrls].join('|'), 'utf8')
        .digest('hex')
        .slice(0, 8)}`,
      title: displayTitle,
      navLabel: (procedureCategoryCounts.get(category) ?? 0) > 1
        ? displayTitle
        : meta.navLabel,
      slug,
      sections: [
        buildClinicHeroSection({
          id: `clinic-procedure-${category}-hero`,
          title: categoryServices[0],
          ...(categoryServices[1] ? { lead: categoryServices[1] } : {}),
          ...(articleAuthor
            ? {
                articleEvidence: {
                  author: articleAuthor,
                  dateModified: articleDateModified,
                },
              }
            : {}),
          theme,
          image: sourceLayoutImage(heroImage?.source),
          requestedId: 'hero.split-left',
        }),
        ...detail.sections,
        ...gallery,
      ],
    });
  }

  const providerSections = masterSections.filter(
    (candidate) => candidate.id.startsWith('us-demo-providers'),
  );
  const providerTitle = blocks.find((block) => block.kind === 'provider_name') ?? businessName;
  if (providerSections.length > 0) {
    const providerImage = allocateHeroImage(projectedImages.filter((image) => (
      experience.mode === 'preview-full'
      && experience.providerPhotos?.some((photo) => photo.sourceImageId === image.source.id)
      && clinicPhotoGate(image).eligibleForPhotoSlot
    )));
    pages.push({
      id: 'clinic-about',
      title: 'About',
      slug: 'about',
      sections: [
        buildClinicHeroSection({
          id: 'clinic-about-hero',
          title: providerTitle,
          ...(blocks.find((block) => block.kind === 'provider_bio')
            ? { lead: blocks.find((block) => block.kind === 'provider_bio') }
            : {}),
          theme,
          image: sourceLayoutImage(providerImage?.source),
          requestedId: 'hero.split-left',
        }),
        ...providerSections,
      ],
    });
  }

  const contactSections = masterSections.filter((candidate) => (
    candidate.id === 'clinic-insurance-pricing'
    || candidate.id === 'us-demo-contact'
    || candidate.id === 'clinic-faq'
  ));
  if (contactSections.length > 0) {
    const contactTitle = blocks.find((block) => block.kind === 'address') ?? businessName;
    const contactPageUrls = new Set(
      blocks
        .filter((block) => (
          ['insurance', 'price_or_financing', 'phone', 'address', 'opening_hours', 'faq_question', 'faq_answer']
            .includes(block.kind)
        ))
        .map((block) => block.sourceUrl),
    );
    const contactTopicPool = topicPhotoPool('contact');
    const contactOnPage = contactTopicPool.hero.filter(
      (image) => contactPageUrls.size === 0 || contactPageUrls.has(image.page.url),
    );
    const contactImage = allocateHeroImage(
      contactOnPage.length > 0 ? contactOnPage : contactTopicPool.body,
    );
    const contactInsuranceStrip = insuranceStripSection({
      id: 'clinic-accepted-insurance',
      images: insuranceLogos,
      theme,
    });
    pages.push({
      id: 'clinic-contact',
      title: 'Contact',
      slug: 'contact',
      sections: [
        buildClinicHeroSection({
          id: 'clinic-contact-hero',
          title: contactTitle,
          ...(introduction ? { lead: introduction } : {}),
          theme,
          image: sourceLayoutImage(contactImage?.source),
          requestedId: 'hero.split-left',
        }),
        ...(contactInsuranceStrip ? [contactInsuranceStrip] : []),
        ...contactSections,
      ],
    });
  }

  let config: SiteConfig = {
    ...baseConfig,
    pages,
    nav: { enabled: true },
  };
  const stockHeroUseCounts = new Map<string, number>();
  let previousStockHeroAssetId: string | undefined;
  for (const page of pages) {
    if (pageHeroHasImage(page)) {
      previousStockHeroAssetId = undefined;
      continue;
    }
    const procedure = CATEGORY_ORDER.find((category) => (
      page.id.startsWith(`clinic-procedure-${category}-`)
    ));
    const category = procedure
      ? CATEGORY_META[procedure].stock
      : page.id === 'clinic-home-v2'
        ? dentalStockCategoryForSource(pin.focus, services.map((block) => block.text).join(' '))
        : 'bright-interior';
    config = applyDentalStockToClinicMaster(config, {
      hospitalStableId,
      category,
      slot: 'hero',
      pageSlug: page.slug,
      selectionSalt: `page:${page.slug || 'home'}`,
      excludedAssetIds: [
        ...(previousStockHeroAssetId ? [previousStockHeroAssetId] : []),
        ...[...stockHeroUseCounts.entries()]
          .filter(([, count]) => count >= 2)
          .map(([assetId]) => assetId),
      ],
    });
    const stockHeroUrl = config.pages
      .find((candidate) => candidate.slug === page.slug)
      ?.sections.find((candidate) => candidate.type === 'hero')
      ?.background.image?.src;
    const stockHeroAssetId = stockHeroUrl
      ? config.assetRefs?.find((ref) => ref.url === stockHeroUrl)?.assetId
      : undefined;
    previousStockHeroAssetId = stockHeroAssetId;
    if (stockHeroAssetId) {
      stockHeroUseCounts.set(
        stockHeroAssetId,
        (stockHeroUseCounts.get(stockHeroAssetId) ?? 0) + 1,
      );
    }
  }
  config = {
    ...config,
    pages: applyClinicSurfaceCadence(config.pages),
  };

  const sourceByUrl = new Map(projectedImages.map((image) => [image.source.url, image.source.id]));
  const usedImageIds = new Set(config.pages.flatMap((page) => [
    ...sourceIdsFromSections(page.sections),
    ...page.sections.flatMap((candidate) => {
      const sourceId = candidate.background.image
        ? sourceByUrl.get(candidate.background.image.src)
        : undefined;
      return sourceId ? [sourceId] : [];
    }),
  ]));
  return {
    config,
    experience,
    sourceImages: projectedImages.map((image) => image.source),
    usedImageIds: [...usedImageIds],
  };
}

export function previewFullExperienceFromArtifact(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
}): Extract<ClinicMasterExperience, { mode: 'preview-full' }> {
  return previewExperience({
    ...input,
    images: prospectPublicSourceImages(input.artifact),
  }) as Extract<ClinicMasterExperience, { mode: 'preview-full' }>;
}

export function outreachSafeExperienceFromArtifact(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
}): Extract<ClinicMasterExperience, { mode: 'outreach-safe' }> {
  const sourcePhone = sourcePhoneFromBlocks(input.artifact, input.blocks);
  return {
    mode: 'outreach-safe',
    ...(sourcePhone ? { sourcePhone } : {}),
  };
}
