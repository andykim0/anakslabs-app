import { createHash } from 'node:crypto';
import {
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';
import {
  applyModernKoreanFontPairing,
  resolveFontPairingForLocale,
} from '@/lib/fonts';
import {
  buildClinicFeatureSections,
  buildClinicGallerySections,
  buildClinicHeroSection,
  buildClinicDirectionsSection,
  resolveClinicMasterTheme,
  type ClinicLayoutContentUnit,
  type ClinicLayoutImage,
  type ClinicMasterSourceBlock,
} from '@/lib/clinic-master';
import {
  MEDICAL_AD_POLICY_VERSION,
  screenMedicalCopy,
} from '@/lib/content/medical-ad-policy';
import {
  isValidPageSlug,
  type ClinicMasterPin,
  type Section,
  type SiteConfig,
  type SitePage,
} from '@/lib/types/site';
import type {
  KoClinicAdDiagnostic,
  KoClinicCompilation,
  KoClinicExtractedPage,
  KoClinicOptimizedImage,
  KoClinicPublicationHold,
  KoClinicSourceBlock,
} from './contracts';

const KO_CLINIC_DNA_ID = 'medical-clinical-clarity' as const;
const KO_CLINIC_HUE_SEED = 205;
const BOARD_LABELS = Object.freeze({
  customer: '고객의 소리',
  edu: '학술활동',
  news: '공지사항',
  photo: '이담with스타',
  praise: '칭찬합니다',
  pub_counsel: '전문의상담',
  story: '이벤트',
  tv: '이담미디어',
} as const);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSourceUrl(raw: string): string {
  const url = new URL(raw);
  url.protocol = 'https:';
  url.hostname = 'edomclinic.com';
  url.port = '';
  url.hash = '';
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  ));
  url.search = '';
  for (const [key, value] of entries) url.searchParams.append(key, value);
  if (url.pathname === '/main.php') url.pathname = '/';
  return url.toString();
}

function sourceBlock(block: KoClinicSourceBlock): ClinicMasterSourceBlock {
  return {
    id: block.id,
    kind: block.kind === 'page_title' ? 'service' : 'service_detail',
    text: block.text,
    sourceUrl: block.sourceUrl,
  };
}

function sourceLabelBlock(block: KoClinicSourceBlock): ClinicMasterSourceBlock | undefined {
  if (!block.sourceLabel) return undefined;
  return {
    id: `${block.id}-source-label`,
    kind: 'service',
    text: block.sourceLabel,
    sourceUrl: block.sourceUrl,
  };
}

function joinedSourceBlock(input: {
  id: string;
  blocks: readonly KoClinicSourceBlock[];
}): ClinicMasterSourceBlock | undefined {
  if (input.blocks.length === 0) return undefined;
  return {
    id: input.id,
    kind: 'service_detail',
    text: input.blocks.map((block) => block.text).join('\n\n'),
    sourceUrl: input.blocks[0].sourceUrl,
  };
}

function systemChromeBlock(id: string, text: string): ClinicMasterSourceBlock {
  return {
    id: `ko-ui-${id}`,
    kind: 'service',
    text,
    sourceUrl: 'system:ko-clinic-ui',
  };
}

function normalizedVisibleText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function koClinicSlugForSourceUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  if (url.pathname === '/' || url.pathname === '/main.php') return '';
  if (url.pathname === '/index02.php') return 'center-surgery';
  if (url.pathname === '/index03.php') return 'center-internal-medicine';
  if (url.pathname === '/index04.php') return 'center-spine-joint';
  if (url.pathname === '/index05.php') return 'center-plastic-skin';
  if (url.pathname === '/page/sub1_1_1.php') return 'center-vascular';
  if (url.pathname === '/page/sub1_5.php') return 'directions';
  const board = url.pathname.endsWith('/bbs/board.php')
    ? url.searchParams.get('bo_table')
    : null;
  const wrId = url.searchParams.get('wr_id');
  const slug = board && wrId
    ? `community-${board.replaceAll('_', '-')}-${wrId}`
    : url.pathname
        .replace(/^\/page\//u, '')
        .replace(/\.php$/u, '')
        .replaceAll('_', '-')
        .replace(/[^a-z0-9-]/gu, '')
        .replace(/^-+|-+$/gu, '');
  if (!isValidPageSlug(slug)) {
    return `source-${sha256(normalizeSourceUrl(sourceUrl)).slice(0, 20)}`;
  }
  return slug;
}

