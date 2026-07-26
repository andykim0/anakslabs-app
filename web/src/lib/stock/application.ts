import { stableIndex, stableSeedHex } from '@/lib/abstract/seed';
import { realisticImageSupplyEnabled, type ImageSupplyEnvironment } from '@/lib/assets/image-supply-flags';
import type { AssetRef } from '@/lib/assets/provenance';
import { heroLayoutById } from '@/lib/layout/catalog';
import { resolveHeroLayoutVariant } from '@/lib/layout/hero-layout-resolver';
import type { HeroLayoutBreakpointBand } from '@/lib/layout/types';
import type { Section, SiteConfig } from '@/lib/types/site';
import { workshopStockManifest } from './manifest';
import { stockAssetRef, type FrozenStockAsset, type FrozenStockManifest, type StockBucket } from './types';

const STOCK_PATH_PREFIX = '/stock/pexels/interior-materials/';

const ROLE_BUCKETS = {
  'atmospheric-background': ['HC', 'HL', 'HP', 'ML'],
  'referential-figure': ['MP', 'ML', 'MS'],
} as const satisfies Record<string, readonly StockBucket[]>;

export interface StockSupplySelection {
  sectionId: string;
  slotKey: string;
  band: HeroLayoutBreakpointBand;
  asset: FrozenStockAsset;
}

export interface CategoricalStockSupplyResult {
  config: SiteConfig;
  selections: readonly StockSupplySelection[];
}

function isCustomerAsset(ref: AssetRef | undefined): boolean {
  return Boolean(ref && !ref.attribution);
}

function eligibleAssets(
  manifest: FrozenStockManifest,
  buckets: readonly StockBucket[],
): FrozenStockAsset[] {
  const allowed = new Set(buckets);
  return manifest.assets
    .filter((asset) => asset.review.passed && allowed.has(asset.bucket))
    .sort((left, right) => (
      Number(left.providerAssetId) - Number(right.providerAssetId)
      || left.providerAssetId.localeCompare(right.providerAssetId)
    ));
}

/**
 * Stable provider choice. It tries every sorted item exactly once, so a page
 * only repeats a photo after its compatible pool has been exhausted.
 */
export function selectCategoricalStock(input: {
  manifest: FrozenStockManifest;
  buckets: readonly StockBucket[];
  siteSeed: string;
  sectionId: string;
  slotKey: string;
  band: HeroLayoutBreakpointBand;
  usedProviderAssetIds?: ReadonlySet<string>;
}): FrozenStockAsset | undefined {
  const assets = eligibleAssets(input.manifest, input.buckets);
  if (assets.length === 0) return undefined;
  const start = stableIndex(
    `${input.siteSeed}|${input.sectionId}|${input.slotKey}|${input.band}`,
    assets.length,
  );
  for (let offset = 0; offset < assets.length; offset += 1) {
    const asset = assets[(start + offset) % assets.length]!;
    if (!input.usedProviderAssetIds?.has(asset.providerAssetId)) return asset;
  }
  return assets[start];
}

function mergeAssetRefs(
  existing: readonly AssetRef[] | undefined,
  additions: readonly AssetRef[],
): AssetRef[] | undefined {
  if (additions.length === 0) return existing ? [...existing] : undefined;
  const byId = new Map<string, AssetRef>();
  for (const ref of existing ?? []) byId.set(ref.assetId, ref);
  for (const ref of additions) byId.set(ref.assetId, ref);
  return [...byId.values()];
}

