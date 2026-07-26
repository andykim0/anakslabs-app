import type { AssetAttestationSnapshot } from './attestation-registry';
import type { AssetProvenanceConfig } from './provenance-flags-core';
import type {
  AssetRecord,
  AssetRole,
  AssetSubject,
  AssetUsage,
} from './provenance';
import { AssetProvenanceError } from './provenance';
import {
  ASSET_SLOT_POLICY_MAP,
  evaluateAssetTruthPolicy,
  resolveAssetTruthPolicyMode,
  type AssetSlotPurpose,
  type AssetTruthPolicyDenialReason,
  type AssetTruthPolicyMode,
} from './truth-policy';
import type {
  CanvasElement,
  MotionIndustryClass,
  MotionMedia,
  MotionScene,
  Section,
  ShapeElement,
  SiteConfig,
} from '@/lib/types/site';
import { contrastRatio } from '@/lib/design/quality-standards';
import { heroLayoutById } from '@/lib/layout/catalog';
import { featureLayoutById } from '@/lib/layout/feature-catalog';
import { aboutLayoutById } from '@/lib/layout/about-catalog';

export const SITE_ASSET_POLICY_PHASES = [
  'generation',
  'regeneration',
  'preview',
  'render',
  'static-export',
  'publish',
] as const;

export type SiteAssetPolicyPhase = (typeof SITE_ASSET_POLICY_PHASES)[number];
export type SiteAssetPolicyOperation = 'assign' | 'audit';
export type AssetFallbackIntent = 'typography-only' | 'brand-shape' | 'drop-signature';

export interface SiteAssetPolicyViolation {
  slotKey: string;
  reason: AssetTruthPolicyDenialReason;
  fallbackIntent: AssetFallbackIntent;
  assetId?: string;
}

export interface ResolveSiteAssetPolicyResult {
  mode: AssetTruthPolicyMode;
  config: SiteConfig;
  violations: SiteAssetPolicyViolation[];
  assetUsages: AssetUsage[];
}

export interface ResolveSiteAssetPolicyInput {
  operation: SiteAssetPolicyOperation;
  config: SiteConfig;
  clientId: string;
  siteId?: string;
  assetPolicyVersion: 2 | null | undefined;
  generalAttestationId?: string | null;
  phase: SiteAssetPolicyPhase;
  /** Tests/controlled server callers only. Client payloads never populate flags. */
  flags?: AssetProvenanceConfig;
}

export interface SiteAssetPolicyResolverDependencies {
  flags(): AssetProvenanceConfig;
  resolveRecords(input: {
    assetIds: readonly string[];
    clientId: string;
  }): Promise<AssetRecord[]>;
  resolveAttestations(input: {
    clientId: string;
    siteId?: string | null;
    generalAttestationId?: string | null;
    assetIds: readonly string[];
  }): Promise<AssetAttestationSnapshot>;
}

function assetUsageEquals(left: AssetUsage, right: AssetUsage | undefined): boolean {
  if (!right) return false;
  return left.assetId === right.assetId
    && left.role === right.role
    && left.subject === right.subject
    && left.slotKey === right.slotKey;
}

/**
 * Pure save-boundary guard for the server-owned usage manifest. It deliberately
 * does not consult rollout flags: legacy bypass cannot grant client write access.
 */
export function preserveServerAssetUsagesForSave(input: {
  config: SiteConfig;
  persistedConfig: SiteConfig | null | undefined;
}): SiteConfig {
  const submittedHasUsages = Object.hasOwn(input.config, 'assetUsages');
  const submitted = input.config.assetUsages;
  const persisted = input.persistedConfig?.assetUsages;
  if (!persisted) {
    if (submittedHasUsages) {
      throw new AssetProvenanceError(
        'CLIENT_PROVENANCE_FORBIDDEN',
        'A client cannot introduce an asset usage manifest.',
      );
    }
    return input.config;
  }
  if (submittedHasUsages) {
    const unchanged = submitted?.length === persisted.length
      && submitted.every((usage, index) => assetUsageEquals(usage, persisted[index]));
    if (!unchanged) {
      throw new AssetProvenanceError(
        'ASSET_PROVENANCE_CONFLICT',
        'A client cannot add, change, or remove persisted asset usages.',
      );
    }
  }
  return { ...input.config, assetUsages: persisted };
}

