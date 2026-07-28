import { createHash } from 'node:crypto';
import {
  isValidPageSlug,
  type CanvasElement,
  type Frame,
  type Section,
  type SiteConfig,
  type SitePage,
  type SiteTheme,
  type TextElement,
} from '@/lib/types/site';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyDentalStockToClinicMaster,
  compilePremiumDentalMaster,
  dentalStockCategoryForSource,
  verifyClinicUsDestination,
  type ClinicMasterExperience,
  type ClinicMasterSourceBlock,
  type DentalStockCategory,
} from '@/lib/clinic-master';
import { CLINIC_RADIUS_TOKENS } from '@/lib/clinic-master/tokens';
import type {
  ProspectPublicSourceBlock,
  ProspectPublicSourceImage,
} from './contracts';
import {
  prospectPublicSourceImages,
  sourceImageIsBeforeAfter,
  sourceImageIsProvider,
  type ProjectedUsDemoSourceImage,
} from './source-images';

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

function sourceTextElement(
  block: ClinicMasterSourceBlock,
  suffix: string,
  frame: Frame,
  style: TextElement['style'],
): TextElement {
  return {
    id: `source-${block.id}-${suffix}`,
    kind: 'text',
    frame,
    z: 2,
    text: block.text,
    style,
    entrance: { effect: 'none' },
  };
}

function section(input: {
  id: string;
  type: Section['type'];
  name: string;
  height: number;
  elements: CanvasElement[];
  theme: SiteTheme;
  surface?: boolean;
  heroImage?: ProspectPublicSourceImage;
}): Section {
  return {
    id: input.id,
    type: input.type,
    name: input.name,
    height: input.height,
    layout: 'canvas',
    background: {
      color: input.surface ? input.theme.palette.surface : input.theme.palette.background,
      ...(input.heroImage
        ? {
            image: {
              src: input.heroImage.url,
              overlayColor: input.theme.palette.background,
              overlayOpacity: 0.78,
            },
          }
        : {}),
    },
    elements: input.elements,
  };
}

function heroSection(input: {
  id: string;
  title: ClinicMasterSourceBlock;
  lead?: ClinicMasterSourceBlock;
  theme: SiteTheme;
  image?: ProspectPublicSourceImage;
}): Section {
  return section({
    id: input.id,
    type: 'hero',
    name: 'Introduction',
    height: 760,
    theme: input.theme,
    heroImage: input.image,
    elements: [
      sourceTextElement(input.title, 'page-title', { x: 110, y: 190, w: 1050, h: 190 }, {
        fontSize: 76,
        fontWeight: 600,
        fontFamily: 'heading',
        color: input.theme.palette.text,
        lineHeight: 1.08,
        readabilityGuard: 'long-hero',
      }),
      ...(input.lead
        ? [sourceTextElement(input.lead, 'page-lead', { x: 116, y: 430, w: 820, h: 150 }, {
            fontSize: 25,
            fontWeight: 400,
            fontFamily: 'body',
            color: input.theme.palette.muted,
            lineHeight: 1.55,
          })]
        : []),
    ],
  });
}

function sourceGallerySection(input: {
  id: string;
  name: string;
  images: readonly ProjectedUsDemoSourceImage[];
  theme: SiteTheme;
}): Section | null {
  const images = input.images.slice(0, 8);
  if (images.length === 0) return null;
  return section({
    id: input.id,
    type: 'gallery',
    name: input.name,
    height: Math.max(620, 160 + Math.ceil(images.length / 2) * 360),
    theme: input.theme,
    surface: true,
    elements: images.map((image, index) => ({
      id: `source-image-${image.source.id}-gallery-${index}`,
      kind: 'image' as const,
      src: image.source.url,
      alt: image.source.alt,
      frame: {
        x: index % 2 === 0 ? 140 : 760,
        y: 100 + Math.floor(index / 2) * 360,
        w: 540,
        h: 320,
      },
      z: 1,
      style: {
        objectFit: 'cover' as const,
        borderRadius: CLINIC_RADIUS_TOKENS.md,
        shadow: false,
      },
      entrance: { effect: 'none' as const },
    })),
  });
}

