import { createHash } from 'node:crypto';
import {
  expandTokens,
  tokenSetToSiteTheme,
} from '@/lib/design/dna';
import type { ClinicMasterPin, SiteConfig } from '@/lib/types/site';
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
  INSUFFICIENT_ENGLISH_SOURCE,
  US_DEMO_LOCALE_CONTRACT,
  US_DEMO_SOURCE_ORIGIN,
  UsDemoCompileError,
  type ProspectPublicSourceBlock,
  type UsDemoManualFinish,
  type UsMedicalDemoCompilation,
} from './contracts';
import {
  prospectPublicSourceBlocks,
  sourceBlockHashIsValid,
  sourceLooksEnglish,
} from './source-extraction';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';

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
      `수집 원문에 없는 블록은 수동 마감에 사용할 수 없습니다: ${unknown}`,
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

function clinicMasterPinForArtifact(
  artifact: CrawlArtifactPayload,
  blocks: readonly ProspectPublicSourceBlock[],
): ClinicMasterPin {
  const palette = artifact.clinicPaletteProjection;
  return {
    version: 1,
    masterId: 'premium-dental-v1',
    accentPreset: palette?.accentPreset ?? 'clean-blue',
    typographyPreset: 'clinic-editorial',
    density: 'airy',
    focus: resolveClinicFocus(blocks.filter((block) => block.kind === 'service')),
    demoPitchLocale: 'en',
    paletteSource: {
      version: 1,
      kind: palette?.kind ?? 'neutral',
      sourceSha256: palette?.sourceSha256
        ?? createHash('sha256').update(artifact.finalOrigin, 'utf8').digest('hex'),
    },
    stockManifestVersion: 1,
  };
}

/**
 * Strict source-only compiler for a US medical outreach preview.
 * It neither translates nor asks an LLM to write copy; every factual canvas string points to an
 * immutable public-source block linked through the crawl artifact.
 */
export function compileUsMedicalDemo(
  artifact: CrawlArtifactPayload,
  options: { manualFinish?: UsDemoManualFinish } = {},
): UsMedicalDemoCompilation {
  const sourceBlocks = prospectPublicSourceBlocks(artifact);
  const curated = curateSourceBlocks(sourceBlocks, options.manualFinish);
  if (!sourceLooksEnglish(curated.accepted)) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      '영어 원문이 충분하지 않아 번역이나 창작 없이 데모를 만들 수 없습니다.',
    );
  }
  const businessName = curated.accepted.find((block) => block.kind === 'business_name');
  if (!businessName) {
    throw new UsDemoCompileError(
      INSUFFICIENT_ENGLISH_SOURCE,
      '공개 영어 원문에서 병원명을 확인할 수 없습니다.',
    );
  }
  const baseTheme = tokenSetToSiteTheme(expandTokens(
    US_DEMO_DNA_ID,
    US_DEMO_HUE_SEED,
  ));
  const clinicMaster = clinicMasterPinForArtifact(artifact, curated.accepted);
  const clinicTheme = resolveClinicMasterTheme(baseTheme, clinicMaster);
  const fontSelection = resolveFontPairingForLocale({
    locale: 'en-US',
    dnaId: US_DEMO_DNA_ID,
    industryClass: 'medical',
    clinicTypographyPreset: clinicMaster.typographyPreset,
  });
  const theme = applyLatinFontPairing(
    clinicTheme,
    fontSelection?.locale === 'en-US' ? fontSelection : null,
  );
  const introduction = curated.accepted.find((block) => block.kind === 'introduction');
  const phone = curated.accepted.find((block) => block.kind === 'phone')?.text;
  const address = curated.accepted.find((block) => block.kind === 'address')?.text;
  const config: SiteConfig = {
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
      ...US_DEMO_LOCALE_CONTRACT,
      blocks: sourceBlocks,
      usedBlockIds: [...new Set([...usedBlockIds, ...metaBlockIds, ...publicContactBlockIds])],
      excluded: curated.excluded,
    },
  };
}
