import { createHash } from 'node:crypto';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  US_DEMO_SOURCE_ORIGIN,
  type ProspectPublicSourceBlock,
  type ProspectPublicSourceKind,
} from './contracts';

const PATIENT_CONTENT_RE =
  /\b(?:testimonial|patient stor(?:y|ies)|before\s*(?:and|&)\s*after|review(?:s)?|case result)\b/iu;
const PORTAL_OR_BOOKING_RE =
  /(?:patientportal|patient-portal|portal|book|booking|appointment-request|schedule-online)/iu;
const PROVIDER_PATH_RE = /\/(?:about|doctor|doctors|provider|providers|team|our-team)(?:\/|$)/iu;
const SERVICE_PATH_RE = /\/(?:service|services|treatment|treatments|procedure|procedures)(?:\/|$)/iu;
const INSURANCE_PATH_RE = /\/(?:insurance|accepted-insurance)(?:\/|$)/iu;
const FINANCING_PATH_RE =
  /\/(?:payment|payments|financing|financial|fees|pricing|membership)(?:\/|$)/iu;
const FAQ_PATH_RE = /\/(?:faq|faqs|frequently-asked-questions)(?:\/|$)/iu;
const PROVIDER_CREDENTIAL_RE =
  /\b(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD)\b/iu;