/**
 * A read-only preview may receive an enforced visual fallback before the next
 * save has persisted the freshly derived usage manifest. Keep the manifest
 * field exactly as stored so an editor round-trip cannot appear to introduce a
 * client-authored manifest. The following assignment save recomputes it.
 */
export function preservePersistedAssetUsagesInPreview(input: {
  projectedConfig: SiteConfig;
  persistedConfig: SiteConfig;
}): SiteConfig {
  if (input.projectedConfig === input.persistedConfig) return input.projectedConfig;
  const projected = { ...input.projectedConfig };
  if (Object.hasOwn(input.persistedConfig, 'assetUsages')) {
    projected.assetUsages = input.persistedConfig.assetUsages;
  } else {
    delete projected.assetUsages;
  }
  return projected;
}

export interface ResolveSiteAssetPolicyCoreInput {
  operation: SiteAssetPolicyOperation;
  config: SiteConfig;
  clientId: string;
  siteId?: string;
  assetPolicyVersion: 2 | null | undefined;
  phase: SiteAssetPolicyPhase;
  flags: AssetProvenanceConfig;
  records: readonly AssetRecord[];
  attestations: AssetAttestationSnapshot;
}

type SlotTarget =
  | { kind: 'meta-og' }
  | { kind: 'background-image'; pageIndex: number; sectionIndex: number }
  | { kind: 'background-video'; pageIndex: number; sectionIndex: number }
  | { kind: 'element'; pageIndex: number; sectionIndex: number; elementIndex: number }
  | { kind: 'signature'; signatureIndex: number };

interface AssetSlot {
  slotKey: string;
  unitKey: string;
  source: string;
  assetIdHint?: string;
  purpose: AssetSlotPurpose;
  subject: AssetSubject;
  /** Server-derived scene contract permits authoritative AI mood media here. */
  allowAiAtmosphere?: boolean;
  fallbackIntent: AssetFallbackIntent;
  target: SlotTarget;
}

interface ResolvedSlotAsset {
  assetId?: string;
  record: AssetRecord | null;
}

interface UsageEntry {
  unitKey: string;
  usage: AssetUsage;
}

function policy(
  purpose: AssetSlotPurpose,
  subject = ASSET_SLOT_POLICY_MAP[purpose].subjects[0],
): Pick<AssetSlot, 'purpose' | 'subject'> {
  return { purpose, subject };
}

function unitKey(pageId: string, sectionId: string, suffix: string): string {
  return `page:${pageId}/section:${sectionId}/${suffix}`;
}

function factualPolicyForSection(
  section: Section,
  elementId = '',
): Pick<AssetSlot, 'purpose' | 'subject'> {
  if (elementId.includes('hero-logo')) return policy('decorative_art', 'abstract');
  if (section.type === 'menu') return policy('actual_product', 'product');
  if (section.type === 'team' || elementId.includes('greet-img')) {
    return policy('actual_person', 'person');
  }
  if (section.type === 'gallery') {
    return elementId.includes('work-img')
      ? policy('actual_portfolio', 'portfolio')
      : policy('actual_place', 'place');
  }
  if (section.type === 'cases') return policy('actual_portfolio', 'portfolio');
  return policy('actual_ambiguous', 'place');
}

function factualPolicyForIndustry(
  industry: MotionIndustryClass,
): Pick<AssetSlot, 'purpose' | 'subject'> {
  if (industry === 'portfolio' || industry === 'photography' || industry === 'remodeling') {
    return policy('actual_portfolio', 'portfolio');
  }
  return policy('actual_ambiguous', 'place');
}

function motionPolicy(
  scene: MotionScene,
  section: Section | undefined,
  industry: MotionIndustryClass,
): Pick<AssetSlot, 'purpose' | 'subject'> {
  if (scene.signatureId === 'true-card-stack' || scene.signatureId === 'mosaic-reveal') {
    return section
      ? factualPolicyForSection(section)
      : factualPolicyForIndustry(industry);
  }
  if (section && ['menu', 'team', 'gallery', 'cases'].includes(section.type)) {
    return factualPolicyForSection(section);
  }
  return factualPolicyForIndustry(industry);
}

