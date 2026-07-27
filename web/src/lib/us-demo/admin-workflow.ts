import { siteConfigSchema } from '@/app/api/_lib/schemas';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import type { UsDemoManualFinish } from './contracts';
import { compileUsMedicalDemo } from './source-compiler';
import { sourceAiVisibilitySummary } from './structure-diff';

export interface PreparedUsMedicalPreview {
  config: SiteConfig;
  sourceReport: {
    origin: 'prospect_public_source';
    totalBlocks: number;
    usedBlocks: number;
    excludedBlocks: number;
  };
}

/**
 * Single source for the admin preview assembly boundary. It validates the source-side diagnostic
 * projection, compiles only hashed public-source blocks, and normalizes the exact config persisted
 * by the shared-preview repository.
 */
export function prepareUsMedicalPreview(input: {
  artifact: CrawlArtifactPayload;
  manualFinish?: UsDemoManualFinish;
}): PreparedUsMedicalPreview {
  sourceAiVisibilitySummary(input.artifact);
  const compiled = compileUsMedicalDemo(input.artifact, {
    manualFinish: input.manualFinish,
  });
  return {
    config: siteConfigSchema.parse(compiled.config),
    sourceReport: {
      origin: compiled.sourceManifest.origin,
      totalBlocks: compiled.sourceManifest.blocks.length,
      usedBlocks: compiled.sourceManifest.usedBlockIds.length,
      excludedBlocks: compiled.sourceManifest.excluded.length,
    },
  };
}
