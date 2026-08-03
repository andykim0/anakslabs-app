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
  };
}