const PROVIDER_NAME_RE =
  /^(?:Dr\.?\s+)?(?:[A-Z][\p{L}'’-]+(?:\s+|$)){2,5}(?:,?\s*(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD))?$/u;
const GENERIC_HEADING_RE =
  /^(?:home|about(?: us)?|services?|contact(?: us)?|menu|welcome|learn more|read more|meet (?:our |the )?team|our team|meet (?:our |the )?(?:doctor|doctors|providers?))$/iu;
const CTA_HEADING_RE =
  /^(?:ready to\b|book\b|schedule\b|request (?:an? )?appointment\b|call (?:us|today)\b|contact us\b|get started\b|find out\b)/iu;
const PHONE_TOKEN_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/u;
const EMAIL_TOKEN_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const OPENING_HOURS_TOKEN_RE =
  /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^.]{0,80}\b(?:am|pm|closed)\b/iu;
const ADDRESS_TOKEN_RE =
  /\b\d{2,6}\s+[A-Z0-9][^,\n]{2,80},?\s+(?:Los Angeles|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b[^.\n]{0,50}\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/u;
const DATE_TOKEN_RE =
  /\b(?:19|20)\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/iu;
const CLOCK_TOKEN_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/iu;
const ZIP_TOKEN_RE = /\b\d{5}(?:-\d{4})?\b/u;
const CLINICAL_STAT_CONTEXT_RE =
  /\b(?:success(?: rate)?|prognosis|survival|lifespan|lifetime|lasts?|healing|recovery|osseointegration|bone integration|months?)\b/iu;
const OPERATIONAL_STAT_CONTEXT_RE =
  /\b(?:years?\s+(?:of\s+)?experience|years?\s+in\s+practice|serving\s+(?:patients\s+)?for|languages?\s+(?:spoken|available)|services?\s+(?:offered|available)|treatments?\s+(?:offered|available)|practice locations?|team members?|providers?)\b/iu;
const SOURCE_NUMBER_TOKEN_RE =
  /\b\d{1,3}(?:\.\d+)?(?:\s*[-–]\s*\d{1,3}(?:\.\d+)?)?\+?%?(?![\p{L}\p{N}])/u;
const MIN_PAIRED_BODY_LENGTH = 32;
const MAX_PAIRED_BODY_LENGTH = 1_600;

function clean(value: string | undefined): string | null {
  const text = value?.replace(/\s+/gu, ' ').trim();
  return text ? text : null;
}

function originalHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sourceBlock(input: {
  kind: ProspectPublicSourceKind;
  text: string;
  sourceUrl: string;
  field: string;
  ordinal?: number;
}): ProspectPublicSourceBlock {
  const text = clean(input.text)!;
  const ordinal = input.ordinal ?? 0;
  const originalSha256 = originalHash(text);
  return {
    id: `pps-${originalSha256.slice(0, 16)}-${ordinal}`,
    origin: US_DEMO_SOURCE_ORIGIN,
    kind: input.kind,
    text,
    sourceUrl: input.sourceUrl,
    sourceLocation: { field: input.field, ordinal },
    originalSha256,
  };
}

function safePage(page: CrawlPageArtifact): boolean {
  const url = new URL(page.url);
  return !PATIENT_CONTENT_RE.test(`${url.pathname} ${page.title ?? ''}`)
    && !PORTAL_OR_BOOKING_RE.test(`${url.pathname}${url.search}`);
}

interface HeadingBodyPair {
  heading: string;
  headingOrdinal: number;
  body?: string;
}

export interface ProspectPublicSourceContentUnit {
  id: string;
  sourceUrl: string;
  headingOrdinal: number;
  title: ProspectPublicSourceBlock;
  body?: ProspectPublicSourceBlock;
}

export interface ProspectPublicSourceStatUnit {
  id: string;
  title: ProspectPublicSourceBlock;
  marker: string;
}

function occurrences(text: string, needle: string): number[] {
  const result: number[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) break;
    result.push(index);
    cursor = index + Math.max(1, needle.length);
  }
  return result;
}

function boundedVerbatimBody(value: string): string | undefined {
  const body = value.replace(/^[\s:|·–—-]+/u, '').trim();
  if (body.length < MIN_PAIRED_BODY_LENGTH) return undefined;
  if (body.length <= MAX_PAIRED_BODY_LENGTH) return body;
  const bounded = body.slice(0, MAX_PAIRED_BODY_LENGTH);
  const sentenceEnd = Math.max(
    bounded.lastIndexOf('. '),
    bounded.lastIndexOf('? '),
    bounded.lastIndexOf('! '),
  );
  const wordEnd = bounded.lastIndexOf(' ');
  return (sentenceEnd >= MIN_PAIRED_BODY_LENGTH
    ? bounded.slice(0, sentenceEnd + 1)
    : wordEnd >= MIN_PAIRED_BODY_LENGTH
      ? bounded.slice(0, wordEnd)
      : bounded)
    .trim() || undefined;
}

function firstOperationalBoundary(
  page: CrawlPageArtifact,
  value: string,
): number | undefined {
  const exactBoundaries = [
    page.structured.phone,
    page.structured.address,
    page.structured.openingHours,
    ...page.connectors.map((connector) => connector.label),
  ]
    .map(clean)
    .filter((candidate): candidate is string => Boolean(candidate));
  const offsets = exactBoundaries.flatMap((boundary) => {
    const offset = value.indexOf(boundary);
    return offset >= MIN_PAIRED_BODY_LENGTH ? [offset] : [];
  });
  for (const pattern of [PHONE_TOKEN_RE, EMAIL_TOKEN_RE, OPENING_HOURS_TOKEN_RE, ADDRESS_TOKEN_RE]) {
    const match = pattern.exec(value);
    if (match && match.index >= MIN_PAIRED_BODY_LENGTH) offsets.push(match.index);
  }
  return offsets.length > 0 ? Math.min(...offsets) : undefined;
}

function splitVerbatimBody(page: CrawlPageArtifact, value: string): string {
  const boundary = firstOperationalBoundary(page, value);
  return boundary === undefined ? value : value.slice(0, boundary);
}

/**
 * Reject a heading/body unit only when its source wording is an operational CTA or an accumulated
 * contact/navigation tail. Factual contact fields are extracted separately before this filter.
 */
export function sourceTextIsOperationalBlob(
  title: string,
  body?: string,
): boolean {
  if (CTA_HEADING_RE.test(title.trim())) return true;
  const combined = `${title} ${body ?? ''}`;
  const signals = [
    PHONE_TOKEN_RE.test(combined),
    EMAIL_TOKEN_RE.test(combined),
    OPENING_HOURS_TOKEN_RE.test(combined),
    ADDRESS_TOKEN_RE.test(combined),
    /\b(?:book|schedule|request)\b[^.]{0,40}\bappointment\b/iu.test(combined),
    /\b(?:home|about|services|contact)\b(?:[^.]{0,60}\b(?:home|about|services|contact)\b){2,}/iu
      .test(combined),
  ].filter(Boolean).length;
  return signals >= 2;
}

/**
 * The crawl artifact intentionally keeps no source HTML. Pair each captured heading with the
 * verbatim normalized text between that heading and the next one. Repeated navigation headings
 * are resolved by choosing the occurrence with the largest substantive body, so nav dumps lose
 * deterministically to the actual content occurrence.
 */
export function sourceHeadingBodyPairs(page: CrawlPageArtifact): HeadingBodyPair[] {
  const pageText = page.text ?? '';
  const headings = page.headings
    .map((heading, headingOrdinal) => ({
      heading: clean(heading),
      headingOrdinal,
    }))
    .filter((entry): entry is { heading: string; headingOrdinal: number } => Boolean(
      entry.heading && !GENERIC_HEADING_RE.test(entry.heading),
    ));
  const allHeadingStarts = [...new Set(headings.flatMap(
    (entry) => occurrences(pageText, entry.heading),
  ))].sort((left, right) => left - right);
  return headings.map((entry) => {
    const starts = occurrences(pageText, entry.heading);
    const candidates = starts.map((start) => {
      const bodyStart = start + entry.heading.length;
      const bodyEnd = allHeadingStarts.find((candidate) => candidate >= bodyStart)
        ?? pageText.length;
      return boundedVerbatimBody(splitVerbatimBody(page, pageText.slice(bodyStart, bodyEnd)));
    }).filter((body): body is string => Boolean(body));
    const body = candidates.sort((left, right) => (
      right.length - left.length || left.localeCompare(right)
    ))[0];
    return {
      heading: entry.heading,
      headingOrdinal: entry.headingOrdinal,
      ...(body ? { body } : {}),
    };
  });
}

function pageBlocks(page: CrawlPageArtifact): ProspectPublicSourceBlock[] {
  if (!safePage(page)) return [];
  const blocks: ProspectPublicSourceBlock[] = [];
  const add = (
    kind: ProspectPublicSourceKind,
    raw: string | undefined,
    field: string,
    ordinal = 0,
  ) => {
    const text = clean(raw);
    if (!text || PATIENT_CONTENT_RE.test(text)) return;
    blocks.push(sourceBlock({ kind, text, sourceUrl: page.url, field, ordinal }));
  };
  add('business_name', page.structured.businessName ?? page.title, 'structured.businessName');
  add('phone', page.structured.phone, 'structured.phone');
  add('address', page.structured.address, 'structured.address');
  add('opening_hours', page.structured.openingHours, 'structured.openingHours');

  const url = new URL(page.url);
  if (url.pathname === '/' || PROVIDER_PATH_RE.test(url.pathname)) {
    const providerHeadings = PROVIDER_PATH_RE.test(url.pathname)
      ? page.headings
          .map(clean)
          .filter((value): value is string => Boolean(
            value
            && !GENERIC_HEADING_RE.test(value)
            && value.length <= 160,
          ))
      : [];
    const providerName = providerHeadings.find((heading) => PROVIDER_NAME_RE.test(heading));
    if (providerName) {
      add(
        'provider_name',
        providerName,
        'headings',
        page.headings.findIndex((heading) => clean(heading) === providerName),
      );
    }
    const providerCredential = providerHeadings.find(
      (heading) => heading !== providerName && PROVIDER_CREDENTIAL_RE.test(heading),
    );
    if (providerCredential) {
      add(
        'provider_credential',
        providerCredential,
        'headings',
        page.headings.findIndex((heading) => clean(heading) === providerCredential),
      );
    }
    add(
      PROVIDER_PATH_RE.test(url.pathname) ? 'provider_bio' : 'introduction',
      page.structured.description ?? page.description,
      page.structured.description ? 'structured.description' : 'description',
    );
  }
  if (SERVICE_PATH_RE.test(url.pathname)) {
    sourceHeadingBodyPairs(page)
      .filter((pair) => pair.heading.length <= 120)
      .filter((pair) => !sourceTextIsOperationalBlob(pair.heading, pair.body))
      .slice(0, 12)
      .forEach((pair) => {
        if (pair.heading.endsWith('?')) {
          add('faq_question', pair.heading, 'headings', pair.headingOrdinal);
          add('faq_answer', pair.body, 'text', pair.headingOrdinal);
        } else {
          add('service', pair.heading, 'headings', pair.headingOrdinal);
          add('service_detail', pair.body, 'text', pair.headingOrdinal);
        }
      });
  }
  if (INSURANCE_PATH_RE.test(url.pathname) || FINANCING_PATH_RE.test(url.pathname)) {
    const kind: ProspectPublicSourceKind = INSURANCE_PATH_RE.test(url.pathname)
      ? 'insurance'
      : 'price_or_financing';
    add(
      kind,
      page.structured.description ?? page.description,
      page.structured.description ? 'structured.description' : 'description',
    );
    sourceHeadingBodyPairs(page)
      .filter((pair) => pair.heading.length <= 160)
      .slice(0, 8)
      .forEach((pair) => {
        add(kind, pair.heading, 'headings', pair.headingOrdinal);
        add(kind, pair.body, 'text', pair.headingOrdinal);
      });
    page.structured.contentItems.slice(0, 12).forEach((item, index) => {
      add(kind, item.name, 'structured.contentItems.name', index);
      add('price_or_financing', item.price, 'structured.contentItems.price', index);
    });
  }
  if (FAQ_PATH_RE.test(url.pathname)) {
    sourceHeadingBodyPairs(page)
      .filter((pair) => pair.heading.endsWith('?') && pair.heading.length <= 240)
      .filter((pair) => !sourceTextIsOperationalBlob(pair.heading, pair.body))
      .slice(0, 12)
      .forEach((pair) => {
        add('faq_question', pair.heading, 'headings', pair.headingOrdinal);
        add('faq_answer', pair.body, 'text', pair.headingOrdinal);
      });
  }
  return blocks;
}

export function prospectPublicSourceBlocks(
  artifact: CrawlArtifactPayload,
): ProspectPublicSourceBlock[] {
  const seen = new Set<string>();
  return artifact.pages.flatMap(pageBlocks).filter((block) => {
    const key = `${block.kind}:${block.text.toLocaleLowerCase('en-US')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Rebuild feature-ready title/body units only from immutable source blocks. */
export function prospectPublicSourceContentUnits(
  blocks: readonly ProspectPublicSourceBlock[],
): ProspectPublicSourceContentUnit[] {
  return blocks
    .filter((block) => block.kind === 'service')
    .map((title) => {
      const body = blocks.find((candidate) => (
        candidate.kind === 'service_detail'
        && candidate.sourceUrl === title.sourceUrl
        && candidate.sourceLocation.ordinal === title.sourceLocation.ordinal
      ));
      return {
        id: `clinic-source-unit-${title.id}`,
        sourceUrl: title.sourceUrl,
        headingOrdinal: title.sourceLocation.ordinal,
        title,
        ...(body ? { body } : {}),
      };
    });
}

/**
 * Only operational context may enter the display strip. Clinical outcome, prognosis, lifetime,
 * and healing figures remain ordinary source prose after the advertising gate; they are never
 * amplified here.
 */
export function prospectPublicSourceOperationalStats(
  blocks: readonly ProspectPublicSourceBlock[],
): ProspectPublicSourceStatUnit[] {
  return blocks.flatMap((block) => {
    if (['phone', 'address', 'opening_hours'].includes(block.kind)) return [];
    if (
      PHONE_TOKEN_RE.test(block.text)
      || ADDRESS_TOKEN_RE.test(block.text)
      || OPENING_HOURS_TOKEN_RE.test(block.text)
      || DATE_TOKEN_RE.test(block.text)
      || CLOCK_TOKEN_RE.test(block.text)
      || ZIP_TOKEN_RE.test(block.text)
      || CLINICAL_STAT_CONTEXT_RE.test(block.text)
      || !OPERATIONAL_STAT_CONTEXT_RE.test(block.text)
    ) return [];
    const marker = SOURCE_NUMBER_TOKEN_RE.exec(block.text)?.[0];
    if (!marker) return [];
    return [{
      id: `clinic-source-stat-${block.id}`,
      title: block,
      marker,
    }];
  }).slice(0, 4);
}

export function sourceBlockHashIsValid(block: ProspectPublicSourceBlock): boolean {
  return originalHash(block.text) === block.originalSha256;
}

export function sourceLooksEnglish(blocks: readonly ProspectPublicSourceBlock[]): boolean {
  const substantive = blocks.filter((block) => (
    ['introduction', 'service', 'service_detail', 'provider_bio'].includes(block.kind)
  ));
  const text = substantive.map((block) => block.text).join(' ');
  const latinLetters = text.match(/[A-Za-z]/gu)?.length ?? 0;
  const koreanLetters = text.match(/[가-힣]/gu)?.length ?? 0;
  const kinds = new Set(blocks.map((block) => block.kind));
  return (
    kinds.has('business_name')
    && substantive.length >= 2
    && latinLetters >= 80
    && latinLetters >= koreanLetters * 4
  );
}
