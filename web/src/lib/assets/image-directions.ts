/**
 * Asset-policy v2 image directions.
 *
 * This is intentionally separate from the legacy CandidateStyle vocabulary.
 * In particular, legacy `photo` must never be interpreted as permission to
 * fabricate a photorealistic business, product, person, or result.
 */

export const IMAGE_DIRECTION_IDS = [
  'real_photo',
  'realistic',
  '3d_brand_world',
  'illustration_collage',
  'abstract_editorial',
] as const;

export type ImageDirectionId = (typeof IMAGE_DIRECTION_IDS)[number];
export type NewSelectableImageDirectionId = Exclude<ImageDirectionId, 'illustration_collage'>;

export type LegacyCandidateStyle = 'photo' | '3d_render' | 'illustration';

export interface ImageDirectionOption {
  id: ImageDirectionId;
  label: string;
  description: string;
  detail: string;
  requiresVerifiedCustomerUpload: boolean;
  usesAiGeneration: boolean;
  requiresLicensedStockSupply: boolean;
  legacyStyle: LegacyCandidateStyle;
}

/**
 * SURVEY image-intake contract. Customers provide only referential evidence;
 * atmospheric stage visuals are an Anaks Labs responsibility and never an upload gate.
 */
export const REFERENTIAL_IMAGE_POLICY_COPY = {
  stepTitle: 'Add source material if you have it',
  intro:
    'Upload only material that must represent the real clinic, such as its spaces, people, services, or logo. Anaks Labs provides atmospheric backgrounds and motion, and zero uploads do not block generation.',
  heroHint:
    'Upload a hero image only when you have an approved photo of the real clinic, team, or service. Otherwise, skip it and Anaks Labs will provide the visual stage.',
  collectionHint:
    'Upload only photos that you created or are authorized to use for the clinic, team, services, or work.',
  suppliedVisuals:
    'If you do not upload photos, Anaks Labs can provide an abstract visual stage and motion.',
  suppliedVisualsShort: 'No upload · Anaks Labs provides the visual stage',
} as const;

export const REAL_PHOTO_REQUIRED_GUIDANCE =
  'A photographic direction requires an approved customer upload of the real clinic, team, or service. Without one, choose an abstract or 3D direction supplied by Anaks Labs.';

export const IMAGE_DIRECTIONS = {
  real_photo: {
    id: 'real_photo',
    label: 'Photography — approved source required',
    description: 'Uses only real photos uploaded and approved by the customer.',
    detail: 'We adjust crop, placement, color, and basic motion without generating a clinic, service, or person.',
    requiresVerifiedCustomerUpload: true,
    usesAiGeneration: false,
    requiresLicensedStockSupply: false,
    legacyStyle: 'photo',
  },
  realistic: {
    id: 'realistic',
    label: 'Licensed photography',
    description: 'Uses licensed object, texture, or atmosphere imagery that does not claim to show the real clinic.',
    detail: 'Anaks Labs supplies only assets with a verified usage scope and does not invent a clinic, service, or person.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: false,
    requiresLicensedStockSupply: true,
    legacyStyle: 'photo',
  },
  '3d_brand_world': {
    id: '3d_brand_world',
    label: '3D brand world',
    description: 'Builds a clearly synthetic 3D world from the brand palette and forms.',
    detail: 'The styled scene does not pretend to show a real clinic, service, person, or result.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    requiresLicensedStockSupply: false,
    legacyStyle: '3d_render',
  },
  illustration_collage: {
    id: 'illustration_collage',
    label: 'Illustration and collage',
    description: 'Uses deliberately non-photographic illustration and editorial collage.',
    detail: 'It does not pose as documentary photography or invent people, services, or outcomes.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    requiresLicensedStockSupply: false,
    legacyStyle: 'illustration',
  },
  abstract_editorial: {
    id: 'abstract_editorial',
    label: 'Abstract editorial',
    description: 'Uses color, light, material, geometry, and type for a polished editorial treatment.',
    detail: 'This safe default does not generate a real service, person, place, or outcome.',
    requiresVerifiedCustomerUpload: false,
    usesAiGeneration: true,
    requiresLicensedStockSupply: false,
    // Legacy generation has no abstract vocabulary. Illustration is the
    // conservative, visibly non-photographic compatibility projection.
    legacyStyle: 'illustration',
  },
} as const satisfies Record<ImageDirectionId, ImageDirectionOption>;

/**
 * New selection catalog. `illustration_collage` remains readable for legacy
 * surveys and published sites but cannot be selected for a new generation.
 * `realistic` joins only after the separately controlled licensed supply exists.
 */
export const NEW_IMAGE_DIRECTION_IDS = [
  'real_photo',
  '3d_brand_world',
  'abstract_editorial',
] as const satisfies readonly NewSelectableImageDirectionId[];

export const IMAGE_DIRECTION_OPTIONS = NEW_IMAGE_DIRECTION_IDS.map((id) => IMAGE_DIRECTIONS[id]);

