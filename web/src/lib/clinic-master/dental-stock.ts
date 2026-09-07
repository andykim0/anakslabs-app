import { stableIndex } from '@/lib/abstract/seed';
import type { AssetRef, AssetUsage } from '@/lib/assets/provenance';
import { resolveHeroLayoutVariant } from '@/lib/layout';
import { minOverlayOpacityForAA, scrimPassesAA } from '@/lib/design/scrim';
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
  selectionSalt?: string;
  excludedAssetIds?: readonly string[];
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
    ...(input.selectionSalt ? [input.selectionSalt] : []),
  ].join('|');
  const start = stableIndex(seed, candidates.length);
  const excluded = new Set(input.excludedAssetIds ?? []);
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length];
    if (!excluded.has(candidate.assetId)) return candidate;
  }
  return undefined;
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
 * 라이선스 stock 히어로의 스크림 대비 마감. (신규 제작에서 옮겨온 공유 헬퍼)
 *
 * stock 히어로는 실제로 0.82 스크림을 칠하는 유일한 clinic 경로이므로, 그 위에 남은 텍스트가
 * 본문 AA(4.5:1)에 못 미치면 발행 감사가 정당하게 차단한다. 두 가지가 걸린다: 이 헬퍼가 얹는
 * muted 공시 문구, 그리고 히어로가 이미 들고 있던 accent 색 텍스트(예: article 날짜) —
 * iddental `invisalign`의 `#4253FF`가 0.82에서 3.51로 미달했다.
 *
 * 실패한 텍스트를 읽히는 본문 토큰으로 되돌리고, 그 토큰마저 못 미치면 스크림을 게이트가
 * 요구하는 최소치(`minOverlayOpacityForAA`, 이미 소수 2자리 올림)까지만 올려 fail-closed 한다.
 * 별도 여유 상수는 두지 않는다 — `IMAGE_SCRIM_AA_TARGET`(5.2)은 `resolveAdaptiveImageScrim`
 * 전용이고 이 경로는 그 함수를 부르지 않는다.
 *
 * `sectionId`를 주면 그 섹션만 손본다. 주지 않으면 config 전체 — 신규 제작이 쓰던 계약 그대로다.
 */
export function enforceClinicStockHeroContrast(
  config: SiteConfig,
  sectionId?: string,
): SiteConfig {
  let changed = false;
  const pages = config.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => {
      if (sectionId !== undefined && section.id !== sectionId) return section;
      const image = section.background.image;
      if (!image?.overlayColor) return section;
      const overlayColor = image.overlayColor;
      const overlayOpacity = image.overlayOpacity ?? 0.45;
      let sectionChanged = false;
      const elements = section.elements.map((element) => {
        if (element.kind !== 'text') return element;
        const color = element.style.color ?? config.theme.palette.text;
        if (scrimPassesAA(overlayColor, overlayOpacity, color)) return element;
        sectionChanged = true;
        return {
          ...element,
          style: { ...element.style, color: config.theme.palette.text },
        };
      });
      if (!sectionChanged) return section;
      changed = true;
      // 본문 토큰마저 못 미치면 스크림을 필요한 최소치까지 올려 fail-closed 한다.
      const required = minOverlayOpacityForAA(overlayColor, config.theme.palette.text);
      const nextOpacity = required !== null && required > overlayOpacity
        ? required
        : overlayOpacity;
      return {
        ...section,
        elements,
        background: {
          ...section.background,
          image: { ...image, overlayOpacity: nextOpacity },
        },
      };
    }),
  }));
  return changed ? { ...config, pages } : config;
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
    /** Additive multipage seam. Omission preserves the original home-only output bytes. */
    pageSlug?: string;
    /** Multipage-only seed scope. Omission preserves the original selector bytes. */
    selectionSalt?: string;
    /** Deterministic hero reuse guard. Omission preserves the original selector bytes. */
    excludedAssetIds?: readonly string[];
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
    selectionSalt: input.selectionSalt,
    excludedAssetIds: input.excludedAssetIds,
  });
  if (!asset) return config;
  let changed = false;
  /** The hero this call replaced — the only section its scrim can have put below AA. */
  let stockHeroSectionId: string | undefined;
  const pages = config.pages.map((page) => {
    if (changed || page.slug !== (input.pageSlug ?? '')) return page;
    const sections = page.sections.map((section) => {
      if (changed || section.type !== 'hero') return section;
      changed = true;
      stockHeroSectionId = section.id;
      const next = {
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
      if (!next.heroLayout) return next;
      const resolved = resolveHeroLayoutVariant({
        requestedId: next.heroLayout.requestedId,
        section: next,
        theme: config.theme,
        availableMedia: {
          image: true,
          video: false,
          poster: false,
          referentialImage: true,
          atmosphericBackdrop: true,
        },
      });
      return {
        ...next,
        height: resolved.height,
        elements: resolved.elements,
        heroLayout: resolved.projection,
      };
    });
    return changed ? { ...page, sections } : page;
  });
  if (!changed) return config;
  /**
   * [Q1-publish] Finish the scrim the moment it is painted, rather than leaving the AA debt for
   * whichever caller happens to run the publish audit. New-build already did this a step later;
   * doing it here covers the US demo compile too, and leaves new-build's own pass nothing to
   * change (it is idempotent), so that path keeps its bytes.
   */
  const contrasted = enforceClinicStockHeroContrast(
    { ...config, pages },
    stockHeroSectionId,
  );
  return {
    ...contrasted,
    assetRefs: mergeAssetRefs(config.assetRefs, dentalStockAssetRef(asset)),
    assetUsages: mergeAssetUsages(config.assetUsages, {
      assetId: asset.assetId,
      role: 'atmospheric',
      subject: asset.category === 'bright-interior' ? 'place' : 'abstract',
      slotKey: input.pageSlug === undefined
        ? `clinic:${input.slot}`
        : `clinic:${input.pageSlug || 'home'}:${input.slot}`,
    }),
  };
}
