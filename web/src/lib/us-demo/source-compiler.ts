import { createHash } from 'node:crypto';
import {
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';
import type { ClinicDesignLanguage, ClinicMasterPin, SiteConfig } from '@/lib/types/site';
import {
  compilePremiumDentalMaster,
  resolveClinicFocus,
  resolveClinicMasterTheme,
} from '@/lib/clinic-master';
import {
  applyLatinFontPairing,
  resolveFontPairingForLocale,
} from '@/lib/fonts';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  buildClinicPalette,
  US_DEMO_FALLBACK_CLINIC_SPECIALTY,
  type ClinicSpecialty,
} from './clinic-palette';
import { resolveClinicSpecialty } from './specialty';
import {
  clinicPhotoGate,
  clinicSourceIsImageDense,
  prospectPublicSourceImages,
} from './source-images';
import { clinicTemplateDecisionFromSource } from './template-system';
import {
  runClinicEngine,
} from '@/lib/clinic-engine/pipeline';
import { US_MEDICAL_OUTREACH_PROFILE } from '@/lib/clinic-engine/profiles';
import {
  INSUFFICIENT_ENGLISH_SOURCE,
  US_DEMO_LOCALE_CONTRACT,
  US_DEMO_SOURCE_ORIGIN,
  US_DEMO_SOURCE_MANIFEST_MARKET,
  UsDemoCompileError,
  type ProspectPublicSourceBlock,
  type UsDemoManualFinish,
  type UsMedicalDemoCompilation,
  type UsDemoRenderMode,
} from './contracts';
import {
  prospectPublicSourceBlocks,
  sourceBlockHashIsValid,
  sourceLooksEnglish,
} from './source-extraction';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';
import { compileUsMedicalFullPreview } from './full-preview';

const US_DEMO_DNA_ID = 'medical-clinical-clarity' as const;
const US_DEMO_HUE_SEED = 207;

function validateManualFinish(
  finish: UsDemoManualFinish | undefined,
  knownIds: ReadonlySet<string>,
): void {
  if (!finish) return;
  const unknown = [
    ...(finish.includeBlockIds ?? []),
    ...(finish.orderedBlockIds ?? []),
    ...(finish.approvedReviewBlockIds ?? []),
  ].find((id) => !knownIds.has(id));
  if (unknown) {
    throw new UsDemoCompileError(
      'INVALID_MANUAL_FINISH',
      `Manual finishing cannot use blocks that are absent from the collected source: ${unknown}`,
    );
  }
}