function addMotionMediaSlots(input: {
  slots: AssetSlot[];
  scene: MotionScene;
  signatureIndex: number;
  media: MotionMedia;
  path: string;
  section: Section | undefined;
  industry: MotionIndustryClass;
}): void {
  const { scene, media } = input;
  const signatureUnit = unitKey(
    scene.pageId,
    scene.sectionId,
    `signature:${scene.signatureId}`,
  );
  const base = `${signatureUnit}/media:${input.path}:${media.id}`;
  const expected = motionPolicy(scene, input.section, input.industry);
  const allowAiAtmosphere = scene.signatureId !== 'true-card-stack'
    && scene.signatureId !== 'mosaic-reveal'
    && !(
      input.section
      && ['menu', 'team', 'gallery', 'cases'].includes(input.section.type)
    );
  const target = { kind: 'signature', signatureIndex: input.signatureIndex } as const;
  input.slots.push({
    slotKey: base,
    unitKey: signatureUnit,
    source: media.src,
    ...(media.assetId ? { assetIdHint: media.assetId } : {}),
    ...expected,
    ...(allowAiAtmosphere ? { allowAiAtmosphere: true } : {}),
    fallbackIntent: 'drop-signature',
    target,
  });
  if (media.poster) {
    input.slots.push({
      slotKey: `${base}:poster`,
      unitKey: signatureUnit,
      source: media.poster,
      ...expected,
      ...(allowAiAtmosphere ? { allowAiAtmosphere: true } : {}),
      fallbackIntent: 'drop-signature',
      target,
    });
  }
}

/** Generic media walker deliberately excludes before-after; its 0009 adapter remains authoritative. */
export function collectSiteAssetSlots(config: SiteConfig): AssetSlot[] {
  const slots: AssetSlot[] = [];
  if (config.meta.ogImage) {
    slots.push({
      slotKey: 'meta:ogImage',
      unitKey: 'meta:ogImage',
      source: config.meta.ogImage,
      ...policy('brand_atmosphere', 'abstract'),
      fallbackIntent: 'typography-only',
      target: { kind: 'meta-og' },
    });
  }

  config.pages.forEach((page, pageIndex) => {
    page.sections.forEach((section, sectionIndex) => {
      const sectionBase = unitKey(page.id, section.id, '');
      if (section.background.image) {
        slots.push({
          slotKey: `${sectionBase}background:image`,
          unitKey: `${sectionBase}background:image`,
          source: section.background.image.src,
          // Hero media may be an authoritative AI mood asset. The final
          // purpose is tightened after registry resolution below.
          ...(
            section.type === 'hero'
              ? policy('actual_ambiguous', 'place')
              : policy('brand_atmosphere', 'abstract')
          ),
          fallbackIntent: 'typography-only',
          target: { kind: 'background-image', pageIndex, sectionIndex },
        });
      }
      if (section.background.video) {
        const base = `${sectionBase}background:video`;
        slots.push({
          slotKey: base,
          unitKey: base,
          source: section.background.video.src,
          ...policy('brand_atmosphere', 'abstract'),
          fallbackIntent: 'typography-only',
          target: { kind: 'background-video', pageIndex, sectionIndex },
        });
        if (section.background.video.poster) {
          slots.push({
            slotKey: `${base}:poster`,
            unitKey: base,
            source: section.background.video.poster,
            ...policy('brand_atmosphere', 'abstract'),
            fallbackIntent: 'typography-only',
            target: { kind: 'background-video', pageIndex, sectionIndex },
          });
        }
      }
      section.elements.forEach((element, elementIndex) => {
        if (element.kind !== 'image' && element.kind !== 'video') return;
        // Existing onboarding persists logoUrl without an AssetRef. Until that
        // dedicated brand-asset contract is additive/atomic, preserve the
        // decorative logo path instead of turning every v2 logo into a shape.
        if (element.kind === 'image' && element.id.includes('hero-logo')) return;
        const base = `${sectionBase}element:${element.id}:${element.kind}`;
        const allowAiAtmosphere = !['menu', 'team', 'gallery', 'cases'].includes(section.type)
          && !element.id.includes('greet-img');
        const expected = factualPolicyForSection(section, element.id);
        const target = { kind: 'element', pageIndex, sectionIndex, elementIndex } as const;
        slots.push({
          slotKey: base,
          unitKey: base,
          source: element.src,
          ...expected,
          ...(allowAiAtmosphere ? { allowAiAtmosphere: true } : {}),
          fallbackIntent: 'brand-shape',
          target,
        });
        if (element.kind === 'video' && element.poster) {
          slots.push({
            slotKey: `${base}:poster`,
            unitKey: base,
            source: element.poster,
            ...expected,
            ...(allowAiAtmosphere ? { allowAiAtmosphere: true } : {}),
            fallbackIntent: 'brand-shape',
            target,
          });
        }
      });
    });
  });

  const industry = config.meta.industryClass ?? 'other';
  config.motion?.signatures?.forEach((scene, signatureIndex) => {
    if (scene.signatureId === 'before-after-scrub') return;
    const page = config.pages.find((candidate) => candidate.id === scene.pageId);
    const section = page?.sections.find((candidate) => candidate.id === scene.sectionId);
    const add = (media: MotionMedia | undefined, path: string) => {
      if (!media) return;
      addMotionMediaSlots({
        slots,
        scene,
        signatureIndex,
        media,
        path,
        section,
        industry,
      });
    };
    switch (scene.signatureId) {
      case 'cinematic-scrub':
      case 'scrollytelling-manifesto':
        add(scene.media, 'media');
        break;
      case 'sticky-chapters':
        scene.chapters.forEach((chapter, index) => add(chapter.media, `chapters.${index}.media`));
        break;
      case 'true-card-stack':
        scene.cards.forEach((card, index) => add(card.media, `cards.${index}.media`));
        break;
      case 'portal-zoom':
      case 'scroll-curtain':
        scene.scenes.forEach((item, index) => add(item.media, `scenes.${index}.media`));
        break;
      case 'mosaic-reveal':
        scene.images.forEach((image, index) => add(image, `images.${index}`));
        break;
      case 'horizontal-story':
        scene.panels.forEach((panel, index) => add(panel.media, `panels.${index}.media`));
        break;
      case 'path-journey':
        break;
    }
  });
  return slots;
}

