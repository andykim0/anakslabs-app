import { stableIndex, stableSeedHex } from '@/lib/abstract/seed';
import { realisticImageSupplyEnabled, type ImageSupplyEnvironment } from '@/lib/assets/image-supply-flags';
import type { AssetRef } from '@/lib/assets/provenance';
import { heroLayoutById } from '@/lib/layout/catalog';
import { resolveHeroLayoutVariant } from '@/lib/layout/hero-layout-resolver';
import {
  acceptsAtmosphericCategoricalStock,
  mediaContractForSection,
} from '@/lib/layout/media-contract';
import type { HeroLayoutBreakpointBand } from '@/lib/layout/types';
import type { Section, SiteConfig } from '@/lib/types/site';
import { resolveAdaptiveImageScrim } from '@/lib/design/scrim';
import { relLuminance } from '@/lib/design/quality-standards';
import { workshopStockManifest } from './manifest';
import {
  stockAssetRef,
  type FrozenStockAsset,
  type FrozenStockManifest,
  type StockBucket,
  type StockMood,
} from './types';

const STOCK_PATH_PREFIX = '/stock/pexels/interior-materials/';

const ROLE_BUCKETS = {
  'atmospheric-background': ['HC', 'HL', 'HP', 'ML'],
  'referential-figure': ['MP', 'ML', 'MS'],
} as const satisfies Record<string, readonly StockBucket[]>;

/**
 * 본문 fullbleed 사진은 정보의 주인공이 아니라 브랜드 분위기다. 긴 문단 뒤의
 * 세부 질감을 충분히 눌러 읽기 리듬을 지키는 역할별 하한이며 히어로에는 적용하지 않는다.
 */
export const BODY_ATMOSPHERIC_SCRIM_FLOOR = 0.78;
export const HERO_ATMOSPHERIC_SCRIM_FLOOR = 0.36;

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

