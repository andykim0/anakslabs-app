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
import { enforceGeneratedMedicalConfig } from '@/lib/content/medical-ad-enforcement';

export interface PreparedUsMedicalPreview {
  config: SiteConfig;
  /**
   * Whether this config would survive the delivery gate. Recorded so an operator learns it BEFORE
   * sending the link, rather than when the customer has already said yes. Never enforced here.
   */
  deliverable: boolean;
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
  /**
   * The medical-ad screen runs HERE, at issuance, not at delivery.
   *
   * It used to run only when an operator created the customer's site, which meant the screen
   * rewrote copy AFTER the prospect had approved the page — they said yes to one sentence and
   * received another. Running it now makes the approved artefact and the delivered site the same
   * object: the prospect sees the compliant sentence, approves that, and receives exactly it.
   *
   * Measured across the three sample practices: 2 sentences rewritten out of 961, both of them
   * genuine claims ("Immediate, dramatic results"). What the prospect loses is copy we could not
   * lawfully publish for them anyway, so showing it earlier is showing them the truth earlier.
   *
   * This changes what a preview SHOWS. It does not change what a preview PERMITS: `deliverable`
   * is recorded, never enforced, and a config that fails the screen still previews exactly as it
   * did before. The gate stays where it is.
   */
  const screened = enforceGeneratedMedicalConfig(compiled.config);
  const config = siteConfigSchema.parse(screened.config);
  return {
    config,
    deliverable: screened.result.ok,
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
