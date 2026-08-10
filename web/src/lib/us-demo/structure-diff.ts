import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SitePage } from '@/lib/types/site';
import {
  AI_VISIBILITY_SERVER_HTML_LABEL,
  buildAiVisibilitySnapshot,
  ruleContextFromServerHtml,
  summarizeAiVisibilitySnapshot,
  type AiVisibilitySummary,
} from '@/lib/scan/ai-visibility';
import {
  US_MEDICAL_OUTREACH_LOCALE,
  US_MEDICAL_OUTREACH_PROFILE_ID,
  type UsMedicalOutreachGroup,
} from '@/lib/scan/profiles';

export const US_DEMO_DIFF_GROUP_LABELS = Object.freeze({
  entity: 'Practice identity',
  structuredSchema: 'Structured practice data',
  evidence: 'Evidence and sources',
  answerExtraction: 'Question and answer structure',
  access: 'Search access',
} as const satisfies Record<UsMedicalOutreachGroup, string>);

export interface UsDemoStructureComparison {
  framing: typeof AI_VISIBILITY_SERVER_HTML_LABEL;
  source: AiVisibilitySummary;
  publishHypothesis: AiVisibilitySummary;
  /** Both sides scored as they would be once launched. Additive; raw scores are unchanged. */
  asLaunched: { source: AsLaunchedScore; publishHypothesis: AsLaunchedScore };
}

/**
 * Properties a preview host has and a launched site does not. The demo is served noindexed, with
 * crawlers turned away and no canonical of its own, because it is a private draft — scoring it on
 * those is scoring the hosting, not the rebuild the customer is being shown.
 *
 * They are deferred, not hidden: the comparison reports them so the surface can label them as
 * resolved at launch. The scanner keeps failing them, which is correct for a real site.
 */
export const AS_LAUNCHED_DEFERRED_RULE_CODES: readonly string[] = Object.freeze([
  'seo_noindex',
  'seo_googlebot_blocked',
  'seo_bingbot_blocked',
  'geo_oai_search_blocked',
  'geo_perplexity_blocked',
  'geo_snippet_restricted',
  'seo_canonical',
  'seo_canonical_invalid',
]);

export interface AsLaunchedScore {
  /** Percentage over the pillars that apply, with preview-hosting rules deferred. */
  score: number;
  /** Pillars carrying no applicable signal, with the weight each removes from the total. */
  inapplicablePillars: { group: string; weight: number }[];
  /** Signals held back because the preview host, not the rebuild, fails them. */
  deferredToLaunch: string[];
}

/**
 * A pillar with no applicable signal earns zero while its weight stays in the denominator, so a
 * clinic page — where evidence cannot apply, as it is neither an article nor a claim page — is
 * charged twenty points neither side can win. Renormalising over the pillars that apply is the
 * same arithmetic each pillar already uses internally.
 */
export function asLaunchedScore(summary: AiVisibilitySummary): AsLaunchedScore {
  const deferred = summary.signals.filter(
    (signal) => signal.ruleCode && AS_LAUNCHED_DEFERRED_RULE_CODES.includes(signal.ruleCode),
  );
  const deferredIds = new Set(deferred.map((signal) => signal.id));
  const inapplicablePillars: { group: string; weight: number }[] = [];
  let earned = 0;
  let weight = 0;
  for (const [group, pillar] of Object.entries(summary.groups)) {
    const applicable = summary.signals.filter((signal) => (
      signal.group === group
      && signal.state !== 'not_applicable'
      && !deferredIds.has(signal.id)
    ));
    if (applicable.length === 0) {
      inapplicablePillars.push({ group, weight: pillar.weight });
      continue;
    }
    const detected = applicable.filter((signal) => signal.state === 'detected').length;
    earned += (detected / applicable.length) * pillar.weight;
    weight += pillar.weight;
  }
  return {
    score: weight === 0 ? 0 : Math.round((earned / weight) * 100),
    inapplicablePillars,
    deferredToLaunch: deferred.map((signal) => signal.id),
  };
}


const PROCEDURE_SOURCE_RE = Object.freeze({
  implant: /\bimplant|all[- ]on[- ](?:4|6)|full[- ]arch/iu,
  orthodontic: /\borthodont|braces|invisalign|clear[- ]align/iu,
  'cosmetic-restorative': /\bcosmetic|veneer|whitening|restorative|crown|bridge|denture/iu,
  'preventive-general': /\bpreventive|general|cleaning|exam|hygiene|family|pediatric/iu,
} as const);