function sectionHasCustomerMedia(config: SiteConfig, section: Section): boolean {
  const sources = [
    section.background.image?.src,
    section.background.video?.src,
    section.background.video?.poster,
    ...section.elements.flatMap((element) => (
      element.kind === 'image' ? [element.src] : []
    )),
  ].filter((source): source is string => Boolean(source));
  return sources.some((source) => (
    isCustomerAsset(config.assetRefs?.find((ref) => ref.url === source))
  ));
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

function preferredStockMood(targetLuminance: number): StockMood {
  if (targetLuminance >= 0.62) return 'light';
  if (targetLuminance <= 0.18) return 'dark';
  return 'balanced';
}

function moodDistance(assetMood: StockMood, preferredMood: StockMood): number {
  if (assetMood === preferredMood) return 0;
  if (assetMood === 'balanced' || preferredMood === 'balanced') return 0.12;
  return 0.4;
}

function stockBrandFitScore(
  asset: FrozenStockAsset,
  targetLuminance: number,
  preferredMood: StockMood,
): number {
  const sourceLuminance = asset.contrastProfile?.meanLuminance ?? 0.5;
  return Math.abs(sourceLuminance - targetLuminance)
    + moodDistance(asset.mood, preferredMood);
}

function mixHex(left: string, right: string, rightWeight: number): string {
  const parse = (value: string): [number, number, number] | undefined => {
    const match = /^#([0-9a-f]{6})$/iu.exec(value);
    if (!match) return undefined;
    const encoded = Number.parseInt(match[1]!, 16);
    return [(encoded >> 16) & 255, (encoded >> 8) & 255, encoded & 255];
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return left;
  const weight = Math.max(0, Math.min(1, rightWeight));
  const channel = (index: number) => (
    Math.round(a[index]! * (1 - weight) + b[index]! * weight)
      .toString(16)
      .padStart(2, '0')
  );
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** 사진을 별도 색 세계로 만들지 않고 현재 DNA의 아주 옅은 primary wash로 묶는다. */
export function bodyAtmosphericOverlayColor(theme: SiteConfig['theme']): string {
  return mixHex(theme.palette.background, theme.palette.primary, 0.1);
}

/**
 * Stable provider choice. Palette fit is a deterministic preference window,
 * not a hard exclusion: the page still tries every compatible item before
 * repeating, while its first atmospheric assignments stay in the site's color world.
 */
export function selectCategoricalStock(input: {
  manifest: FrozenStockManifest;
  buckets: readonly StockBucket[];
  siteSeed: string;
  sectionId: string;
  slotKey: string;
  band: HeroLayoutBreakpointBand;
  usedProviderAssetIds?: ReadonlySet<string>;
  previousProviderAssetId?: string;
  brandFit?: {
    targetLuminance: number;
    preferredMood: StockMood;
  };
}): FrozenStockAsset | undefined {
  const eligible = eligibleAssets(input.manifest, input.buckets);
  const assets = input.brandFit
    ? [...eligible].sort((left, right) => (
        stockBrandFitScore(
          left,
          input.brandFit!.targetLuminance,
          input.brandFit!.preferredMood,
        ) - stockBrandFitScore(
          right,
          input.brandFit!.targetLuminance,
          input.brandFit!.preferredMood,
        )
        || Number(left.providerAssetId) - Number(right.providerAssetId)
        || left.providerAssetId.localeCompare(right.providerAssetId)
      ))
    : eligible;
  if (assets.length === 0) return undefined;
  const preferredPoolSize = input.brandFit
    ? Math.min(assets.length, Math.max(4, Math.ceil(assets.length * 0.4)))
    : assets.length;
  const start = stableIndex(
    `${input.siteSeed}|${input.sectionId}|${input.slotKey}|${input.band}`,
    preferredPoolSize,
  );
  for (let offset = 0; offset < preferredPoolSize; offset += 1) {
    const asset = assets[(start + offset) % preferredPoolSize]!;
    if (!input.usedProviderAssetIds?.has(asset.providerAssetId)) return asset;
  }
  for (const asset of assets.slice(preferredPoolSize)) {
    if (!input.usedProviderAssetIds?.has(asset.providerAssetId)) return asset;
  }
  for (let offset = 0; offset < assets.length; offset += 1) {
    const asset = assets[(start + offset) % assets.length]!;
    if (asset.providerAssetId !== input.previousProviderAssetId) return asset;
  }
  return assets[start % assets.length];
}

function brandFitFor(config: SiteConfig): {
  targetLuminance: number;
  preferredMood: StockMood;
} {
  const targetLuminance = relLuminance(config.theme.palette.background);
  return {
    targetLuminance,
    preferredMood: preferredStockMood(targetLuminance),
  };
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
  previousProviderAssetId?: string;
}): { section: Section; selection?: StockSupplySelection; ref?: AssetRef } {
  const projection = input.section.heroLayout;
  if (!projection) return { section: input.section };
  const variant = heroLayoutById(projection.requestedId);
  const contract = mediaContractForSection(input.section, 'requested')?.contract
    ?? variant.mediaContract;
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
    previousProviderAssetId: input.previousProviderAssetId,
    brandFit: brandFitFor(input.config),
  });
  if (!asset) return { section: input.section };

  input.usedProviderAssetIds.add(asset.providerAssetId);
  const adaptive = resolveAdaptiveImageScrim(
    input.config.theme.palette,
    asset.contrastProfile,
    contract.role === 'atmospheric-background'
      ? {
          minimumOverlayOpacity: HERO_ATMOSPHERIC_SCRIM_FLOOR,
          preferredOverlayColor: bodyAtmosphericOverlayColor(input.config.theme),
        }
      : {},
  );
  const adaptiveBand = {
    overlayColor: adaptive.overlayColor,
    overlayOpacity: adaptive.overlayOpacity,
    minimumContrast: adaptive.minimumContrast,
  };
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
        overlayColor: adaptive.overlayColor,
        overlayOpacity: contract.role === 'atmospheric-background'
          ? adaptive.overlayOpacity
          : 0,
        ...(contract.role === 'atmospheric-background'
          ? {
              adaptiveScrim: {
                version: 1 as const,
                source: 'licensed-stock' as const,
                ...(asset.contrastProfile
                  ? { sourceProfile: { ...asset.contrastProfile } }
                  : {}),
                wide: { ...adaptiveBand },
                compact: { ...adaptiveBand },
                mobile: { ...adaptiveBand },
              },
            }
          : {}),
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

function applyBodyAtmosphericStock(input: {
  config: SiteConfig;
  section: Section;
  siteSeed: string;
  manifest: FrozenStockManifest;
  usedProviderAssetIds: Set<string>;
  previousProviderAssetId?: string;
}): { section: Section; selection?: StockSupplySelection; ref?: AssetRef } {
  if (
    input.section.type === 'hero'
    || input.section.sectionLayout?.mediaRole !== 'atmospheric-background'
    || !acceptsAtmosphericCategoricalStock(input.section)
    || sectionHasCustomerMedia(input.config, input.section)
  ) {
    return { section: input.section };
  }
  const band = 'wide' as const;
  const slotKey = 'body:atmospheric-background';
  const asset = selectCategoricalStock({
    manifest: input.manifest,
    buckets: ROLE_BUCKETS['atmospheric-background'],
    siteSeed: input.siteSeed,
    sectionId: input.section.id,
    slotKey,
    band,
    usedProviderAssetIds: input.usedProviderAssetIds,
    previousProviderAssetId: input.previousProviderAssetId,
    brandFit: brandFitFor(input.config),
  });
  if (!asset) return { section: input.section };

  input.usedProviderAssetIds.add(asset.providerAssetId);
  const adaptive = resolveAdaptiveImageScrim(
    input.config.theme.palette,
    asset.contrastProfile,
    {
      minimumOverlayOpacity: BODY_ATMOSPHERIC_SCRIM_FLOOR,
      preferredOverlayColor: bodyAtmosphericOverlayColor(input.config.theme),
    },
  );
  const adaptiveBand = {
    overlayColor: adaptive.overlayColor,
    overlayOpacity: adaptive.overlayOpacity,
    minimumContrast: adaptive.minimumContrast,
  };
  const next: Section = {
    ...input.section,
    background: {
      ...input.section.background,
      image: {
        src: asset.renditionUrl,
        overlayColor: adaptive.overlayColor,
        overlayOpacity: adaptive.overlayOpacity,
        adaptiveScrim: {
          version: 1,
          source: 'licensed-stock',
          ...(asset.contrastProfile
            ? { sourceProfile: { ...asset.contrastProfile } }
            : {}),
          wide: { ...adaptiveBand },
          compact: { ...adaptiveBand },
          mobile: { ...adaptiveBand },
        },
        focalPoint: { x: 0.5, y: 0.5 },
        compactFocalPoint: { x: 0.5, y: 0.5 },
        mobileFocalPoint: { x: 0.5, y: 0.5 },
      },
    },
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
  if (
    !realisticImageSupplyEnabled(options.environment)
    || config.meta.industryId !== 'interior'
    || config.meta.imageDirectionId !== 'realistic'
  ) {
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
      const result = section.type === 'hero'
        ? applyHeroStock({
            config,
            section,
            siteSeed,
            manifest,
            usedProviderAssetIds,
            previousProviderAssetId: selections.at(-1)?.asset.providerAssetId,
          })
        : applyBodyAtmosphericStock({
            config,
            section,
            siteSeed,
            manifest,
            usedProviderAssetIds,
            previousProviderAssetId: selections.at(-1)?.asset.providerAssetId,
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