function buildRecordResolver(
  config: SiteConfig,
  records: readonly AssetRecord[],
): (slot: AssetSlot) => ResolvedSlotAsset {
  const recordsById = new Map(records.map((record) => [record.id, record] as const));
  const refIdCounts = new Map<string, number>();
  for (const ref of config.assetRefs ?? []) {
    refIdCounts.set(ref.assetId, (refIdCounts.get(ref.assetId) ?? 0) + 1);
  }
  const refsById = new Map(
    (config.assetRefs ?? [])
      .filter((ref) => refIdCounts.get(ref.assetId) === 1)
      .map((ref) => [ref.assetId, ref] as const),
  );
  const refsByUrl = new Map<string, { assetId: string; url: string } | null>();
  for (const ref of config.assetRefs ?? []) {
    refsByUrl.set(
      ref.url,
      refsByUrl.has(ref.url) || refIdCounts.get(ref.assetId) !== 1 ? null : ref,
    );
  }
  return (slot) => {
    const ref = slot.assetIdHint
      ? refsById.get(slot.assetIdHint)
      : refsByUrl.get(slot.source);
    if (!ref || ref.url !== slot.source) {
      return { ...(slot.assetIdHint ? { assetId: slot.assetIdHint } : {}), record: null };
    }
    const record = recordsById.get(ref.assetId) ?? null;
    if (!record || record.canonicalUrl !== ref.url) return { assetId: ref.assetId, record: null };
    return { assetId: ref.assetId, record };
  };
}

