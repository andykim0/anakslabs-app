/**
 * What the publish gate would say about a site, BEFORE anyone presses Publish.
 *
 * The console used to learn a site was unpublishable by publishing it and reading a 409. That is
 * a bad way to find out, because the operator has already told the customer a date by then. This
 * recomputes the same verdict from the SiteConfig already stored on the draft, through the same
 * composition `publishSiteWithAudits` uses — `preflightScan` then `checkPublish(config, tier,
 * { scan, artifact: scan.publishAudit })` — so the readout and the refusal cannot disagree.
 *
 * It is READ-ONLY in both senses. It never writes, and it never recompiles: a delivered site
 * carries the exact bytes the prospect approved (`sites/route.ts` persists `preview.siteConfig`
 * verbatim), and silently re-running the compiler under an operator would hand the customer a
 * page they never said yes to. So a preview issued before the publish fix keeps its blockers and
 * has to be re-issued — which is what `predatesPublishFix` is for.
 */
import type { MotionTier, SiteConfig } from '@/lib/types/site';
import { checkPublish } from './preflight';
import { preflightScan } from '@/lib/scan/preflight';
import { sanitizeMotion } from '@/lib/motion/validate';
import type { PublishArtifactBlocker } from './artifact-audit';

export const PREDATES_PUBLISH_FIX_MESSAGE =
  'This preview predates the publish fix; re-issue to publish.';

export interface StoredConfigGateResult {
  ok: boolean;
  /** Prose, in the gate's own words — the same strings a 409 would carry. */
  blockers: string[];
  warnings: string[];
  /** Machine-readable, for the rows the console renders with a page and section. */
  artifactBlockers: {
    code: string;
    message: string;
    pageSlug?: string;
    sectionId?: string;
  }[];
  /**
   * True when the stored config still carries a fingerprint of a defect the compiler has since
   * stopped emitting. Re-issuing the preview is then the fix, not editing the site.
   */
  predatesPublishFix: boolean;
  scan?: { total: number; grade: string; belowThreshold: boolean };
}

/**
 * The two shapes the compiler used to emit and no longer does. Both are structural, so this asks
 * the config a question about itself rather than pattern-matching a translated message.
 *
 *  1. a hero that carries a layout decision AND an overlay colour. `ClinicHeroLayout` paints no
 *     overlay at all, so the pair described a scrim that reached no screen — and the gate scored
 *     it at the assumed 0.45 and refused the page.
 *  2. a button whose `#fragment` names no section on the page that carries the button. Nothing a
 *     browser can scroll to; every one of these was a "Book Appointment" that did nothing.
 */
export function configPredatesPublishFix(config: SiteConfig): boolean {
  for (const page of config.pages) {
    const sectionIds = new Set(page.sections.map((section) => section.id));
    for (const section of page.sections) {
      if (section.clinicHeroLayout && section.background.image?.overlayColor) return true;
      for (const element of section.elements) {
        if (element.kind !== 'button') continue;
        const href = element.href.trim();
        if (!href.startsWith('#')) continue;
        let target = '';
        try {
          target = decodeURIComponent(href.slice(1));
        } catch {
          return true;
        }
        if (!target || !sectionIds.has(target)) return true;
      }
    }
  }
  return false;
}

/**
 * Motion is attached by the publish path before the gate runs, so a draft that stores none would
 * otherwise report a motion blocker the real publish never sees. Normalising here keeps the
 * readout honest about what publishing would actually say.
 */
export function evaluateStoredConfigGate(
  config: SiteConfig,
  tier: MotionTier,
  opts: {
    siteUrl?: string;
    /**
     * Only a site that came from an approved preview can be RE-ISSUED, so only such a site gets
     * told to re-issue. A newbuild or a hand-edited draft with a dead anchor has the same
     * fingerprint and a different remedy, and telling its operator to re-issue a preview that
     * never existed would be worse than saying nothing.
     */
    deliveredFromPreview?: boolean;
  } = {},
): StoredConfigGateResult {
  const normalized = sanitizeMotion(config, tier).config;
  const scan = preflightScan(normalized, {
    tier,
    ...(opts.siteUrl ? { siteUrl: opts.siteUrl } : {}),
  });
  const gate = checkPublish(normalized, tier, {
    scan: { total: scan.scores.total, grade: scan.grade },
    artifact: scan.publishAudit,
  });
  const artifactBlockers = scan.publishAudit.blockers.map((blocker: PublishArtifactBlocker) => ({
    code: blocker.code,
    message: blocker.message,
    ...(blocker.pageSlug !== undefined ? { pageSlug: blocker.pageSlug } : {}),
    ...(blocker.sectionId !== undefined ? { sectionId: blocker.sectionId } : {}),
  }));
  return {
    ok: gate.ok,
    blockers: gate.blockers,
    warnings: gate.warnings,
    artifactBlockers,
    // Only worth saying when it actually blocks: a clean page needs no re-issue.
    predatesPublishFix:
      !gate.ok && Boolean(opts.deliveredFromPreview) && configPredatesPublishFix(config),
    ...(gate.scan ? { scan: gate.scan } : {}),
  };
}
