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
import type { ClinicSpecialty } from './clinic-palette';

export interface UsMedicalDeliveryBlocker {
  ruleId: string;
  severity: 'block' | 'warn';
  /**
   * Why the rule fired, which decides whether anyone can act on it.
   *
   * - `claim`: a specific phrase triggered the rule. The screen already replaced it; if one still
   *   appears here it names the sentence to look at.
   * - `omission`: the copy is missing a statement the rule requires. Nothing can be swapped to fix
   *   an absence — the only "fix" is writing a risk sentence the practice never wrote, onto a
   *   medical page, which is exactly the class of content we do not invent. Needs a human.
   * - `classification`: the config's industry metadata disagrees with itself. A regeneration bug,
   *   not a copy problem.
   */
  nature: 'claim' | 'omission' | 'classification';
  detail: string;
}

/**
 * A rule that matched but does not gate delivery — today only credential claims. It travels with
 * the blockers because it belongs in the same operator glance: the practice is the party attesting
 * to the credential, so what the operator needs is to know the sentence is there, not permission.
 */
export interface UsMedicalDeliveryAdvisory {
  ruleId: string;
  detail: string;
}

export interface PreparedUsMedicalPreview {
  config: SiteConfig;
  /**
   * Whether this config would survive the delivery gate. Recorded so an operator learns it BEFORE
   * sending the link, rather than when the customer has already said yes. Never enforced here.
   */
  deliverable: boolean;
  /**
   * Empty when `deliverable`. Otherwise the rules that survived the screen, so the operator reading
   * "not deliverable" also reads why — an unexplained refusal just gets overridden by whoever is
   * in a hurry.
   */
  deliveryBlockers: readonly UsMedicalDeliveryBlocker[];
  /**
   * Present whether or not the preview is deliverable — an advisory never makes it undeliverable,
   * so it must not be reported only in the failure path.
   */
  deliveryAdvisories: readonly UsMedicalDeliveryAdvisory[];
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

function deliveryBlockersOf(
  result: ReturnType<typeof enforceGeneratedMedicalConfig>['result'],
): readonly UsMedicalDeliveryBlocker[] {
  return result.violations.map((violation) => {
    if (violation.kind === 'classification') {
      return {
        ruleId: violation.code,
        severity: violation.severity,
        nature: 'classification' as const,
        detail: violation.message,
      };
    }
    return {
      ruleId: violation.ruleId,
      severity: violation.severity,
      // The screen reports a missing required statement against a synthetic `$structural.` path
      // because there is no sentence to point at. That absence is the whole distinction.
      nature: violation.path.startsWith('$structural.') ? ('omission' as const) : ('claim' as const),
      detail: violation.matchedText,
    };
  });
}

function deliveryAdvisoriesOf(
  result: ReturnType<typeof enforceGeneratedMedicalConfig>['result'],
): readonly UsMedicalDeliveryAdvisory[] {
  return result.advisories.map((advisory) => ({
    ruleId: advisory.ruleId,
    detail: advisory.matchedText,
  }));
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
  /**
   * Operator override for the specialty. Omitted means the practice's own vocabulary decides
   * (`resolveClinicSpecialty`); either way the answer is stored on the pin and read from there.
   */
  specialty?: ClinicSpecialty;
}): PreparedUsMedicalPreview {
  const renderMode = input.renderMode ?? 'outreach-safe';
  sourceAiVisibilitySummary(input.artifact);
  const compiled = compileUsMedicalDemo(input.artifact, {
    manualFinish: input.manualFinish,
    renderMode,
    ...(input.specialty ? { specialty: input.specialty } : {}),
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
    deliveryBlockers: deliveryBlockersOf(screened.result),
    deliveryAdvisories: deliveryAdvisoriesOf(screened.result),
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