function effectivePolicy(
  slot: AssetSlot,
  record: AssetRecord | null,
  config: SiteConfig,
  attestations: AssetAttestationSnapshot,
): Pick<AssetSlot, 'purpose' | 'subject'> {
  if (record?.origin === 'licensed_stock' && config.meta.industryId === 'interior') {
    if (slot.target.kind === 'background-image') {
      const section = config.pages[slot.target.pageIndex]?.sections[slot.target.sectionIndex];
      const resolvedId = section?.type === 'hero' ? section.heroLayout?.resolvedId : undefined;
      const contract = resolvedId ? heroLayoutById(resolvedId)?.mediaContract : undefined;
      if (
        contract?.role === 'atmospheric-background'
        && contract.fallbackLadder.includes('categorical-stock')
      ) {
        return policy('brand_atmosphere', 'abstract');
      }
      if (
        contract?.role === 'referential-figure'
        && contract.categoricalEligible
        && contract.fallbackLadder.includes('categorical-stock')
      ) {
        return policy('decorative_art', 'abstract');
      }
    }
    if (slot.target.kind === 'element') {
      const section = config.pages[slot.target.pageIndex]?.sections[slot.target.sectionIndex];
      const resolvedId = section?.sectionLayout?.resolvedId;
      const contract = section?.type === 'hero' && section.heroLayout?.resolvedId
        ? heroLayoutById(section.heroLayout.resolvedId)?.mediaContract
        : section?.type === 'features' && resolvedId?.startsWith('features.')
          ? featureLayoutById(resolvedId as Parameters<typeof featureLayoutById>[0]).mediaContract
          : section?.type === 'about' && resolvedId?.startsWith('about.')
            ? aboutLayoutById(resolvedId as Parameters<typeof aboutLayoutById>[0]).mediaContract
            : undefined;
      if (
        contract?.role === 'referential-figure'
        && contract.categoricalEligible
        && contract.fallbackLadder.includes('categorical-stock')
      ) {
        return policy('decorative_art', 'abstract');
      }
    }
  }
  if (slot.target.kind === 'background-image') {
    const section = config.pages[slot.target.pageIndex]?.sections[slot.target.sectionIndex];
    if (section?.type === 'hero' && record?.origin === 'ai_generated') {
      return policy('brand_atmosphere', 'abstract');
    }
  }
  if (slot.allowAiAtmosphere && record?.origin === 'ai_generated') {
    return policy('brand_atmosphere', 'abstract');
  }
  if (slot.purpose === 'actual_ambiguous' && record) {
    if (attestations.generalAttestation?.personAssetIds.includes(record.id)) {
      return policy('actual_ambiguous', 'person');
    }
    return factualPolicyForIndustry(config.meta.industryClass ?? 'other');
  }
  return { purpose: slot.purpose, subject: slot.subject };
}

function fallbackShape(element: CanvasElement, config: SiteConfig): ShapeElement {
  const mediaRadius = element.kind === 'image' || element.kind === 'video'
    ? element.style.borderRadius
    : undefined;
  return {
    id: element.id,
    kind: 'shape',
    assetFallback: true,
    frame: { ...element.frame },
    z: element.z,
    ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
    ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
    ...(element.locked !== undefined ? { locked: element.locked } : {}),
    ...(element.hiddenOnMobile !== undefined ? { hiddenOnMobile: element.hiddenOnMobile } : {}),
    entrance: { effect: 'none' },
    shape: 'rect',
    style: {
      fill: config.theme.palette.surface,
      borderColor: config.theme.palette.primary,
      borderWidth: 1,
      borderRadius: mediaRadius ?? config.theme.radius ?? 8,
    },
  };
}

function highestContrastColor(
  background: string,
  config: SiteConfig,
): string {
  const candidates = [
    config.theme.palette.text,
    config.theme.palette.background,
    config.theme.palette.surface,
    '#ffffff',
    '#000000',
  ];
  return candidates.reduce((best, candidate) =>
    contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best);
}

function applyTypographyBackgroundFallback(
  section: Section,
  config: SiteConfig,
): void {
  const image = section.background.image;
  if (!image) return;
  const representativeText = section.elements.find(
    (element) => element.kind === 'text',
  );
  const textColor = representativeText?.kind === 'text'
    ? representativeText.style.color ?? config.theme.palette.text
    : config.theme.palette.text;
  const candidates = [
    ...(image.overlayColor ? [image.overlayColor] : []),
    section.background.color,
    config.theme.palette.background,
    config.theme.palette.surface,
    '#000000',
    '#ffffff',
  ].filter((value): value is string => Boolean(value));
  const background = image.overlayColor && contrastRatio(textColor, image.overlayColor) >= 4.5
    ? image.overlayColor
    : candidates.reduce((best, candidate) =>
        contrastRatio(textColor, candidate) > contrastRatio(textColor, best) ? candidate : best);
  section.background.color = background;
  delete section.background.image;

  for (const element of section.elements) {
    if (element.kind === 'text') {
      const current = element.style.color ?? config.theme.palette.text;
      if (contrastRatio(current, background) < 4.5) {
        element.style.color = highestContrastColor(background, config);
      }
    } else if (
      element.kind === 'button'
      && element.style.variant !== 'solid'
    ) {
      const current = element.style.textColor ?? element.style.color ?? config.theme.palette.primary;
      if (contrastRatio(current, background) < 4.5) {
        const contrast = highestContrastColor(background, config);
        element.style.color = contrast;
        element.style.textColor = contrast;
      }
    }
  }
}