function applyHeroStock(input: {
  config: SiteConfig;
  section: Section;
  siteSeed: string;
  manifest: FrozenStockManifest;
  usedProviderAssetIds: Set<string>;
}): { section: Section; selection?: StockSupplySelection; ref?: AssetRef } {
  const projection = input.section.heroLayout;
  if (!projection) return { section: input.section };
  const variant = heroLayoutById(projection.requestedId);
  const contract = variant.mediaContract;
  if (!contract.fallbackLadder.includes('categorical-stock')) return { section: input.section };
  if (projection.requestedId === 'hero.video-scrim') return { section: input.section };

  const currentSource = input.section.background.image?.src;
  const currentRef = currentSource
    ? input.config.assetRefs?.find((ref) => ref.url === currentSource)
    : undefined;
  if (isCustomerAsset(currentRef)) return { section: input.section };

  const band = 'wide' as const;
  const slotKey = `hero:${contract.role}`;
  const buckets = ROLE_BUCKETS[contract.role as keyof typeof ROLE_BUCKETS];
  if (!buckets) return { section: input.section };
  const asset = selectCategoricalStock({
    manifest: input.manifest,
    buckets,
    siteSeed: input.siteSeed,
    sectionId: input.section.id,
    slotKey,
    band,
    usedProviderAssetIds: input.usedProviderAssetIds,
  });
  if (!asset) return { section: input.section };

  input.usedProviderAssetIds.add(asset.providerAssetId);
  const compiled = resolveHeroLayoutVariant({
    requestedId: projection.requestedId,
    section: input.section,
    theme: input.config.theme,
    availableMedia: {
      image: true,
      atmosphericBackdrop: contract.role === 'atmospheric-background',
      referentialImage: contract.role === 'referential-figure',
      video: false,
      poster: false,
    },
  });
  const next: Section = {
    ...input.section,
    height: compiled.height,
    elements: compiled.elements,
    background: {
      ...input.section.background,
      image: {
        src: asset.renditionUrl,
        overlayColor: input.config.theme.palette.background,
        overlayOpacity: contract.role === 'atmospheric-background' ? 0.3 : 0,
        focalPoint: { x: 0.5, y: 0.5 },
        compactFocalPoint: { x: 0.5, y: 0.5 },
        mobileFocalPoint: { x: 0.5, y: 0.5 },
      },
    },
    heroLayout: compiled.projection,
  };
  delete next.proceduralBackground;
  return {
    section: next,
    selection: { sectionId: input.section.id, slotKey, band, asset },
    ref: stockAssetRef(asset),
  };
}

/**
 * Single deterministic application seam for final generation and previews.
 * Existing saved refs render independently from the launch flag; this function
 * only issues new categorical assignments when the flag is exactly `1`.
 */
export function applyCategoricalStockSupply(
  config: SiteConfig,
  options: {
    environment?: ImageSupplyEnvironment;
    manifest?: FrozenStockManifest;
  } = {},
): CategoricalStockSupplyResult {
  if (!realisticImageSupplyEnabled(options.environment) || config.meta.industryId !== 'interior') {
    return { config, selections: [] };
  }
  const manifest = options.manifest ?? workshopStockManifest();
  const siteSeed = stableSeedHex(JSON.stringify({
    title: config.meta.title,
    templateId: config.meta.templateId,
    industryId: config.meta.industryId,
    designDna: config.designDna,
    namedTemplate: config.namedTemplate,
  }));
  const usedProviderAssetIds = new Set<string>();
  const selections: StockSupplySelection[] = [];
  const refs: AssetRef[] = [];
  let changed = false;
  const pages = config.pages.map((page) => {
    let pageChanged = false;
    const sections = page.sections.map((section) => {
      if (section.type !== 'hero') return section;
      const result = applyHeroStock({
        config,
        section,
        siteSeed,
        manifest,
        usedProviderAssetIds,
      });
      if (!result.selection || !result.ref) return section;
      changed = true;
      pageChanged = true;
      selections.push(result.selection);
      refs.push(result.ref);
      return result.section;
    });
    return pageChanged ? { ...page, sections } : page;
  });
  if (!changed) return { config, selections: [] };
  return {
    config: {
      ...config,
      pages,
      assetRefs: mergeAssetRefs(config.assetRefs, refs),
    },
    selections,
  };
}

export function isCategoricalStockUrl(value: string | undefined): boolean {
  return Boolean(value?.startsWith(STOCK_PATH_PREFIX));
}
