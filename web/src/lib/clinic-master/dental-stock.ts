import { stableIndex } from '@/lib/abstract/seed';
import type { AssetRef, AssetUsage } from '@/lib/assets/provenance';
import type { ClinicAccentPreset, ClinicMasterPin, SiteConfig } from '@/lib/types/site';
import { DENTAL_STOCK_MANIFEST } from './dental-stock-manifest.generated';
import {
  DENTAL_STOCK_SLOTS,
  dentalStockAssetRef,
  type DentalStockCategory,
  type DentalStockManifest,
  type DentalStockSlot,
  type FrozenDentalStockAsset,
} from './dental-stock-types';

export const CLINIC_STOCK_DISCLOSURE =
  'Licensed sample imagery · replaced with your practice photography';

export function dentalStockSlotIsAllowed(slot: string): slot is DentalStockSlot {
  return (DENTAL_STOCK_SLOTS as readonly string[]).includes(slot);
}

export function selectDentalStock(input: {
  manifest?: DentalStockManifest;
  hospitalStableId: string;
  category: DentalStockCategory;
  slot: DentalStockSlot;
  accent: ClinicAccentPreset;
}): FrozenDentalStockAsset | undefined {
  const manifest = input.manifest ?? DENTAL_STOCK_MANIFEST;
  const candidates = manifest.assets
    .filter((asset) => asset.category === input.category && asset.review.passed)
    .sort((left, right) => (
      Number(left.providerAssetId) - Number(right.providerAssetId)
      || left.providerAssetId.localeCompare(right.providerAssetId)
    ));
  if (candidates.length === 0) return undefined;
  const seed = [
    input.hospitalStableId,
    input.category,
    input.slot,
    input.accent,
  ].join('|');
  return candidates[stableIndex(seed, candidates.length)];
}

export function dentalStockCategoryForSource(
  focus: ClinicMasterPin['focus'],
  serviceText: string,
): DentalStockCategory {
  if (focus === 'implant') return 'implant';
  if (focus === 'orthodontic') return 'orthodontic';
  if (/\b(?:cosmetic|veneer|whitening|restorative|crown|bridge|denture)\b/iu.test(serviceText)) {
    return 'cosmetic-restorative';
  }
  return 'preventive-general';
}

function mergeAssetRefs(
  existing: readonly AssetRef[] | undefined,
  addition: AssetRef,
): AssetRef[] {
  const refs = new Map((existing ?? []).map((ref) => [ref.assetId, ref]));
  refs.set(addition.assetId, addition);
  return [...refs.values()];
}

function mergeAssetUsages(
  existing: readonly AssetUsage[] | undefined,
  addition: AssetUsage,
): AssetUsage[] {
  const usages = new Map((existing ?? []).map((usage) => [
    `${usage.assetId}:${usage.slotKey}`,
    usage,
  ]));
  usages.set(`${addition.assetId}:${addition.slotKey}`, addition);
  return [...usages.values()];
}

/**
 * premium-dental 신규 발급의 hero/atmosphere 전용 frozen-stock seam.
 * clinicMaster가 없거나 manifest pin이 다르면 입력 객체를 그대로 반환한다.
 */
export function applyDentalStockToClinicMaster(
  config: SiteConfig,
  input: {
    hospitalStableId: string;
    category: DentalStockCategory;
    slot: DentalStockSlot;
    manifest?: DentalStockManifest;
  },
): SiteConfig {
  const manifest = input.manifest ?? DENTAL_STOCK_MANIFEST;
  if (
    !config.clinicMaster
    || config.clinicMaster.stockManifestVersion !== manifest.version
    || !dentalStockSlotIsAllowed(input.slot)
  ) {
    return config;
  }
  const asset = selectDentalStock({
    manifest,
    hospitalStableId: input.hospitalStableId,
    category: input.category,
    slot: input.slot,
    accent: config.clinicMaster.accentPreset,
  });
  if (!asset) return config;
  let changed = false;
  const pages = config.pages.map((page) => {
    if (changed || page.slug !== '') return page;
    const sections = page.sections.map((section) => {
      if (changed || section.type !== 'hero') return section;
      changed = true;
      return {
        ...section,
        background: {
          ...section.background,
          image: {
            src: asset.renditionUrl,
            overlayColor: config.theme.palette.background,
            overlayOpacity: 0.82,
          },
        },
        elements: [
          ...section.elements,
          {
            id: 'clinic-dental-stock-disclosure',
            kind: 'text' as const,
            frame: { x: 116, y: 620, w: 900, h: 40 },
            z: 2,
            text: CLINIC_STOCK_DISCLOSURE,
            style: {
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'body' as const,
              color: config.theme.palette.muted,
              lineHeight: 1.4,
            },
            entrance: { effect: 'none' as const },
          },
        ],
      };
    });
    return changed ? { ...page, sections } : page;
  });
  if (!changed) return config;
  return {
    ...config,
    pages,
    assetRefs: mergeAssetRefs(config.assetRefs, dentalStockAssetRef(asset)),
    assetUsages: mergeAssetUsages(config.assetUsages, {
      assetId: asset.assetId,
      role: 'atmospheric',
      subject: asset.category === 'bright-interior' ? 'place' : 'abstract',
      slotKey: `clinic:${input.slot}`,
    }),
  };
}