function curateSourceBlocks(
  blocks: readonly ProspectPublicSourceBlock[],
  manualFinish?: UsDemoManualFinish,
) {
  const knownIds = new Set(blocks.map((block) => block.id));
  validateManualFinish(manualFinish, knownIds);
  const included = manualFinish?.includeBlockIds
    ? new Set(manualFinish.includeBlockIds)
    : null;
  const approvedReview = new Set(manualFinish?.approvedReviewBlockIds ?? []);
  const order = new Map((manualFinish?.orderedBlockIds ?? []).map((id, index) => [id, index]));
  const excluded: {
    blockId: string;
    reason: 'policy-block' | 'review-required' | 'manual-exclusion';
    violations?: ReturnType<typeof screenUsMedicalDemoCopy>['violations'];
  }[] = [];

  const accepted = blocks.flatMap((block) => {
    if (!sourceBlockHashIsValid(block)) {
      excluded.push({ blockId: block.id, reason: 'policy-block' });
      return [];
    }
    if (included && !included.has(block.id)) {
      excluded.push({ blockId: block.id, reason: 'manual-exclusion' });
      return [];
    }
    const screened = screenUsMedicalDemoCopy(block.text);
    const blocked = screened.violations.some((violation) => violation.severity === 'block');
    if (blocked) {
      excluded.push({
        blockId: block.id,
        reason: 'policy-block',
        violations: screened.violations,
      });
      return [];
    }
    if (screened.violations.length > 0 && !approvedReview.has(block.id)) {
      excluded.push({
        blockId: block.id,
        reason: 'review-required',
        violations: screened.violations,
      });
      return [];
    }
    return [block];
  });

  accepted.sort((left, right) => {
    const leftOrder = order.get(left.id);
    const rightOrder = order.get(right.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return left.sourceUrl.localeCompare(right.sourceUrl)
      || left.sourceLocation.ordinal - right.sourceLocation.ordinal
      || left.id.localeCompare(right.id);
  });
  return { accepted, excluded };
}

/**
 * The one place §2 runs. Everything downstream — the theme the renderer reads, the sticky booking
 * bar, the compilation audit — reads the result off the pin instead of computing its own, because
 * a second computation is a second answer and only one of them reaches the page.
 */
function clinicMasterPinForArtifact(
  artifact: CrawlArtifactPayload,
  blocks: readonly ProspectPublicSourceBlock[],
  specialty: ClinicSpecialty,
  designLanguage?: ClinicDesignLanguage,
): ClinicMasterPin {
  const projection = artifact.clinicPaletteProjection;
  const palette = buildClinicPalette({
    candidates: projection?.rawCandidates ?? [],
    specialty,
    imageDense: clinicSourceIsImageDense(artifact),
    ...(designLanguage ? { designLanguage } : {}),
  });
  /**
   * §7-2 is recorded, not acted on. Only T5 exists, so a null templateId means the doc points at
   * a template we have not built; the compile keeps premium-dental-v1 and its section order
   * rather than pretending the designated template is the one we shipped.
   */
  const projectedPhotos = prospectPublicSourceImages(artifact);
  const template = clinicTemplateDecisionFromSource({
    specialty,
    pageUrls: artifact.pages.map((page) => page.url),
    blocks,
    eligiblePhotoCount: projectedPhotos
      .filter((image) => clinicPhotoGate(image).eligibleForPhotoSlot).length,
    projectedPhotoCount: projectedPhotos.length,
  });
  return {
    version: 1,
    masterId: 'premium-dental-v1',
    /**
     * Written only when it is not dental. Absence already meant dental for every pin issued before
     * this field existed, so saying it again for a dental practice would change the stored bytes of
     * a config whose output must not move — and would mean nothing that absence does not.
     */
    ...(specialty === US_DEMO_FALLBACK_CLINIC_SPECIALTY ? {} : { specialty }),
    /**
     * Same contract, same reason: absence is the default language, so a default-language compile
     * writes nothing and its stored bytes do not move.
     */
    ...(designLanguage ? { designLanguage } : {}),
    accentPreset: projection?.accentPreset ?? 'clean-blue',
    /**
     * The language decides the typography, because that is what a design language IS — the pairing
     * is not a separate axis an operator tunes on top of it.
     */
    typographyPreset: designLanguage === 'marquee' ? 'clinic-marquee' : 'clinic-editorial',
    density: 'airy',
    focus: resolveClinicFocus(blocks.filter((block) => block.kind === 'service')),
    demoPitchLocale: 'en',
    paletteSource: {
      version: 1,
      kind: projection?.kind ?? 'neutral',
      sourceSha256: projection?.sourceSha256
        ?? createHash('sha256').update(artifact.finalOrigin, 'utf8').digest('hex'),
    },
    resolvedPalette: {
      version: 1,
      slots: palette.slots,
      origin: palette.meta.origin,
      refinement: palette.meta.refinement,
      fallbackUsed: palette.meta.fallbackUsed,
      gateFailures: palette.meta.gateFailures,
    },
    templateDecision: {
      version: 1,
      templateId: template.templateId,
      designatedByDoc: template.designatedByDoc,
      reason: template.reason,
      multiLocation: template.input.multiLocation,
      singleProcedureFocus: template.input.singleProcedureFocus,
    },
    stockManifestVersion: 1,
  };
}

/**
 * Strict source-only compiler for a US medical outreach preview.
 * It neither translates nor asks an LLM to write copy; every factual canvas string points to an
 * immutable public-source block linked through the crawl artifact.
 */
function compileUsMedicalDemoProfile(
  artifact: CrawlArtifactPayload,
  sourceBlocks: readonly ProspectPublicSourceBlock[],
  options: {
    manualFinish?: UsDemoManualFinish;
    renderMode?: UsDemoRenderMode;
    specialty?: ClinicSpecialty;
    designLanguage?: ClinicDesignLanguage;
  } = {},
): UsMedicalDemoCompilation {
  const curated = curateSourceBlocks(sourceBlocks, options.manualFinish);
  if (!sourceLooksEnglish(curated.accepted)) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      'There is not enough English source material to build a demo without translation or invention.',
    );
  }
  const businessName = curated.accepted.find((block) => block.kind === 'business_name');
  if (!businessName) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      'The practice name could not be verified in the public English source.',
    );
  }
  const baseTheme = tokenSetToSiteTheme(expandTokens(
    US_DEMO_DNA_ID,
    US_DEMO_HUE_SEED,
  ));
  /**
   * Resolved once, here, and then only read. Every specialty-dependent decision below — the
   * palette fallback, §7-2's template assignment, the page taxonomy, the stock pool, the
   * structured-data type — takes this value rather than classifying the practice again.
   */
  const specialtyResolution = resolveClinicSpecialty({
    artifact,
    blocks: curated.accepted,
    ...(options.specialty ? { override: options.specialty } : {}),
  });
  const clinicMaster = clinicMasterPinForArtifact(
    artifact,
    curated.accepted,
    specialtyResolution.specialty,
    options.designLanguage,
  );
  const clinicTheme = resolveClinicMasterTheme(baseTheme, clinicMaster);
  const fontSelection = resolveFontPairingForLocale({
    locale: 'en-US',
    dnaId: US_DEMO_DNA_ID,
    industryClass: 'medical',
    clinicTypographyPreset: clinicMaster.typographyPreset,
  }, {
    // US medical demos and P4 generation always use the pinned self-hosted Latin slot.
    // Stored non-clinic configs and the global issuance flag contract remain unchanged.
    latinEnabled: true,
  });
  const theme = applyLatinFontPairing(
    clinicTheme,
    fontSelection?.locale === 'en-US' ? fontSelection : null,
  );
  const introduction = curated.accepted.find((block) => block.kind === 'introduction');
  const phone = curated.accepted.find((block) => block.kind === 'phone')?.text;
  const address = curated.accepted.find((block) => block.kind === 'address')?.text;
  const configWithoutStock: SiteConfig = {
    version: 2,
    theme,
    designDna: {
      catalogVersion: 1,
      dnaId: US_DEMO_DNA_ID,
      hueSeed: US_DEMO_HUE_SEED,
      overrides: {},
    },
    namedTemplate: {
      catalogVersion: 1,
      templateId: 'premium-dental-v1',
    },
    clinicMaster,
    meta: {
      title: businessName.text,
      ...(introduction ? { description: introduction.text } : {}),
      ...US_DEMO_LOCALE_CONTRACT,
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    },
    pages: [{
      id: 'home',
      title: 'Home',
      slug: '',
      sections: compilePremiumDentalMaster({
        blocks: curated.accepted,
        theme,
        pin: clinicMaster,
      }),
    }],
    ...(phone || address
      ? { publicContact: { version: 1, ...(phone ? { phone } : {}), ...(address ? { address } : {}) } }
      : {}),
    nav: { enabled: false },
  };
  const hospitalStableId = createHash('sha256')
    .update(artifact.finalOrigin, 'utf8')
    .digest('hex');
  const renderMode = options.renderMode ?? 'outreach-safe';
  const multipage = compileUsMedicalFullPreview({
    artifact,
    blocks: curated.accepted,
    baseConfig: configWithoutStock,
    hospitalStableId,
    renderMode,
  });
  const config = multipage.config;
  const usedBlockIds = config.pages
    .flatMap((page) => page.sections)
    .flatMap((item) => item.elements)
    .flatMap((element) => {
      const match = /^source-(pps-[a-f0-9]{16}-\d+)-/u.exec(element.id);
      return match ? [match[1]] : [];
    });
  const metaBlockIds = [businessName.id, introduction?.id].filter(
    (id): id is string => Boolean(id),
  );
  const publicContactBlockIds = curated.accepted
    .filter((block) => ['phone', 'address'].includes(block.kind))
    .map((block) => block.id);
  return {
    config,
    sourceManifest: {
      version: 1,
      origin: US_DEMO_SOURCE_ORIGIN,
      locale: US_DEMO_LOCALE_CONTRACT.locale,
      market: US_DEMO_SOURCE_MANIFEST_MARKET,
      jurisdiction: US_DEMO_LOCALE_CONTRACT.jurisdiction,
      blocks: sourceBlocks,
      usedBlockIds: [...new Set([...usedBlockIds, ...metaBlockIds, ...publicContactBlockIds])],
      excluded: curated.excluded,
      images: multipage.sourceImages,
      usedImageIds: multipage.usedImageIds,
    },
    ...(renderMode === 'preview-full'
      ? {
          renderMode: 'preview-full' as const,
          heroDecisions: multipage.heroDecisions,
        }
      : {}),
  };
}

export function compileUsMedicalDemo(
  artifact: CrawlArtifactPayload,
  options: {
    manualFinish?: UsDemoManualFinish;
    renderMode?: UsDemoRenderMode;
    /** Operator override. Omitted means the source vocabulary decides. */
    specialty?: ClinicSpecialty;
    /**
     * Wave 1 is operator-only: omitted means the default design language, and nothing measures the
     * source to pick one. When it is supplied the compile — not the renderer — makes the palette
     * and typography decisions it implies, and stores the answer on the pin.
     */
    designLanguage?: ClinicDesignLanguage;
  } = {},
): UsMedicalDemoCompilation {
  return runClinicEngine({
    profile: US_MEDICAL_OUTREACH_PROFILE,
    value: { artifact, options },
    extractSource: ({ artifact: sourceArtifact, options: sourceOptions }) => ({
      artifact: sourceArtifact,
      sourceBlocks: prospectPublicSourceBlocks(sourceArtifact),
      options: sourceOptions,
    }),
    splitPages: (source) => source,
    resolveLayouts: (source) => compileUsMedicalDemoProfile(
      source.artifact,
      source.sourceBlocks,
      source.options,
    ),
  });
}