function pageId(page: KoClinicExtractedPage, slug: string): string {
  if (slug === '') return 'ko-clinic-home';
  if (page.board) return `ko-clinic-article-${page.board.table}-${page.board.wrId}`;
  if (/\/page\/sub[1-5]_\d+_\d+\.php$/u.test(new URL(page.sourceUrl).pathname)) {
    return `clinic-procedure-ko-${slug}`;
  }
  if (slug === 'directions') return 'ko-clinic-contact';
  return `ko-clinic-page-${slug}`;
}

function isoDateFromVerbatim(text: string): string | undefined {
  const match = /(?:^|\D)(\d{2,4})[-.](\d{1,2})[-.](\d{1,2})(?:\D|$)/u.exec(text);
  if (!match) return undefined;
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  const value = `${year}-${month}-${day}`;
  return Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? undefined : value;
}

function pageTitle(page: KoClinicExtractedPage): string {
  const category = page.board ? BOARD_LABELS[page.board.table as keyof typeof BOARD_LABELS] : undefined;
  const title = category && !page.title.text.includes(category)
    ? `${category} · ${page.title.text}`
    : page.title.text;
  return page.board ? `${title} · 게시물 ${page.board.wrId}` : title;
}

function descriptionFor(page: KoClinicExtractedPage, publishedBlocks: readonly KoClinicSourceBlock[]) {
  const first = publishedBlocks.find((block) => (
    block.kind === 'paragraph' && block.text.length <= 320
  ));
  return first?.text ?? page.title.text;
}

function contentUnits(input: {
  page: KoClinicExtractedPage;
  blocks: readonly KoClinicSourceBlock[];
  internalHrefBySourceUrl: ReadonlyMap<string, string>;
}): ClinicLayoutContentUnit[] {
  const units: ClinicLayoutContentUnit[] = [];
  let activeHeading: KoClinicSourceBlock | undefined;
  let body: KoClinicSourceBlock[] = [];
  const flush = () => {
    if (!activeHeading && body.length === 0) return;
    const sourceTitle = activeHeading ?? input.page.title;
    const title = normalizedVisibleText(sourceTitle.text)
      === normalizedVisibleText(input.page.title.text)
      ? systemChromeBlock(`page-overview-${units.length + 1}`, '개요')
      : sourceBlock(sourceTitle);
    units.push({
      id: `ko-unit-${units.length + 1}-${title.id}`,
      title,
      ...(joinedSourceBlock({
        id: `ko-body-${input.page.sourceHtmlSha256.slice(0, 12)}-${units.length + 1}`,
        blocks: body,
      })
        ? {
            body: joinedSourceBlock({
              id: `ko-body-${input.page.sourceHtmlSha256.slice(0, 12)}-${units.length + 1}`,
              blocks: body,
            }),
          }
        : {}),
    });
    activeHeading = undefined;
    body = [];
  };
  for (const block of input.blocks) {
    if (block.kind === 'heading') {
      flush();
      activeHeading = block;
    } else if (block.kind === 'category') {
      flush();
      const label = sourceLabelBlock(block);
      units.push({
        id: `ko-category-unit-${units.length + 1}-${block.id}`,
        title: label ?? sourceBlock(block),
        ...(label ? { body: sourceBlock(block) } : {}),
      });
    } else if (block.kind === 'list_item') {
      flush();
      units.push({
        id: `ko-list-unit-${units.length + 1}-${block.id}`,
        title: sourceBlock(block),
      });
    } else {
      body.push(block);
    }
  }
  flush();
  for (const link of input.page.relatedLinks) {
    const href = input.internalHrefBySourceUrl.get(normalizeSourceUrl(link.href ?? ''));
    if (!href) continue;
    units.push({
      id: `ko-related-${link.id}`,
      title: sourceBlock(link),
      href,
      actionLabel: '관련 글 보기',
    });
  }
  if (units.length === 0) {
    units.push({
      id: `ko-title-only-${input.page.title.id}`,
      title: systemChromeBlock('page-overview-only', '개요'),
    });
  }
  return units;
}

function clinicImage(
  sourceUrl: string,
  pageImage: KoClinicExtractedPage['images'][number],
  manifest: ReadonlyMap<string, KoClinicOptimizedImage>,
): ClinicLayoutImage {
  const asset = manifest.get(normalizeSourceUrl(sourceUrl));
  if (!asset) throw new Error(`KO_CLINIC_IMAGE_NOT_OPTIMIZED:${sourceUrl}`);
  return {
    id: `ko-asset-${asset.optimizedSha256.slice(0, 20)}`,
    src: asset.publicPath,
    alt: pageImage.alt,
    sourceWidth: asset.width,
    sourceHeight: asset.height,
    textDense: asset.analysis.textDense,
    heroTextRegionLuminance: asset.analysis.heroTextRegionLuminance,
  };
}