/** Factual source page paired with one preview-full page for the outside-config diff panel. */
export function sourcePageUrlForDemoPage(
  artifact: CrawlArtifactPayload,
  page: SitePage,
): string | undefined {
  const pageId = page.id;
  if (pageId === 'clinic-home-v2') {
    return artifact.pages.find((candidate) => new URL(candidate.url).pathname === '/')?.url
      ?? artifact.pages[0]?.url;
  }
  if (pageId === 'clinic-about') {
    return artifact.pages.find((candidate) => (
      /\/(?:about|doctor|doctors|provider|providers|team|our-team)(?:\/|$)/iu
        .test(new URL(candidate.url).pathname)
    ))?.url;
  }
  if (pageId === 'clinic-contact') {
    return artifact.pages.find((candidate) => (
      /\/(?:contact|location|locations|faq|faqs|insurance|financing)(?:\/|$)/iu
        .test(new URL(candidate.url).pathname)
    ))?.url ?? artifact.pages[0]?.url;
  }
  const category = Object.keys(PROCEDURE_SOURCE_RE).find((candidate) => (
    pageId.startsWith(`clinic-procedure-${candidate}-`)
  )) as keyof typeof PROCEDURE_SOURCE_RE | undefined;
  if (!category) return undefined;
  const exact = artifact.pages.find((candidate) => (
    candidate.headings.some((heading) => heading.trim() === page.title.trim())
    || new URL(candidate.url).pathname.split('/').filter(Boolean).at(-1) === page.slug
  ));
  if (exact) return exact.url;
  const matcher = PROCEDURE_SOURCE_RE[category];
  return artifact.pages.find((candidate) => matcher.test([
    new URL(candidate.url).pathname.replace(/[-_/]+/gu, ' '),
    candidate.title ?? '',
    ...candidate.headings,
  ].join(' ')))?.url;
}

export function sourceAiVisibilitySummary(
  artifact: CrawlArtifactPayload,
): AiVisibilitySummary {
  if (artifact.scanProfileId !== US_MEDICAL_OUTREACH_PROFILE_ID) {
    throw new Error('US_SCAN_PROFILE_REQUIRED');
  }
  const summary = artifact.pages
    .map((page) => page.aiVisibilitySummary)
    .find((item): item is AiVisibilitySummary => Boolean(item));
  if (!summary || summary.source !== 'source-html') {
    throw new Error('US_SOURCE_VISIBILITY_SUMMARY_REQUIRED');
  }
  return summary;
}

export function sourceAiVisibilitySummaryForUrl(
  artifact: CrawlArtifactPayload,
  sourcePageUrl: string | undefined,
): AiVisibilitySummary {
  if (!sourcePageUrl) return sourceAiVisibilitySummary(artifact);
  const summary = artifact.pages.find((page) => page.url === sourcePageUrl)?.aiVisibilitySummary;
  if (!summary || summary.source !== 'source-html') return sourceAiVisibilitySummary(artifact);
  return summary;
}

/**
 * The publish side receives the static document produced before the private-preview shell.
 * This module has no URL fetcher by design, so it cannot accidentally rescan the private bearer route.
 */
export function compareUsDemoStructure(input: {
  artifact: CrawlArtifactPayload;
  publishHypothesisHtml: string;
  hypothesisUrl: string;
  sourcePageUrl?: string;
}): UsDemoStructureComparison {
  const source = sourceAiVisibilitySummaryForUrl(input.artifact, input.sourcePageUrl);
  const publishHypothesis = summarizeAiVisibilitySnapshot(buildAiVisibilitySnapshot(
    ruleContextFromServerHtml({
      html: input.publishHypothesisHtml,
      url: input.hypothesisUrl,
      source: 'publish-hypothesis',
      locale: US_MEDICAL_OUTREACH_LOCALE,
    }),
    'publish-hypothesis',
  ));
  return {
    framing: AI_VISIBILITY_SERVER_HTML_LABEL,
    source,
    publishHypothesis,
    asLaunched: {
      source: asLaunchedScore(source),
      publishHypothesis: asLaunchedScore(publishHypothesis),
    },
  };
}