function applyFallbacks(
  config: SiteConfig,
  slots: readonly AssetSlot[],
  invalidUnitKeys: ReadonlySet<string>,
): SiteConfig {
  const projected = structuredClone(config) as SiteConfig;
  const signatureIndexes = new Set<number>();
  const handledTargets = new Set<string>();
  for (const slot of slots) {
    if (!invalidUnitKeys.has(slot.unitKey)) continue;
    const target = slot.target;
    const targetKey = target.kind === 'meta-og'
      ? 'meta-og'
      : target.kind === 'signature'
        ? `signature:${target.signatureIndex}`
        : target.kind === 'element'
          ? `element:${target.pageIndex}:${target.sectionIndex}:${target.elementIndex}`
          : `${target.kind}:${target.pageIndex}:${target.sectionIndex}`;
    if (handledTargets.has(targetKey)) continue;
    handledTargets.add(targetKey);
    if (target.kind === 'meta-og') {
      delete projected.meta.ogImage;
    } else if (target.kind === 'background-image') {
      const section = projected.pages[target.pageIndex]?.sections[target.sectionIndex];
      if (section) applyTypographyBackgroundFallback(section, projected);
    } else if (target.kind === 'background-video') {
      delete projected.pages[target.pageIndex]?.sections[target.sectionIndex]?.background.video;
    } else if (target.kind === 'element') {
      const elements = projected.pages[target.pageIndex]?.sections[target.sectionIndex]?.elements;
      const element = elements?.[target.elementIndex];
      if (elements && element) elements[target.elementIndex] = fallbackShape(element, projected);
    } else {
      signatureIndexes.add(target.signatureIndex);
    }
  }
  if (projected.motion?.signatures && signatureIndexes.size > 0) {
    projected.motion.signatures = projected.motion.signatures.filter(
      (_scene, index) => !signatureIndexes.has(index),
    );
  }
  return projected;
}

function usageMatches(
  usage: AssetUsage,
  expected: AssetUsage,
): boolean {
  return usage.assetId === expected.assetId
    && usage.role === expected.role
    && usage.subject === expected.subject
    && usage.slotKey === expected.slotKey;
}

/**
 * Pure policy seam. The complete slot walker and fallback projection live here
 * so generation, render, export, and publish cannot drift.
 */