function sectionsForPage(input: {
  page: KoClinicExtractedPage;
  publishedBlocks: readonly KoClinicSourceBlock[];
  theme: SiteConfig['theme'];
  imageManifest: ReadonlyMap<string, KoClinicOptimizedImage>;
  internalHrefBySourceUrl: ReadonlyMap<string, string>;
  isProcedure: boolean;
  isDirections: boolean;
}): Section[] {
  const images = input.page.images
    .filter((image) => image.classification === 'content')
    .map((image) => clinicImage(image.sourceUrl, image, input.imageManifest));
  const author = input.page.blocks.find((block) => block.kind === 'author');
  const date = input.page.blocks.find((block) => block.kind === 'published_date');
  const isoDate = date ? isoDateFromVerbatim(date.text) : undefined;
  const heroImage = input.page.board
    ? undefined
    : images.find((image) => image.textDense === false);
  const hero = buildClinicHeroSection({
    id: `ko-hero-${input.page.sourceHtmlSha256.slice(0, 16)}`,
    name: input.page.board
      ? BOARD_LABELS[input.page.board.table as keyof typeof BOARD_LABELS] ?? '커뮤니티'
      : '이담클리닉',
    title: sourceBlock(input.page.title),
    theme: input.theme,
    ...(heroImage ? { image: heroImage, enforceHeroContrast: true } : {}),
    ...(author
      ? {
          articleEvidence: {
            author: sourceBlock(author),
            ...(sourceLabelBlock(author)
              ? { authorLabel: sourceLabelBlock(author) }
              : {}),
            ...(date && isoDate
              ? {
                  dateModified: isoDate,
                  visibleDate: sourceBlock(date),
                  ...(sourceLabelBlock(date)
                    ? { dateLabel: sourceLabelBlock(date) }
                    : {}),
                }
              : {}),
          },
        }
      : {}),
    requestedId: 'hero.split-left',
  });
  const contactBlock = input.isDirections
    ? input.publishedBlocks.find((block) => (
        /(?:주소\s*:|서울시\s+강남구)/u.test(block.text)
      ))
    : undefined;
  const units = contentUnits({
    page: input.page,
    blocks: input.publishedBlocks.filter((block) => (
      !['author', 'published_date'].includes(block.kind)
      && block.id !== contactBlock?.id
    )),
    internalHrefBySourceUrl: input.internalHrefBySourceUrl,
  });
  const inlineImages = images.filter((image) => image.id !== heroImage?.id);
  if (inlineImages.length === 1 && units[0]) {
    units[0].image = inlineImages[0];
  }
  const prose = buildClinicFeatureSections({
    id: `ko-prose-${input.page.sourceHtmlSha256.slice(0, 16)}`,
    name: '본문',
    units,
    theme: input.theme,
    candidates: ['features.prose-article'],
    allowSingleFeature: true,
    maximumItems: 100,
    surface: true,
    ...(input.isProcedure ? { titleSourceIdPrefix: 'procedure-service' } : {}),
  });
  for (const section of prose) section.surfaceTone = 'tint';
  const gallery = buildClinicGallerySections({
    id: `ko-gallery-${input.page.sourceHtmlSha256.slice(0, 16)}`,
    name: '관련 이미지',
    images: inlineImages.length >= 2 ? inlineImages : [],
    theme: input.theme,
    candidates: ['gallery.uniform-grid'],
    groupName: (index) => index === 0 ? '관련 이미지' : `관련 이미지 ${index + 1}`,
  });
  gallery.forEach((section, index) => {
    section.surfaceTone = index % 2 === 0 ? 'base' : 'tint';
  });
  const directions = contactBlock
    ? buildClinicDirectionsSection({
        id: `ko-directions-${input.page.sourceHtmlSha256.slice(0, 16)}`,
        name: '연락처',
        theme: input.theme,
        rows: [{
          id: `ko-directions-address-${contactBlock.id}`,
          label: '주소',
          value: sourceBlock(contactBlock),
        }],
        surface: true,
      })
    : null;
  return [hero, ...(directions ? [directions] : []), ...prose, ...gallery];
}

