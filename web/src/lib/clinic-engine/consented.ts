import type { CanvasElement, SitePage } from '@/lib/types/site';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { screenUsMedicalDemoCopy } from '@/lib/us-demo/us-medical-ad-guard';
import { auditClinicTextCompleteness } from './audit';
import { US_MEDICAL_CONSENTED_PROFILE } from './profiles';
import {
  compileRobustClinicArtifact,
  type RobustClinicCompilation,
} from './robust-compile';
import {
  extractRobustClinicSource,
  normalizeRobustClinicText,
  type RobustClinicDocument,
} from './robust-source';

export class ConsentedClinicCompileError extends Error {
  constructor(
    public readonly code:
      | 'US_MEDICAL_CONSENT_REQUIRED'
      | 'US_MEDICAL_COMPLETENESS_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ConsentedClinicCompileError';
  }
}

function textFromElement(element: CanvasElement): string[] {
  if (element.kind === 'text') return [normalizeRobustClinicText(element.text)];
  if (element.kind === 'button') return [normalizeRobustClinicText(element.label)];
  return [];
}

function compiledPageText(page: SitePage): string {
  return normalizeRobustClinicText(page.sections.flatMap((section) => (
    section.elements.flatMap(textFromElement)
  )).join('\n'));
}

export interface UsMedicalConsentedCompilation extends RobustClinicCompilation {
  completeness: {
    sourcePageCount: number;
    compiledPageCount: number;
    totalSourceBlockCount: number;
    sourceBlockCount: number;
    placedBlockCount: number;
    policyExcludedBlockCount: number;
    bodyPlacementRate: number;
    failingPages: Array<{
      sourceUrl: string;
      missing: string[];
    }>;
  };
  medicalAdReview: Array<{
    blockId: string;
    sourceUrl: string;
    violations: ReturnType<typeof screenUsMedicalDemoCopy>['violations'];
  }>;
  medicalAdPolicyExcluded: Array<{
    blockId: string;
    sourceUrl: string;
    text: string;
    violations: ReturnType<typeof screenUsMedicalDemoCopy>['violations'];
  }>;
}

/**
 * Owner-consented full-transfer path. Hard US advertising-policy findings are retained in an
 * explicit audit holdout instead of being published or silently discarded. Every remaining
 * eligible source block must render exactly once.
 */
export function compileUsMedicalConsentedArtifact(input: {
  artifact: CrawlArtifactPayload;
  documents?: readonly RobustClinicDocument[];
}): UsMedicalConsentedCompilation {
  if (
    input.artifact.crawlPolicyId !== 'us-medical-consented-v1'
    || input.artifact.consentEvidence?.scope !== 'demo-by-email'
  ) {
    throw new ConsentedClinicCompileError(
      'US_MEDICAL_CONSENT_REQUIRED',
      'A verified demo-by-email consent record is required.',
    );
  }
  const source = extractRobustClinicSource({
    artifact: input.artifact,
    documents: input.documents,
    profile: US_MEDICAL_CONSENTED_PROFILE,
  });
  const policyReview = source.targetBlocks.flatMap((block) => {
    const violations = screenUsMedicalDemoCopy(block.text).violations;
    return violations.length > 0 ? [{ block, violations }] : [];
  });
  const policyBlocks = policyReview.filter((entry) => (
    entry.violations.some((violation) => violation.severity === 'block')
  ));
  const policyBlockIds = new Set(policyBlocks.map((entry) => entry.block.id));
  const eligibleSource = {
    ...source,
    pages: source.pages.map((page) => ({
      ...page,
      targetBlocks: page.targetBlocks.filter((block) => !policyBlockIds.has(block.id)),
      excludedBlocks: [
        ...page.excludedBlocks,
        ...page.targetBlocks.filter((block) => policyBlockIds.has(block.id)),
      ],
    })),
    targetBlocks: source.targetBlocks.filter((block) => !policyBlockIds.has(block.id)),
    excludedBlocks: [
      ...source.excludedBlocks,
      ...source.targetBlocks.filter((block) => policyBlockIds.has(block.id)),
    ],
  };
  const compiled = compileRobustClinicArtifact({
    artifact: input.artifact,
    documents: input.documents,
    profile: US_MEDICAL_CONSENTED_PROFILE,
    transformSourcePlan: () => eligibleSource,
    gateEvidence: (output) => ({
      'source-completeness': output.audit.unplacedTargetBlockIds.length === 0,
      'render-block-integrity': output.audit.renderBlockViolationCount === 0,
    }),
  });
  const pageBySlug = new Map(compiled.config.pages.map((page) => [page.slug, page]));
  const audit = auditClinicTextCompleteness({
    sources: eligibleSource.pages.map((page) => ({
      sourceUrl: page.sourceUrl,
      included: page.targetBlocks.map((block) => block.text),
      includedEvidence: page.targetBlocks.map((block) => ({
        selector: block.sourceElementPath,
        text: block.text,
      })),
    })),
    compiledPages: compiled.audit.pages.map((page) => ({
      sourceUrl: page.sourceUrl,
      slug: page.slug,
      page: page.slug === null ? undefined : pageBySlug.get(page.slug),
    })),
    compiledText: compiledPageText,
    normalize: normalizeRobustClinicText,
  });
  const complete = audit.failures.length === 0
    && compiled.audit.unplacedTargetBlockIds.length === 0
    && compiled.audit.renderBlockViolationCount === 0
    && compiled.audit.placedBlockIds.length === compiled.audit.targetBlockCount;
  if (!complete) {
    throw new ConsentedClinicCompileError(
      'US_MEDICAL_COMPLETENESS_FAILED',
      `Consented full transfer failed completeness on ${audit.failures.length} pages.`,
    );
  }
  return Object.assign(compiled, {
    completeness: {
      sourcePageCount: source.pages.length,
      compiledPageCount: compiled.config.pages.length,
      totalSourceBlockCount: source.targetBlocks.length,
      sourceBlockCount: compiled.audit.targetBlockCount,
      placedBlockCount: compiled.audit.placedBlockIds.length,
      policyExcludedBlockCount: policyBlocks.length,
      bodyPlacementRate: compiled.audit.targetBlockCount === 0
        ? 0
        : compiled.audit.placedBlockIds.length / compiled.audit.targetBlockCount,
      failingPages: audit.failures.map((failure) => ({
        sourceUrl: failure.sourceUrl,
        missing: failure.missing,
      })),
    },
    medicalAdReview: policyReview.filter((entry) => (
      entry.violations.every((violation) => violation.severity === 'review')
    )).map((entry) => ({
      blockId: entry.block.id,
      sourceUrl: entry.block.sourceUrl,
      violations: entry.violations,
    })),
    medicalAdPolicyExcluded: policyBlocks.map((entry) => ({
      blockId: entry.block.id,
      sourceUrl: entry.block.sourceUrl,
      text: entry.block.text,
      violations: entry.violations,
    })),
  });
}
