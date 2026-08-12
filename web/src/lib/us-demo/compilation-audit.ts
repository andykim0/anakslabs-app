import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type {
  ClinicMasterPin,
  ClinicResolvedPalette,
  SiteConfig,
  SitePage,
} from '@/lib/types/site';
import type {
  ProspectPublicSourceKind,
  UsDemoRenderMode,
  UsMedicalDemoCompilation,
} from './contracts';
import { clinicPhotoGate, prospectPublicSourceImages } from './source-images';

export const US_MEDICAL_COMPILATION_AUDIT_VERSION = 1;

export interface UsMedicalCompilationAudit {
  version: typeof US_MEDICAL_COMPILATION_AUDIT_VERSION;
  renderMode: UsDemoRenderMode;
  observedAt: string;
  source: {
    crawledPageCount: number;
    contributingPageCount: number;
    /** Crawled and kept, yet contributed no source block. The first place a thin demo shows up. */
    barrenPageUrls: string[];
    totalBlocks: number;
    usedBlocks: number;
    excludedBlocks: number;
    blocksByKind: Partial<Record<ProspectPublicSourceKind, number>>;
    blocksBySourceUrl: {
      sourceUrl: string;
      blocks: number;
      characters: number;
    }[];
    excluded: {
      blockId: string;
      reason: string;
    }[];
  };
  /**
   * The funnel, because an image can disappear at either stage: crawledCount counts distinct
   * URLs the crawl saw, projectedCount those that survived the usefulness filter (size, format,
   * junk paths), and eligibleCount those the photo gate then allowed into a slot.
   */
  images: {
    crawledCount: number;
    projectedCount: number;
    eligibleCount: number;
    usedCount: number;
    rejected: {
      sourceImageId: string;
      url: string;
      reason: string;
    }[];
  };
  pages: {
    slug: string;
    title: string;
    sectionCount: number;
    imageCount: number;
    characterCount: number;
    stockHero: boolean;
  }[];
  /**
   * TEMPLATE-SYSTEM §7-2, read off the pin the compile wrote. Recorded on every compile so the
   * decision is inspectable per artifact, including when the doc designates a template that is
   * not built yet. Null for a config compiled before the pin carried one.
   */
  template: NonNullable<ClinicMasterPin['templateDecision']> | null;
  /**
   * §2, read off the pin the compile wrote — not recomputed. An audit that runs the extractor a
   * second time can only ever report a palette that agrees with the page by luck. Null for a
   * config compiled before the pin carried one.
   */
  palette: ClinicResolvedPalette | null;
}

function pageCharacterCount(page: SitePage): number {
  return page.sections
    .flatMap((section) => section.elements)
    .reduce((total, element) => (
      element.kind === 'text' ? total + element.text.length : total
    ), 0);
}

function pageImageCount(page: SitePage): number {
  const inline = page.sections
    .flatMap((section) => section.elements)
    .filter((element) => element.kind === 'image').length;
  return inline + page.sections.filter((section) => section.background.image).length;
}

function heroIsStock(page: SitePage): boolean {
  const hero = page.sections.find((section) => section.type === 'hero');
  return hero?.background.image?.src.startsWith('/stock/') === true;
}

/**
 * Everything the outreach compiler learned about one artifact, kept as the record rather than the
 * four counters the API response carries. Source coverage is the primary axis: a crawl whose pages
 * mostly produce no block compiles into a thin demo without any step reporting a failure.
 */
export function buildUsMedicalCompilationAudit(input: {
  artifact: CrawlArtifactPayload;
  compilation: UsMedicalDemoCompilation;
  renderMode: UsDemoRenderMode;
  config: SiteConfig;
}): UsMedicalCompilationAudit {
  const { artifact, compilation, renderMode, config } = input;
  const manifest = compilation.sourceManifest;
  const blocksByKind: Partial<Record<ProspectPublicSourceKind, number>> = {};
  const perUrl = new Map<string, { blocks: number; characters: number }>();
  for (const block of manifest.blocks) {
    blocksByKind[block.kind] = (blocksByKind[block.kind] ?? 0) + 1;
    const entry = perUrl.get(block.sourceUrl) ?? { blocks: 0, characters: 0 };
    entry.blocks += 1;
    entry.characters += block.text.length;
    perUrl.set(block.sourceUrl, entry);
  }
  const projected = prospectPublicSourceImages(artifact);
  const rejected = projected.flatMap((image) => {
    const gate = clinicPhotoGate(image);
    return gate.eligibleForPhotoSlot
      ? []
      : [{
          sourceImageId: image.source.id,
          url: image.source.url,
          reason: gate.reason,
        }];
  });
  return {
    version: US_MEDICAL_COMPILATION_AUDIT_VERSION,
    renderMode,
    observedAt: artifact.observedAt,
    source: {
      crawledPageCount: artifact.pages.length,
      contributingPageCount: perUrl.size,
      barrenPageUrls: artifact.pages
        .map((page) => page.url)
        .filter((url) => !perUrl.has(url)),
      totalBlocks: manifest.blocks.length,
      usedBlocks: manifest.usedBlockIds.length,
      excludedBlocks: manifest.excluded.length,
      blocksByKind,
      blocksBySourceUrl: [...perUrl.entries()]
        .map(([sourceUrl, entry]) => ({ sourceUrl, ...entry }))
        .sort((left, right) => (
          right.blocks - left.blocks || left.sourceUrl.localeCompare(right.sourceUrl)
        )),
      excluded: manifest.excluded.map((entry) => ({
        blockId: entry.blockId,
        reason: entry.reason,
      })),
    },
    images: {
      crawledCount: new Set(
        artifact.pages.flatMap((page) => page.images.map((image) => image.url)),
      ).size,
      projectedCount: projected.length,
      eligibleCount: projected.length - rejected.length,
      usedCount: manifest.usedImageIds?.length ?? 0,
      rejected,
    },
    pages: config.pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      sectionCount: page.sections.length,
      imageCount: pageImageCount(page),
      characterCount: pageCharacterCount(page),
      stockHero: heroIsStock(page),
    })),
    template: config.clinicMaster?.templateDecision ?? null,
    palette: config.clinicMaster?.resolvedPalette ?? null,
  };
}