export function selectableImageDirectionOptions(input: {
  realisticSupplyReady: boolean;
}): readonly ImageDirectionOption[] {
  return input.realisticSupplyReady
    ? [
        IMAGE_DIRECTIONS.real_photo,
        IMAGE_DIRECTIONS.realistic,
        IMAGE_DIRECTIONS['3d_brand_world'],
        IMAGE_DIRECTIONS.abstract_editorial,
      ]
    : IMAGE_DIRECTION_OPTIONS;
}

/**
 * A recommendation is never an authorization decision. It intentionally
 * returns only an artistic direction; `real_photo` requires an explicit user
 * choice plus server-verified upload/attestation evidence.
 */
export function recommendedImageDirection(input: {
  industry?: string;
  tone?: readonly string[];
}): Exclude<NewSelectableImageDirectionId, 'real_photo' | 'realistic'> {
  const context = `${input.industry ?? ''} ${(input.tone ?? []).join(' ')}`.toLowerCase();
  if (/saas|테크|기술|소프트웨어|앱|플랫폼|it|스타트업|미래|대담/.test(context)) {
    return '3d_brand_world';
  }
  return 'abstract_editorial';
}

export function imageDirectionToLegacyCandidateStyle(
  direction: ImageDirectionId,
): LegacyCandidateStyle {
  return IMAGE_DIRECTIONS[direction].legacyStyle;
}

/**
 * Read-time compatibility projection only. Existing published artifacts are
 * not rewritten. A legacy `photo` without verified, attested upload evidence
 * is explicitly downgraded for a new v2 regeneration.
 */
export function legacyCandidateStyleToImageDirection(
  style: LegacyCandidateStyle | undefined,
  hasVerifiedAttestedCustomerUpload: boolean,
): ImageDirectionId {
  if (style === 'photo') {
    return hasVerifiedAttestedCustomerUpload ? 'real_photo' : 'abstract_editorial';
  }
  if (style === '3d_render') return '3d_brand_world';
  if (style === 'illustration') return 'illustration_collage';
  return 'abstract_editorial';
}

export function canSelectRealPhoto(input: {
  heroPhotoUrl?: string | null;
  heroPhotoAssetRef?: { assetId: string; url?: string } | null;
  storePhotoUrls?: readonly string[] | null;
  storePhotoAssetRefs?: readonly { assetId: string; url?: string }[] | null;
  importedPhotoAssetRefs?: readonly { assetId: string; url?: string }[] | null;
  contentItems?: readonly {
    photoUrl?: string | null;
    photoAssetRef?: { assetId: string; url?: string } | null;
  }[] | null;
  generalAssetAttestationId?: string | null;
  personPhotoAssetIds?: readonly string[] | null;
  nonPersonPhotoAssetIds?: readonly string[] | null;
}): boolean {
  // URL matching can only reject a stale projection; it never proves origin.
  const heroRefMatchesProjection = Boolean(input.heroPhotoAssetRef?.assetId)
    && Boolean(input.heroPhotoUrl?.trim())
    && input.heroPhotoAssetRef?.url === input.heroPhotoUrl?.trim();
  const hasUploadRef = heroRefMatchesProjection
    || Boolean(input.storePhotoAssetRefs?.some((ref) =>
      Boolean(ref.assetId && ref.url && input.storePhotoUrls?.includes(ref.url))))
    || Boolean(input.importedPhotoAssetRefs?.some((ref) =>
      Boolean(ref.assetId && ref.url && input.storePhotoUrls?.includes(ref.url))))
    || Boolean(input.contentItems?.some((item) =>
      Boolean(item.photoAssetRef?.assetId
        && item.photoAssetRef.url
        && item.photoAssetRef.url === item.photoUrl?.trim())));
  const directAssetIds = new Set([
    ...(input.heroPhotoAssetRef?.assetId ? [input.heroPhotoAssetRef.assetId] : []),
    ...(input.storePhotoAssetRefs ?? []).map((ref) => ref.assetId),
    ...(input.importedPhotoAssetRefs ?? []).map((ref) => ref.assetId),
    ...(input.contentItems ?? []).flatMap((item) =>
      item.photoAssetRef?.assetId ? [item.photoAssetRef.assetId] : []),
  ]);
  const personIds = new Set(input.personPhotoAssetIds ?? []);
  const nonPersonIds = new Set(input.nonPersonPhotoAssetIds ?? []);
  const classificationIsExact = personIds.size === (input.personPhotoAssetIds?.length ?? 0)
    && nonPersonIds.size === (input.nonPersonPhotoAssetIds?.length ?? 0)
    && [...personIds].every((assetId) => directAssetIds.has(assetId) && !nonPersonIds.has(assetId))
    && [...nonPersonIds].every((assetId) => directAssetIds.has(assetId))
    && personIds.size + nonPersonIds.size === directAssetIds.size;
  return hasUploadRef
    && classificationIsExact
    && Boolean(input.generalAssetAttestationId?.trim());
}