function communityHub(input: {
  pages: readonly KoClinicExtractedPage[];
  publishedSourceUrls: ReadonlySet<string>;
  slugBySourceUrl: ReadonlyMap<string, string>;
  theme: SiteConfig['theme'];
}): SitePage {
  const sections: Section[] = [buildClinicHeroSection({
    id: 'ko-community-hero',
    name: '이담클리닉',
    title: systemChromeBlock('community-title', '커뮤니티'),
    theme: input.theme,
    requestedId: 'hero.split-left',
  })];
  for (const table of Object.keys(BOARD_LABELS) as (keyof typeof BOARD_LABELS)[]) {
    if (table === 'praise' || table === 'customer') continue;
    const posts = input.pages.filter((page) => (
      page.board?.table === table
      && input.publishedSourceUrls.has(normalizeSourceUrl(page.sourceUrl))
    ));
    if (posts.length === 0) continue;
    sections.push(...buildClinicFeatureSections({
      id: `ko-community-${table}`,
      name: BOARD_LABELS[table],
      units: posts.map((page) => ({
        id: `ko-community-link-${page.board!.wrId}`,
        title: sourceBlock(page.title),
        href: `/${input.slugBySourceUrl.get(normalizeSourceUrl(page.sourceUrl))!}`,
        actionLabel: '글 보기',
      })),
      theme: input.theme,
      candidates: ['features.icon-grid'],
      maximumItems: 6,
      surface: sections.length % 2 === 1,
    }));
  }
  sections.push(...buildClinicFeatureSections({
    id: 'ko-community-consultation-intake',
    name: '상담 접수 안내',
    units: [{
      id: 'ko-community-consultation-intake-link',
      title: systemChromeBlock('consultation-intake', '상담 접수 안내'),
      href: '/directions',
      actionLabel: '연락처 보기',
    }],
    theme: input.theme,
    candidates: ['features.prose-article'],
    allowSingleFeature: true,
    surface: true,
  }));
  return {
    id: 'ko-clinic-community-hub',
    title: '커뮤니티',
    slug: 'community',
    showInNav: true,
    navLabel: '커뮤니티',
    sections,
  };
}

