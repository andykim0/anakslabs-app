import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
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
  entity: '병원 정보 연결',
  structuredSchema: '구조화된 병원 정보',
  evidence: '근거와 출처',
  answerExtraction: '질문·답변 구조',
  access: '검색 접근',
} as const satisfies Record<UsMedicalOutreachGroup, string>);

export interface UsDemoStructureComparison {
  framing: typeof AI_VISIBILITY_SERVER_HTML_LABEL;
  source: AiVisibilitySummary;
  publishHypothesis: AiVisibilitySummary;
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

/**
 * The publish side receives the static document produced before the private-preview shell.
 * This module has no URL fetcher by design, so it cannot accidentally rescan the private bearer route.
 */
export function compareUsDemoStructure(input: {
  artifact: CrawlArtifactPayload;
  publishHypothesisHtml: string;
  hypothesisUrl: string;
}): UsDemoStructureComparison {
  const source = sourceAiVisibilitySummary(input.artifact);
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
