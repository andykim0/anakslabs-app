import { createHash } from 'node:crypto';
import type { SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  contentSourceSnapshotSchema,
  type ContentSourceRef,
  type ContentSourceSnapshot,
} from './contracts';

const HTML_TAG = /<[^>]*>/gu;
const WHITESPACE = /\s+/gu;

function plain(value: string | undefined): string | null {
  const normalized = value
    ?.normalize('NFKC')
    .replace(HTML_TAG, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
  return normalized || null;
}

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortedJson(child)]),
  );
}

export function stableContentJson(value: unknown): string {
  return JSON.stringify(sortedJson(value));
}

export function contentSha256(value: unknown): string {
  return createHash('sha256').update(stableContentJson(value)).digest('hex');
}

function pushSource(
  sources: ContentSourceRef[],
  source: Omit<ContentSourceRef, 'text'> & { text: string | undefined },
): void {
  const text = plain(source.text);
  if (!text) return;
  if (sources.some((existing) => existing.id === source.id)) {
    throw new Error(`CONTENT_SOURCE_REF_DUPLICATE:${source.id}`);
  }
  sources.push({ ...source, text });
}

/**
 * 서버가 읽은 survey만 정직성 원료로 투영한다. 기존 Site mapper에는 survey를 추가하지
 * 않고 content repository가 sites.survey를 별도로 읽어 이 스냅샷을 만든다.
 */
export function buildContentSourceSnapshot(input: {
  siteId: string;
  clientId: string;
  survey: SurveyInput;
  config: SiteConfig | null;
  capturedAt: string;
}): ContentSourceSnapshot {
  const { survey } = input;
  const sources: ContentSourceRef[] = [];
  pushSource(sources, {
    id: 'identity:business-name',
    kind: 'business-identity',
    path: 'survey.businessName',
    text: survey.businessName,
  });
  pushSource(sources, {
    id: 'identity:industry',
    kind: 'business-identity',
    path: 'survey.industry',
    text: survey.industry,
  });
  pushSource(sources, {
    id: 'identity:region',
    kind: 'business-identity',
    path: 'survey.region',
    text: survey.region,
  });
  pushSource(sources, {
    id: 'content:tagline',
    kind: 'customer-content',
    path: 'survey.tagline',
    text: survey.tagline,
  });
  pushSource(sources, {
    id: 'content:provided',
    kind: 'customer-content',
    path: 'survey.providedContent',
    text: survey.providedContent,
  });

  for (const [index, highlight] of (survey.highlights ?? []).entries()) {
    pushSource(sources, {
      id: `content:highlight:${index}`,
      kind: 'customer-content',
      path: `survey.highlights.${index}`,
      text: highlight,
    });
  }
  for (const [index, item] of (survey.contentItems ?? []).entries()) {
    pushSource(sources, {
      id: `content:item:${index}`,
      kind: 'customer-content',
      path: `survey.contentItems.${index}`,
      text: [item.name, item.description, item.price].filter(Boolean).join(' · '),
    });
  }
  for (const fact of survey.contentDepth?.facts ?? []) {
    pushSource(sources, {
      id: `fact:${fact.key}`,
      kind: 'business-fact',
      path: `survey.contentDepth.facts.${fact.key}`,
      text: fact.value,
    });
  }
  for (const [index, faq] of (survey.contentDepth?.faqAnswers ?? []).entries()) {
    pushSource(sources, {
      id: `faq:${faq.questionId}:${index}`,
      kind: 'customer-faq',
      path: `survey.contentDepth.faqAnswers.${index}`,
      text: faq.answer,
    });
  }
  const story = survey.contentDepth?.mainStorytelling;
  for (const [key, value] of Object.entries({
    brandStory: story?.brandStory,
    origin: story?.origin,
    philosophy: story?.philosophy,
  })) {
    pushSource(sources, {
      id: `content:story:${key}`,
      kind: 'customer-content',
      path: `survey.contentDepth.mainStorytelling.${key}`,
      text: value,
    });
  }
  for (const [index, proof] of (survey.contentDepth?.surveyBrief?.proofs ?? []).entries()) {
    pushSource(sources, {
      id: `proof:${proof.kind}:${index}`,
      kind: 'customer-proof',
      path: `survey.contentDepth.surveyBrief.proofs.${index}`,
      text: proof.content,
      ...(proof.sourceUrl ? { sourceUrl: proof.sourceUrl } : {}),
      ...(proof.publisher ? { publisher: proof.publisher } : {}),
      ...(proof.asOfDate ? { asOfDate: proof.asOfDate } : {}),
    });
  }

  return contentSourceSnapshotSchema.parse({
    version: 1,
    siteId: input.siteId,
    clientId: input.clientId,
    capturedAt: input.capturedAt,
    surveyVersion: survey.contentDepth?.version ?? null,
    industryId: input.config?.meta.industryId ?? null,
    industryClass: input.config?.meta.industryClass ?? null,
    sources,
  });
}