export function compileKoClinicSite(input: {
  pages: readonly KoClinicExtractedPage[];
  images: readonly KoClinicOptimizedImage[];
}): KoClinicCompilation {
  if (input.pages.length === 0) throw new Error('KO_CLINIC_SOURCE_PAGES_REQUIRED');
  const sortedPages = [...input.pages].sort((left, right) => (
    normalizeSourceUrl(left.sourceUrl).localeCompare(normalizeSourceUrl(right.sourceUrl))
  ));
  const sourceManifest = sortedPages.flatMap((page) => [
    ...(page.businessName ? [page.businessName] : []),
    page.title,
    ...page.blocks,
    ...page.relatedLinks,
  ]);
  const adDiagnostics: KoClinicAdDiagnostic[] = [];
  const testimonialBlockIds = new Set<string>();
  for (const block of sourceManifest) {
    const screened = screenMedicalCopy(block.text, { scope: 'body' });
    for (const violation of screened.violations) {
      adDiagnostics.push({
        sourceUrl: block.sourceUrl,
        blockId: block.id,
        sourceLocator: block.sourceLocator,
        text: block.text,
        violation,
      });
      if (violation.category === 'treatment-testimonial') testimonialBlockIds.add(block.id);
    }
  }
  const publicationHolds: KoClinicPublicationHold[] = [];
  const heldPageUrls = new Set<string>();
  for (const page of sortedPages) {
    const pageBlocks = [page.title, ...page.blocks];
    const held = pageBlocks.filter((block) => testimonialBlockIds.has(block.id));
    if (held.length === 0 && page.board?.table !== 'praise') continue;
    const ruleId = adDiagnostics.find((diagnostic) => (
      held.some((block) => block.id === diagnostic.blockId)
      && diagnostic.violation.category === 'treatment-testimonial'
    ))?.violation.ruleId ?? 'medical-treatment-testimonial';
    publicationHolds.push({
      sourceUrl: page.sourceUrl,
      reason: '치료경험담 공개 게재 보류',
      ruleId,
      sourceBlockIds: held.map((block) => block.id),
    });
    if (
      page.board?.table === 'praise'
      || page.blocks.every((block) => testimonialBlockIds.has(block.id))
    ) {
      heldPageUrls.add(normalizeSourceUrl(page.sourceUrl));
    }
  }

  const publishablePages = sortedPages.filter((page) => (
    !heldPageUrls.has(normalizeSourceUrl(page.sourceUrl))
  ));
  const slugBySourceUrl = new Map(publishablePages.map((page) => [
    normalizeSourceUrl(page.sourceUrl),
    koClinicSlugForSourceUrl(page.sourceUrl),
  ]));
  const slugSet = new Set(slugBySourceUrl.values());
  if (slugSet.size !== slugBySourceUrl.size) throw new Error('KO_CLINIC_SLUG_COLLISION');
  const hrefBySourceUrl = new Map([...slugBySourceUrl].map(([sourceUrl, slug]) => [
    sourceUrl,
    slug ? `/${slug}` : '/',
  ]));
  const imageManifest = new Map(input.images.map((image) => [
    normalizeSourceUrl(image.sourceUrl),
    image,
  ]));
  const home = publishablePages.find((page) => koClinicSlugForSourceUrl(page.sourceUrl) === '')
    ?? publishablePages[0];
  const pin: ClinicMasterPin = {
    version: 1,
    masterId: 'premium-dental-v1',
    accentPreset: 'clean-blue',
    typographyPreset: 'clinic-neutral',
    density: 'airy',
    focus: 'balanced',
    demoPitchLocale: 'ko-owner',
    paletteSource: {
      version: 1,
      kind: 'neutral',
      sourceSha256: home.sourceHtmlSha256,
    },
    stockManifestVersion: 1,
  };
  const baseTheme = tokenSetToSiteTheme(expandTokens(
    KO_CLINIC_DNA_ID,
    KO_CLINIC_HUE_SEED,
  ));
  const clinicTheme = resolveClinicMasterTheme(baseTheme, pin);
  const fontSelection = resolveFontPairingForLocale({
    locale: 'ko-KR',
    dnaId: KO_CLINIC_DNA_ID,
    industryClass: 'medical',
  });
  const theme = applyModernKoreanFontPairing(
    clinicTheme,
    fontSelection?.locale === 'ko-KR' ? fontSelection.id : null,
  );
  const sourcePages = publishablePages.map((page): SitePage => {
    const slug = slugBySourceUrl.get(normalizeSourceUrl(page.sourceUrl))!;
    const id = pageId(page, slug);
    const heldIds = new Set(publicationHolds
      .filter((hold) => normalizeSourceUrl(hold.sourceUrl) === normalizeSourceUrl(page.sourceUrl))
      .flatMap((hold) => hold.sourceBlockIds));
    const publishedBlocks = page.blocks.filter((block) => !heldIds.has(block.id));
    const visibleNav: Record<string, string> = {
      '': '홈',
      'center-vascular': '혈관센터',
      'center-surgery': '외과센터',
      'center-spine-joint': '척추관절센터',
      'center-internal-medicine': '내과센터',
      'center-plastic-skin': '성형피부센터',
      directions: '오시는 길',
    };
    return {
      id,
      title: pageTitle(page),
      ...(descriptionFor(page, publishedBlocks)
        ? { description: descriptionFor(page, publishedBlocks) }
        : {}),
      slug,
      showInNav: Object.hasOwn(visibleNav, slug),
      ...(visibleNav[slug] ? { navLabel: visibleNav[slug] } : {}),
      sections: sectionsForPage({
        page,
        publishedBlocks,
        theme,
        imageManifest,
        internalHrefBySourceUrl: hrefBySourceUrl,
        isProcedure: id.startsWith('clinic-procedure-ko-'),
        isDirections: slug === 'directions',
      }),
    };
  });
  const publishedSourceUrls = new Set(publishablePages.map((page) => (
    normalizeSourceUrl(page.sourceUrl)
  )));
  const hub = communityHub({
    pages: publishablePages,
    publishedSourceUrls,
    slugBySourceUrl,
    theme,
  });
  const navOrder = new Map([
    ['', 0],
    ['center-vascular', 1],
    ['center-surgery', 2],
    ['center-spine-joint', 3],
    ['center-internal-medicine', 4],
    ['center-plastic-skin', 5],
    ['directions', 6],
    ['community', 7],
  ]);
  const pages = [...sourcePages, hub].sort((left, right) => (
    (navOrder.get(left.slug) ?? 100) - (navOrder.get(right.slug) ?? 100)
    || left.slug.localeCompare(right.slug)
  ));
  const businessName = home.businessName?.text ?? home.title.text;
  const config: SiteConfig = {
    version: 2,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: KO_CLINIC_DNA_ID,
      hueSeed: KO_CLINIC_HUE_SEED,
      overrides: {},
    },
    namedTemplate: {
      catalogVersion: 1,
      templateId: 'premium-dental-v1',
    },
    clinicMaster: pin,
    meta: {
      title: businessName,
      ...(home.description ? { description: home.description } : {}),
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
      medicalAdPolicyVersion: MEDICAL_AD_POLICY_VERSION,
    },
    pages,
    nav: { enabled: true },
    motion: {
      presetId: 'clinic-premium',
      intensity: 'off',
    },
  };
  return {
    config,
    sourceManifest,
    imageManifest: input.images,
    publicationHolds,
    adDiagnostics,
    sourceUrlBySlug: Object.fromEntries([...slugBySourceUrl].map(([url, slug]) => [slug, url])),
  };
}
