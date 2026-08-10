import { siteConfigSchema } from '@/app/api/_lib/schemas';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import type { UsDemoManualFinish, UsDemoRenderMode } from './contracts';
import { compileUsMedicalDemo } from './source-compiler';
import {
  buildUsMedicalCompilationAudit,
  type UsMedicalCompilationAudit,
} from './compilation-audit';
import { sourceAiVisibilitySummary } from './structure-diff';

export interface PreparedUsMedicalPreview {
  config: SiteConfig;
  renderMode: UsDemoRenderMode;
  sourceReport: {
    origin: 'prospect_public_source';
    totalBlocks: number;
    usedBlocks: number;
    excludedBlocks: number;
  };
  /** The full record behind sourceReport's counters, persisted with the preview. */
  audit: UsMedicalCompilationAudit;
}

/**
 * Single source for the admin preview assembly boundary. It validates the source-side diagnostic
 * projection, compiles only hashed public-source blocks, and normalizes the exact config persisted
 * by the shared-preview repository.
 */
export function prepareUsMedicalPreview(input: {
  artifact: CrawlArtifactPayload;
  manualFinish?: UsDemoManualFinish;
  renderMode?: UsDemoRenderMode;
}): PreparedUsMedicalPreview {
  const renderMode = input.renderMode ?? 'outreach-safe';
  sourceAiVisibilitySummary(input.artifact);
  const compiled = compileUsMedicalDemo(input.artifact, {
    manualFinish: input.manualFinish,
    renderMode,
  });
  const config = siteConfigSchema.parse(compiled.config);
  return {
    config,
    renderMode,
    sourceReport: {
      origin: compiled.sourceManifest.origin,
      totalBlocks: compiled.sourceManifest.blocks.length,
      usedBlocks: compiled.sourceManifest.usedBlockIds.length,
      excludedBlocks: compiled.sourceManifest.excluded.length,
    },
    audit: buildUsMedicalCompilationAudit({
      artifact: input.artifact,
      compilation: compiled,
      renderMode,
      config,
    }),
  };
}