export function resolveSiteAssetPolicyCore(
  input: ResolveSiteAssetPolicyCoreInput,
): ResolveSiteAssetPolicyResult {
  const mode = resolveAssetTruthPolicyMode({
    assetPolicyVersion: input.assetPolicyVersion,
    flags: input.flags,
  });
  if (mode === 'legacy-bypass') {
    return {
      mode,
      config: input.config,
      violations: [],
      assetUsages: input.config.assetUsages ?? [],
    };
  }

  const slots = collectSiteAssetSlots(input.config);
  const slotKeyCounts = new Map<string, number>();
  for (const slot of slots) {
    slotKeyCounts.set(slot.slotKey, (slotKeyCounts.get(slot.slotKey) ?? 0) + 1);
  }
  const resolveRecord = buildRecordResolver(input.config, input.records);
  const invalidUnitKeys = new Set<string>();
  const violations: SiteAssetPolicyViolation[] = [];
  const usageEntries: UsageEntry[] = [];
  const persistedBySlot = new Map<string, AssetUsage[]>();
  for (const usage of input.config.assetUsages ?? []) {
    const values = persistedBySlot.get(usage.slotKey) ?? [];
    values.push(usage);
    persistedBySlot.set(usage.slotKey, values);
  }
  const seenSlotKeys = new Set<string>();
  const effectiveSiteId = input.siteId ?? (input.operation === 'assign' ? null : undefined);

  for (const slot of slots) {
    seenSlotKeys.add(slot.slotKey);
    const resolved = resolveRecord(slot);
    const expectedPolicy = effectivePolicy(slot, resolved.record, input.config, input.attestations);
    const spec = ASSET_SLOT_POLICY_MAP[expectedPolicy.purpose];
    const usage = resolved.assetId
      ? {
          assetId: resolved.assetId,
          role: spec.role as AssetRole,
          subject: expectedPolicy.subject,
          slotKey: slot.slotKey,
        }
      : null;
    const decision = evaluateAssetTruthPolicy({
      clientId: input.clientId,
      ...(effectiveSiteId !== undefined ? { siteId: effectiveSiteId } : {}),
      templateId: input.config.meta.templateId,
      industryClass: input.config.meta.industryClass ?? 'other',
      classificationSource: input.config.meta.industryClass ? 'server' : 'legacy-unknown',
      assetPolicyVersion: input.assetPolicyVersion,
      flags: input.flags,
      slotKey: slot.slotKey,
      slotPurpose: expectedPolicy.purpose,
      role: spec.role,
      subject: expectedPolicy.subject,
      asset: resolved.record,
      generalAttestation: input.attestations.generalAttestation,
      personConsent: resolved.assetId
        ? input.attestations.personConsentsByAssetId.get(resolved.assetId)
        : null,
    });
    let reason = decision.allowed ? null : decision.reason;
    if ((slotKeyCounts.get(slot.slotKey) ?? 0) > 1) {
      reason = 'SLOT_POLICY_MISMATCH';
    }

    // A persisted usage is a server manifest, not an authorization shortcut.
    // During audit it must match the freshly derived slot and registry identity.
    if (input.operation === 'audit' && usage) {
      const persisted = persistedBySlot.get(slot.slotKey) ?? [];
      if (persisted.length > 1 || (persisted.length === 1 && !usageMatches(persisted[0], usage))) {
        reason = 'SLOT_POLICY_MISMATCH';
      }
    }
    if (reason) {
      invalidUnitKeys.add(slot.unitKey);
      violations.push({
        slotKey: slot.slotKey,
        reason,
        fallbackIntent: slot.fallbackIntent,
        ...(resolved.assetId ? { assetId: resolved.assetId } : {}),
      });
    } else if (usage) {
      usageEntries.push({ unitKey: slot.unitKey, usage });
    }
  }

  if (input.operation === 'audit') {
    for (const [slotKey, persisted] of [...persistedBySlot.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (seenSlotKeys.has(slotKey) && persisted.length <= 1) continue;
      if (seenSlotKeys.has(slotKey)) continue; // duplicate was reported against the real slot above
      violations.push({
        slotKey,
        reason: 'SLOT_POLICY_MISMATCH',
        fallbackIntent: 'typography-only',
        ...(persisted[0]?.assetId ? { assetId: persisted[0].assetId } : {}),
      });
    }
  }

  const assetUsages = usageEntries
    .filter((entry) => !invalidUnitKeys.has(entry.unitKey))
    .map((entry) => entry.usage);
  let config = mode === 'enforce'
    ? applyFallbacks(input.config, slots, invalidUnitKeys)
    : input.config;
  if (mode === 'enforce' || (mode === 'observe' && input.operation === 'assign')) {
    config = { ...config, assetUsages };
  }
  return { mode, config, violations, assetUsages };
}

/** Injectable orchestration seam proving one registry batch + one attestation batch per policy pass. */
export function createSiteAssetPolicyResolver(
  dependencies: SiteAssetPolicyResolverDependencies,
): (input: ResolveSiteAssetPolicyInput) => Promise<ResolveSiteAssetPolicyResult> {
  return async (input) => {
    const flags = input.flags ?? dependencies.flags();
    const mode = resolveAssetTruthPolicyMode({
      assetPolicyVersion: input.assetPolicyVersion,
      flags,
    });
    if (mode === 'legacy-bypass') {
      return {
        mode,
        config: input.config,
        violations: [],
        assetUsages: input.config.assetUsages ?? [],
      };
    }

    const assetIds = [...new Set((input.config.assetRefs ?? []).map((ref) => ref.assetId))];
    const records = await dependencies.resolveRecords({
      assetIds,
      clientId: input.clientId,
    });
    const attestationSiteId = input.siteId
      ?? (input.operation === 'assign' ? null : undefined);
    const attestations = await dependencies.resolveAttestations({
      clientId: input.clientId,
      ...(attestationSiteId !== undefined ? { siteId: attestationSiteId } : {}),
      ...(input.generalAttestationId !== undefined
        ? { generalAttestationId: input.generalAttestationId }
        : {}),
      assetIds: records
        .filter((record) => record.origin === 'customer_upload')
        .map((record) => record.id),
    });
    return resolveSiteAssetPolicyCore({ ...input, flags, records, attestations });
  };
}
