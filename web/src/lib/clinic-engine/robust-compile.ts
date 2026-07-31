import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import { buildImportPreviewSiteConfig } from '@/lib/crawl/import-preview';
import type { SiteConfig } from '@/lib/types/site';
import type {
  ClinicEngineGateEvidence,
  ClinicEngineProfile,
} from './contracts';
import { runClinicEngine } from './pipeline';

export interface RobustClinicCompilation {
  config: SiteConfig;
  sourcePageUrls: string[];
}

/**
 * Generic robustness entry. It deliberately reuses the existing source-only
 * import compiler; vocabulary or display policy expansion belongs to ENGINE-LEARN.
 */
export function compileRobustClinicArtifact(input: {
  artifact: CrawlArtifactPayload;
  profile: ClinicEngineProfile;
  gateEvidence?: ClinicEngineGateEvidence;
}): RobustClinicCompilation {
  return runClinicEngine({
    profile: input.profile,
    value: input.artifact,
    extractSource: (artifact) => artifact,
    splitPages: (artifact) => artifact.pages,
    resolveLayouts: () => {
      const compiled = buildImportPreviewSiteConfig(input.artifact, {
        purposeId: 'booking_service',
        industry: 'clinic',
      });
      return {
        config: compiled.config,
        sourcePageUrls: input.artifact.pages.map((page) => page.url),
      };
    },
    gateEvidence: () => input.gateEvidence ?? {},
  });
}
