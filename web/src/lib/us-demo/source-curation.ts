import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { AiVisibilitySummary } from '@/lib/scan/ai-visibility';
import { US_MEDICAL_OUTREACH_PROFILE_ID } from '@/lib/scan/profiles';
import type {
  ProspectPublicSourceBlock,
  UsMedicalAdViolation,
} from './contracts';
import {
  prospectPublicSourceBlocks,
  sourceLooksEnglish,
} from './source-extraction';
import { sourceAiVisibilitySummary } from './structure-diff';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';

export type UsDemoSourceDisposition = 'allowed' | 'review' | 'blocked';

export interface UsDemoCurationBlock extends ProspectPublicSourceBlock {
  disposition: UsDemoSourceDisposition;
  violations: readonly UsMedicalAdViolation[];
}

export interface UsDemoCurationProjection {
  sourceVisibility: AiVisibilitySummary;
  englishSourceReady: boolean;
  blocks: readonly UsDemoCurationBlock[];
}

/**
 * Admin-only projection for the manual finishing seam. The projection never adds or rewrites
 * source copy: it exposes the exact hashed source blocks and the same policy screen consumed by
 * compileUsMedicalDemo().
 */
export function buildUsDemoCurationProjection(
  artifact: CrawlArtifactPayload,
): UsDemoCurationProjection {
  if (artifact.scanProfileId !== US_MEDICAL_OUTREACH_PROFILE_ID) {
    throw new Error('US_SCAN_PROFILE_REQUIRED');
  }
  const sourceBlocks = prospectPublicSourceBlocks(artifact);
  return {
    sourceVisibility: sourceAiVisibilitySummary(artifact),
    englishSourceReady: sourceLooksEnglish(sourceBlocks),
    blocks: sourceBlocks.map((block) => {
      const violations = screenUsMedicalDemoCopy(block.text).violations;
      return {
        ...block,
        violations,
        disposition: violations.some((violation) => violation.severity === 'block')
          ? 'blocked'
          : violations.length > 0
            ? 'review'
            : 'allowed',
      };
    }),
  };
}