function sourceImageContext(image: ProjectedUsDemoSourceImage): string {
  return [
    new URL(image.page.url).pathname.replace(/[-_/]+/gu, ' '),
    image.page.title ?? '',
    image.candidate.alt,
  ].join(' ');
}

function exactPageImages(
  images: readonly ProjectedUsDemoSourceImage[],
  sourceUrls: ReadonlySet<string>,
): ProjectedUsDemoSourceImage[] {
  return images.filter((image) => sourceUrls.has(image.page.url));
}

function firstHomeImage(
  artifact: CrawlArtifactPayload,
  images: readonly ProjectedUsDemoSourceImage[],
): ProjectedUsDemoSourceImage | undefined {
  const home = artifact.pages.find((page) => new URL(page.url).pathname === '/')
    ?? artifact.pages[0];
  const homeImages = images.filter((image) => image.page.url === home?.url);
  return homeImages.find((image) => image.candidate.role === 'atmosphere')
    ?? homeImages[0]
    ?? images.find((image) => (
      image.candidate.role === 'atmosphere'
      && !sourceImageIsProvider(image)
      && !sourceImageIsBeforeAfter(image)
    ));
}

function previewExperience(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
}): ClinicMasterExperience {
  const bookingUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'us_booking')?.url;
  const googleMapsUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'google_maps')?.url;
  const destination = verifyClinicUsDestination({
    ...(bookingUrl ? { bookingUrl } : {}),
    phone: input.blocks.find((block) => block.kind === 'phone')?.text,
    ...(googleMapsUrl ? { googleMapsUrl } : {}),
  }) ?? undefined;
  const providers = input.blocks.filter((block) => block.kind === 'provider_bio');
  const providerPhotos = providers.flatMap((bio, index) => {
    const occurrence = providers.slice(0, index).filter(
      (candidate) => candidate.sourceUrl === bio.sourceUrl,
    ).length;
    const exactPageImages = input.images.filter((image) => (
      image.page.url === bio.sourceUrl && !sourceImageIsBeforeAfter(image)
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

export interface FullPreviewCompilation {
  config: SiteConfig;
  experience: Extract<ClinicMasterExperience, { mode: 'preview-full' }>;
  sourceImages: readonly ProspectPublicSourceImage[];
  usedImageIds: readonly string[];
}

export function compileUsMedicalFullPreview(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  baseConfig: SiteConfig;
  hospitalStableId: string;
}): FullPreviewCompilation {
  const { artifact, blocks, baseConfig, hospitalStableId } = input;
  const theme = baseConfig.theme;
  const pin = baseConfig.clinicMaster;
  if (!pin) throw new Error('CLINIC_MASTER_PIN_REQUIRED');
  const projectedImages = prospectPublicSourceImages(artifact);
  const experience = previewExperience({
    artifact,
    blocks,
    images: projectedImages,
  }) as Extract<ClinicMasterExperience, { mode: 'preview-full' }>;
  const businessName = blocks.find((block) => block.kind === 'business_name')!;
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const homeImage = firstHomeImage(artifact, projectedImages);
  const masterSections = compilePremiumDentalMaster({
    blocks,
    theme,
    pin,
    experience,
  }).map((candidate) => (
    candidate.type === 'hero' && homeImage
      ? {
          ...candidate,
          background: {
            ...candidate.background,
            image: {
              src: homeImage.source.url,
              overlayColor: theme.palette.background,
              overlayOpacity: 0.78,
            },
          },
        }
      : candidate
  ));
  const reservedImages = new Set([
    homeImage?.source.id,
    ...(experience.providerPhotos?.map((photo) => photo.sourceImageId) ?? []),
    ...(experience.beforeAfterImages?.map((image) => image.sourceImageId) ?? []),
  ].filter((id): id is string => Boolean(id)));
  const homeGallery = sourceGallerySection({
    id: 'clinic-practice-gallery',
    name: 'Practice Gallery',
    images: projectedImages.filter((image) => !reservedImages.has(image.source.id)),
    theme,
  });
  const homeSections = homeGallery
    ? [
        ...masterSections.slice(0, 2),
        homeGallery,
        ...masterSections.slice(2),
      ]
    : masterSections;
  const pages: SitePage[] = [{
    id: 'clinic-home-v2',
    title: 'Home',
    slug: '',
    sections: homeSections,
  }];

  const services = blocks.filter((block) => block.kind === 'service');
  const procedurePlan = planProcedurePages(blocks);
  const procedureCategoryCounts = new Map(CATEGORY_ORDER.map((category) => [
    category,
    procedurePlan.pages.filter((page) => page.category === category).length,
  ]));
  const usedProcedureSlugs = new Set<string>(['', 'about', 'contact']);
  for (const planned of procedurePlan.pages) {
    const { category, blocks: pageSourceBlocks, sourceUrls } = planned;
    const categoryServices = pageSourceBlocks.filter((block) => block.kind === 'service');
    const meta = CATEGORY_META[category];
    const displayTitle = categoryServices.find((block) => block.text.length <= 60)?.text
      ?? meta.navLabel;
    const slug = procedureSlug(planned, usedProcedureSlugs);
    const exactImages = exactPageImages(projectedImages, sourceUrls)
      .filter((image) => !sourceImageIsProvider(image) && !sourceImageIsBeforeAfter(image));
    const contextualImages = projectedImages.filter((image) => (
      procedureCategory(sourceImageContext(image)) === category
      && !sourceImageIsProvider(image)
      && !sourceImageIsBeforeAfter(image)
    ));
    const categoryImages = [...new Map(
      [...exactImages, ...contextualImages].map((image) => [image.source.id, image]),
    ).values()];
    const heroImage = categoryImages[0];
    const detail = section({
      id: `clinic-procedure-${category}-details`,
      type: 'features',
      name: meta.navLabel,
      height: Math.max(560, 180 + pageSourceBlocks.length * 120),
      theme,
      elements: pageSourceBlocks.map((block, index) => sourceTextElement(
        block,
        block.kind === 'service'
          ? `procedure-service-${category}-${index}`
          : `procedure-source-${category}-${index}`,
        { x: 180, y: 120 + index * 120, w: 1080, h: 88 },
        {
          fontSize: 28,
          fontWeight: 600,
          fontFamily: 'heading',
          color: theme.palette.text,
          lineHeight: 1.35,
        },
      )),
    });
    const gallery = sourceGallerySection({
      id: `clinic-procedure-${category}-gallery`,
      name: `${meta.navLabel} Gallery`,
      images: categoryImages.slice(1),
      theme,
    });
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
        heroSection({
          id: `clinic-procedure-${category}-hero`,
          title: categoryServices[0],
          lead: categoryServices[1],
          theme,
          image: heroImage?.source,
        }),
        detail,
        ...(gallery ? [gallery] : []),
      ],
    });
  }

  const providerSection = masterSections.find((candidate) => candidate.id === 'us-demo-providers');
  const providerTitle = blocks.find((block) => block.kind === 'provider_name') ?? businessName;
  if (providerSection) {
    const providerImage = projectedImages.find((image) => (
      experience.providerPhotos?.some((photo) => photo.sourceImageId === image.source.id)
    ));
    pages.push({
      id: 'clinic-about',
      title: 'About',
      slug: 'about',
      sections: [
        heroSection({
          id: 'clinic-about-hero',
          title: providerTitle,
          lead: blocks.find((block) => block.kind === 'provider_bio'),
          theme,
          image: providerImage?.source,
        }),
        providerSection,
      ],
    });
  }

  const contactSections = masterSections.filter((candidate) => (
    candidate.id === 'clinic-insurance-pricing' || candidate.id === 'us-demo-contact'
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
    const contactImage = exactPageImages(projectedImages, contactPageUrls)
      .find((image) => !sourceImageIsProvider(image) && !sourceImageIsBeforeAfter(image));
    pages.push({
      id: 'clinic-contact',
      title: 'Contact',
      slug: 'contact',
      sections: [
        heroSection({
          id: 'clinic-contact-hero',
          title: contactTitle,
          lead: introduction,
          theme,
          image: contactImage?.source,
        }),
        ...contactSections,
      ],
    });
  }

  let config: SiteConfig = {
    ...baseConfig,
    pages,
    nav: { enabled: true },
  };
  for (const page of pages) {
    if (pageHeroHasImage(page)) continue;
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
    });
  }

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
