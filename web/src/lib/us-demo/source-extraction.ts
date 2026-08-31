import { createHash } from 'node:crypto';
import type { CrawlArtifactPayload, CrawlPageArtifact } from '@/lib/crawl/contracts';
import {
  US_DEMO_SOURCE_ORIGIN,
  type ProspectPublicSourceBlock,
  type ProspectPublicSourceKind,
} from './contracts';
import {
  runClinicSourceExtraction,
} from '@/lib/clinic-engine/pipeline';
import { US_MEDICAL_OUTREACH_PROFILE } from '@/lib/clinic-engine/profiles';
import { sourceTextIsOperationalBlob } from '@/lib/clinic-engine/source-text-gates';
import {
  sourceHeadingIsChromeSectionLabel,
  sourceLastSentenceEnd,
  sourceProseWithoutTrailingChrome,
  sourceTextIsKeywordRun,
  sourceTextIsSiteChrome,
} from './source-noise';
export { sourceTextIsOperationalBlob } from '@/lib/clinic-engine/source-text-gates';

const PATIENT_CONTENT_RE =
  /\b(?:testimonial|patient stor(?:y|ies)|before\s*(?:and|&)\s*after|review(?:s)?|case result)\b/iu;
const PORTAL_OR_BOOKING_RE =
  /(?:patientportal|patient-portal|portal|book|booking|appointment-request|schedule-online)/iu;
/**
 * A whole path SEGMENT that names the page where a practice introduces its people.
 *
 * The predicate this replaces was `/(?:about|doctor|doctors|provider|providers|team|our-team)(?:\/|$)/`,
 * which required the word to sit immediately after a slash. `/meet-our-doctor/` therefore matched
 * nothing, and one practice's entire biography — DDS from USC, licensed in California in 1996,
 * almost thirty years in Los Angeles, gold-level Invisalign for over twenty, five society
 * memberships — was never read at all. Its demo carried the two sentences of `/about/`'s meta
 * description instead.
 *
 * ANCHORED TO THE WHOLE SEGMENT, and matched at any depth. Anchoring is what keeps a blog post out:
 * a post at `/meet-our-new-scanner/` is one segment that this pattern does not match, whereas an
 * unanchored `doctor` would have claimed `/ask-your-doctor-about-invisalign/`. Depth is what lets
 * `/team/dr-nick-mavrostomos/` and `/about/dr-nam` keep working, which the old pattern already did.
 *
 * Measured over all eight corpora (287 distinct paths): gains `/meet-our-doctor/` and
 * `/meet-our-team/` on Brentwood, `/about-us/`, `/about-us/dr-apa/` and
 * `/about-us/philanthropy-partnerships/` on APA, `/about-us/` on dental360, and loses nothing that
 * the old predicate matched. No blog post, article or category page is claimed on any corpus.
 *
 * `dr-<name>` is deliberately NOT a segment of its own: every such page in the corpora already
 * matches through its `team`/`about` parent, and Brentwood files its blog at the site root, where
 * a `dr-` slug on a post would have no tree to be excluded by.
 */
const PROVIDER_SEGMENT_RE =
  /^(?:about|about-us|meet-(?:our-|the-|your-)?(?:doctors?|dentists?|providers?|physicians?|surgeons?|team|staff|us)|our-(?:doctors?|dentists?|providers?|physicians?|surgeons?|team|staff)|doctors?|providers?|physicians?|team|our-team|staff)$/iu;
/** Trees whose pages are posts about the practice, never the page that introduces its people. */
const NON_PROVIDER_TREE_RE =
  /\/(?:blog|news|press|category|tag|article|articles|post|posts|buzz)(?:\/|$)/iu;

function pathIntroducesProviders(pathname: string): boolean {
  if (NON_PROVIDER_TREE_RE.test(pathname)) return false;
  return pathname.split('/').some((segment) => (
    segment.length > 0 && PROVIDER_SEGMENT_RE.test(segment)
  ));
}
const SERVICE_PATH_RE = /\/(?:service|services|treatment|treatments|procedure|procedures)(?:\/|$)/iu;
/**
 * Most practices never put the word "service" in a treatment page's URL. This clinic files its
 * six treatment pages under /general-dentistry/, /oral-surgery/, /orthodontics/ and the like, so
 * a path gate spelled only as "service" read every one of them as having nothing to say and the
 * demo compiled from a single page.
 *
 * "dentist" alone is deliberately absent: it appears in location slugs such as
 * /locations/irving-park-family-dentist/, which lists an address rather than describing care.
 */
const TREATMENT_PATH_RE =
  /(?:^|[/-])(?:dentistry|orthodontics?|endodontics?|periodontics?|prosthodontics?|implants?|veneers?|crowns?|bridges?|dentures?|whitening|invisalign|braces|aligners?|extractions?|root-canal|surgery|sedation|cosmetic|restorative|preventive|pediatric|emergency-dental|wisdom-teeth|smile-makeover|gum-(?:care|disease|treatment)|teeth-cleaning|dental-(?:care|exam|cleaning))(?:[/-]|$)/iu;
/** Pages that exist on every clinic site and never describe a treatment. */
const NON_TREATMENT_PATH_RE =
  /\/(?:locations?|career|careers|jobs|blog|news|press|privacy|privacy-policy|terms|sitemap|search|cart|account|login|gallery)(?:\/|$)/iu;

function pathOffersTreatmentContent(pathname: string): boolean {
  if (NON_TREATMENT_PATH_RE.test(pathname)) return false;
  return SERVICE_PATH_RE.test(pathname) || TREATMENT_PATH_RE.test(pathname);
}
const INSURANCE_PATH_RE = /\/(?:insurance|accepted-insurance)(?:\/|$)/iu;
const FINANCING_PATH_RE =
  /\/(?:payment|payments|financing|financial|fees|pricing|membership)(?:\/|$)/iu;
const FAQ_PATH_RE = /\/(?:faq|faqs|frequently-asked-questions)(?:\/|$)/iu;
const PROVIDER_CREDENTIAL_RE =
  /\b(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD)\b/iu;
const PROVIDER_NAME_RE =
  /^(?:Dr\.?\s+[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){0,4}(?:,\s*(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD))?|[A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+){1,4},\s*(?:DDS|DMD|MD|DO|BDS|MDS|MSD|FAGD|MAGD|PhD))$/u;
const GENERIC_HEADING_RE =
  /^(?:home|about(?: us)?|services?|contact(?: us)?|menu|welcome|learn more|read more|meet (?:our |the )?team|our team|meet (?:our |the )?(?:doctor|doctors|providers?))$/iu;
const GLUED_CTA_START_RE =
  /(?:Find Out|Book|Schedule|Learn More|Get|Call|Request|Contact)\b/gu;
const CTA_BOUNDARY_BRAND_RE = /^(?:MetLife|UnitedConcordia|CareCredit)$/u;
const CTA_NON_TERMINAL_PRECEDING_WORD_RE =
  /^(?:a|an|the|and|or|but|of|to|for|with|without|in|on|at|by|from|as|into|through|about|your|our|their|this|that|these|those|is|are|be|more|most|new|easy|simple|available|affordable|personalized|advanced|comprehensive|blog|services?|insurance|financing|privacy|policy|terms?|accessibility|maps?)$/iu;
const PHONE_TOKEN_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/u;
const EMAIL_TOKEN_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
/**
 * The tail used to be `\b(?:am|pm|closed)\b`, and `\b` cannot sit between a digit and a letter —
 * so "8am" and "5pm" were never valid terminators and the match had to run all the way to a
 * "Closed". On a seven-day footer the first "Closed" is 100 characters past "Monday", outside the
 * 80-character window, so the leftmost match that fit began at WEDNESDAY: Brentwood's demo
 * announced the practice opens on Wednesday. Terminating on the clock itself, and widening the
 * window to hold a full week, is what makes the whole schedule the thing that gets read.
 * Measured on all eight corpora: brentwood recovers Monday and Tuesday, apa and enamel gain a
 * reading they never had, and cameods/dental360/iddental/larkfield/northbank are byte-identical.
 */
const OPENING_HOURS_TOKEN_RE =
  /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^.]{0,150}(?:\bclosed\b|\d\s*[ap]\.?m\.?\b)/iu;
const HOURS_LABEL_RE = /\b(?:office|opening|business)\s+hours?\s*:/iu;
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
const GLUED_LIST_BOUNDARY_RE = /[a-z)][A-Z0-9]/gu;
const GLUED_LIST_START_RE = /[.!?][A-Z]/gu;
const MAX_VERBATIM_LIST_ITEMS = 12;

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

export interface HeadingBodyPair {
  heading: string;
  headingOrdinal: number;
  body?: string;
  /** Operational clipping applied, but before the glued CTA tail is split. */
  bodyBeforeCtaSplit?: string;
  /** Exact suffix moved to a local source-backed CTA block; concatenation restores the input. */
  relocatedCta?: string;
}

export interface ProspectPublicSourceContentUnit {
  id: string;
  sourceUrl: string;
  headingOrdinal: number;
  title: ProspectPublicSourceBlock;
  body?: ProspectPublicSourceBlock;
  /** Classification-only parent heading; never rendered as substitute copy. */
  parentTitle?: ProspectPublicSourceBlock;
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
  for (const pattern of [
    PHONE_TOKEN_RE,
    EMAIL_TOKEN_RE,
    OPENING_HOURS_TOKEN_RE,
    HOURS_LABEL_RE,
    ADDRESS_TOKEN_RE,
  ]) {
    const match = pattern.exec(value);
    if (match && match.index >= MIN_PAIRED_BODY_LENGTH) offsets.push(match.index);
  }
  return offsets.length > 0 ? Math.min(...offsets) : undefined;
}

export function splitKnownCtaTail(value: string): {
  body: string;
  relocatedCta?: string;
} {
  GLUED_CTA_START_RE.lastIndex = 0;
  for (const match of value.matchAll(GLUED_CTA_START_RE)) {
    const index = match.index;
    if (index <= 0) continue;
    const leftContext = value.slice(0, index).replace(/[)\]}”"']+$/gu, '');
    if (!/[a-z]$/u.test(leftContext)) continue;
    const leftToken = /[A-Z][a-z]+$/u.exec(leftContext)?.[0]
      ?? /[\p{L}'’-]+$/u.exec(leftContext)?.[0];
    const rightToken = /^[\p{L}'’-]+/u.exec(value.slice(index))?.[0];
    if (!leftToken || !rightToken) continue;
    const joinedToken = `${leftToken}${rightToken}`;
    if (CTA_BOUNDARY_BRAND_RE.test(joinedToken)) continue;
    if (CTA_NON_TERMINAL_PRECEDING_WORD_RE.test(leftToken)) continue;
    return {
      body: value.slice(0, index),
      relocatedCta: value.slice(index),
    };
  }
  return { body: value };
}

function boundaryJoinsProtectedBrand(value: string, boundary: number): boolean {
  const left = /[A-Z][a-z]+$/u.exec(value.slice(0, boundary))?.[0]
    ?? /[\p{L}'’-]+$/u.exec(value.slice(0, boundary))?.[0];
  const right = /^[A-Z][a-z]+/u.exec(value.slice(boundary))?.[0]
    ?? /^[\p{L}'’-]+/u.exec(value.slice(boundary))?.[0];
  return Boolean(left && right && CTA_BOUNDARY_BRAND_RE.test(`${left}${right}`));
}

/**
 * The crawl snapshot normalizes list whitespace and may join adjacent source list items. Split
 * only when at least two unprotected lower→upper/number boundaries prove a list-shaped run.
 * Concatenating the returned fragments restores the exact input bytes.
 */
export function splitVerbatimListItems(value: string): string[] {
  const itemBoundaries = [...value.matchAll(GLUED_LIST_BOUNDARY_RE)]
    .map((match) => (match.index ?? -1) + 1)
    .filter((boundary) => (
      boundary > 0
      && boundary < value.length
      && !boundaryJoinsProtectedBrand(value, boundary)
    ));
  if (
    itemBoundaries.length < 2
    || itemBoundaries.length + 1 > MAX_VERBATIM_LIST_ITEMS
  ) {
    return [value];
  }
  const firstItemBoundary = itemBoundaries[0];
  const listStart = [...value.slice(0, firstItemBoundary).matchAll(GLUED_LIST_START_RE)]
    .map((match) => (match.index ?? -1) + 1)
    .at(-1);
  const boundaries = listStart
    ? [listStart, ...itemBoundaries]
    : itemBoundaries;
  const fragments = boundaries
    .reduce<string[]>((items, boundary, index) => {
      const start = index === 0 ? 0 : boundaries[index - 1];
      items.push(value.slice(start, boundary));
      return items;
    }, []);
  fragments.push(value.slice(boundaries.at(-1)));
  return fragments.every((fragment) => fragment.length > 0) ? fragments : [value];
}

export function sourceTextHasGluedListItems(value: string): boolean {
  return splitVerbatimListItems(value).length > 1;
}

function splitVerbatimBody(page: CrawlPageArtifact, value: string): {
  body: string;
  bodyBeforeCtaSplit: string;
  relocatedCta?: string;
} {
  const boundary = firstOperationalBoundary(page, value);
  const clipped = boundary === undefined ? value : value.slice(0, boundary);
  const navigationOrdinal = /[.!?]0[1-9]\s*$/u.exec(clipped);
  const withoutNavigation = navigationOrdinal
    ? clipped.slice(0, navigationOrdinal.index + 1)
    : clipped;
  const bodyBeforeCtaSplit = withoutNavigation
    .replace(/^[\s:|·–—-]+/u, '')
    .trim();
  const split = splitKnownCtaTail(bodyBeforeCtaSplit);
  return {
    body: split.body,
    bodyBeforeCtaSplit,
    ...(split.relocatedCta ? { relocatedCta: split.relocatedCta } : {}),
  };
}

/**
 * Whether a heading occurrence is the START of what the page published, or a fragment of a longer
 * run that merely contains those characters.
 *
 * `indexOf` has no notion of a boundary, so a heading that is a substring of a longer string the
 * page also published was paired with that string's LEFTOVER TAIL. Three shapes of this were
 * measured on one practice alone: "Teeth Whitening" inside the page title
 * "Teeth Whitening in Brentwood, LA in Los Angeles, CA | Brentwood Dentistry" yielded the body
 * "in Brentwood, LA in Los Angeles, CA |"; "Implant Restoration" inside the longer heading
 * "The Role of Implant Restoration in a Smile Makeover" yielded a body starting mid-sentence; and
 * "Cosmetic Dentistry" inside "Cosmetic Dentistry at Brentwood Dentistry" yielded a body that
 * repeated its own lead. 54 such pairs exist across the eight measured corpora.
 *
 * Two tests, both about the occurrence rather than the text it produced:
 *
 * - CONTAINMENT. The page's own headings and its title are the runs it published as single
 *   strings. An occurrence sitting inside one of them, without consuming it, is a fragment. This
 *   is the "start of a block" test in the only form the artifact can answer: crawl text is DOM
 *   nodes joined by a single space, with no newlines (0 of 298 pages carry one) and no reliable
 *   terminal punctuation before a heading node — requiring one was measured to reject 47% of APA's
 *   legitimate pairs, because prose nodes routinely end without a full stop.
 * - CONTINUATION. A lowercase letter or a joining punctuation mark where the body would start
 *   means the run kept going through the match, whether it cut a token in half ("Schedule a
 *   Consult" inside "Schedule a Consultation", "Location" inside "Locations") or carried on into
 *   the next clause ("Teeth Whitening" + " in Brentwood, LA…").
 *
 * A suffix match (`end` exactly at the container's end) is deliberately allowed: it produces the
 * same body as the longer heading, which is a duplicate rather than a corruption, and rejecting it
 * would need a left-hand test that the glued crawl text cannot support.
 *
 * This is a filter on which OCCURRENCE may be paired. It never removes a heading from
 * `allHeadingStarts`, so no body grows past a boundary it used to stop at.
 */
function headingOccurrenceIsBoundary(input: {
  pageText: string;
  heading: string;
  start: number;
  containerStarts: (run: string) => readonly number[];
  containers: readonly string[];
}): boolean {
  const end = input.start + input.heading.length;
  /**
   * The body must not open mid-word or mid-sentence. A lowercase letter after the separators the
   * body trimmer strips means the run kept going ("Teeth Whitening" + " in Brentwood, LA…"), and a
   * comma or a closing bracket means the same thing with punctuation instead of a word
   * ("Dr. Ismael Khouly" + ", DDS, MS, PhD is an internationally recognised leader…").
   */
  if (/^[\s:|·–—-]*[\p{Ll},;)\]]/u.test(input.pageText.slice(end, end + 8))) return false;
  return !input.containers.some((run) => (
    run.length > input.heading.length
    && input.containerStarts(run).some(
      (runStart) => runStart <= input.start && end < runStart + run.length,
    )
  ));
}

/**
 * The crawl artifact intentionally keeps no source HTML. Pair each captured heading with the
 * verbatim normalized text between that heading and the next one. Repeated navigation headings
 * are resolved by choosing the occurrence with the largest substantive body, so nav dumps lose
 * deterministically to the actual content occurrence.
 */
export function sourceHeadingBodyPairs(page: CrawlPageArtifact): HeadingBodyPair[] {
  const pageText = page.text ?? '';
  const containers = [...new Set(
    [...page.headings, page.title].map(clean).filter((value): value is string => Boolean(value)),
  )];
  const containerStartCache = new Map<string, readonly number[]>();
  const containerStarts = (run: string): readonly number[] => {
    const cached = containerStartCache.get(run);
    if (cached) return cached;
    const found = occurrences(pageText, run);
    containerStartCache.set(run, found);
    return found;
  };
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
  /**
   * A footer column label stops being a PAIR without ceasing to be a BOUNDARY. `allHeadingStarts`
   * above is deliberately computed from the unfiltered list: it is what tells the heading before
   * it where its body ends, so removing the label from that set would extend the previous body
   * straight through the chrome it was supposed to stop at — making the contamination worse, not
   * better. Only the emitted pairs shrink.
   */
  return headings.filter(
    (entry) => !sourceHeadingIsChromeSectionLabel(entry.heading),
  ).map((entry) => {
    const starts = occurrences(pageText, entry.heading).filter((start) => (
      headingOccurrenceIsBoundary({
        pageText,
        heading: entry.heading,
        start,
        containerStarts,
        containers,
      })
    ));
    const candidates = starts.map((start) => {
      const bodyStart = start + entry.heading.length;
      const bodyEnd = allHeadingStarts.find((candidate) => candidate >= bodyStart)
        ?? pageText.length;
      const split = splitVerbatimBody(page, pageText.slice(bodyStart, bodyEnd));
      const body = boundedVerbatimBody(split.body);
      /**
       * A nav dump is not a body. The docstring above says nav occurrences "lose deterministically
       * to the actual content occurrence" — which was true only while a contaminated content
       * occurrence existed to beat them. Once the boundary filter removes that occurrence, the
       * menu is the last candidate standing and wins by default: dental360's "General Dentistry"
       * card went from a truncated stub to "Cosmetic Dentistry Restorative Dentistry Oral Surgery
       * Pediatric Dentistry Orthodontics Career About Us Contact Us".
       *
       * `sourceTextIsKeywordRun` is the menu test this file's trimmer already applies to a trailing
       * run, used here on a whole candidate body. That is narrower than the whole-block Title Case
       * rule `source-noise` measured and rejected: this never sees a heading, a provider biography
       * or a structured description — only the text a heading was paired with — and a paragraph
       * with one sentence in it is not a keyword run.
       */
      if (body && sourceTextIsKeywordRun(body)) return undefined;
      return body ? { ...split, body } : undefined;
    }).filter((candidate): candidate is {
      body: string;
      bodyBeforeCtaSplit: string;
      relocatedCta?: string;
    } => Boolean(candidate));
    const candidate = candidates.sort((left, right) => (
      right.body.length - left.body.length || left.body.localeCompare(right.body)
    ))[0];
    return {
      heading: entry.heading,
      headingOrdinal: entry.headingOrdinal,
      ...(candidate
        ? {
            body: candidate.body,
            bodyBeforeCtaSplit: candidate.bodyBeforeCtaSplit,
            ...(candidate.relocatedCta
              ? { relocatedCta: candidate.relocatedCta }
              : {}),
          }
        : {}),
    };
  });
}

/** Title separators a practice actually uses between the SEO phrase and its name. */
const TITLE_SEGMENT_SPLIT_RE = /\s+[|–—·•-]\s+|\s*\|\s*/u;

function displayNameKey(value: string): string {
  return value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '');
}

/**
 * The registrable label of a host: `www.oradentistry.com` -> `oradentistry`.
 *
 * Deliberately naive about multi-label suffixes — `example.co.uk` answers "co". That is wrong and
 * harmless: a wrong label matches no title segment, so the caller keeps the structured name. A
 * real public-suffix list is not worth a dependency for a comparison whose only failure mode is
 * declining to act.
 */
function registrableDomainLabel(pageUrl: string): string | undefined {
  let host: string;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    return undefined;
  }
  const labels = host.replace(/^www\./iu, '').split('.').filter(Boolean);
  return labels.length >= 2 ? labels[labels.length - 2].toLocaleLowerCase('en-US') : undefined;
}

/**
 * The name a practice would put on its own door.
 *
 * §2-2's chain — JSON-LD name, then og:site_name, then <title> — is right for six of the seven
 * corpora and cannot be right for the seventh, because Ora's own JSON-LD says
 * "Elk Grove CA Dentist" on 100 of 100 pages. That is an SEO phrase the practice published about
 * itself, so no amount of preferring structured data over markup will recover "Ora Dentistry".
 *
 * The evidence that does exist is the domain. A practice that owns oradentistry.com and prints
 * "Ora Dentistry" as a segment of its own <title> has told us its name twice, in two independent
 * places, and the agreement between them is what makes it safe to overrule a structured field.
 * Equality of the alphanumeric-normalised forms is required, not containment: "ID Dental Implant
 * Center" against iddentalimplant.com is a near-miss that containment would wrongly rewrite, and
 * equality correctly declines.
 *
 * This is why the fix lives here and not in `lib/import/extract.ts`, which owns the crawl-time
 * chain: every artifact already on disk has its structured.businessName baked in, so a crawl-time
 * rule would leave all seven corpora and all three golden fixtures exactly as wrong as they were.
 */
export function clinicDisplayName(page: CrawlPageArtifact): string | undefined {
  const structured = page.structured.businessName ?? page.title;
  const label = registrableDomainLabel(page.url);
  if (!label || !page.title) return structured;
  if (structured && displayNameKey(structured) === label) return structured;
  const segment = page.title
    .split(TITLE_SEGMENT_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean)
    .find((part) => displayNameKey(part) === label);
  return segment ?? structured;
}

const CHROME_EXEMPT_KINDS: ReadonlySet<ProspectPublicSourceKind> = new Set([
  'business_name',
  'phone',
  'address',
  'opening_hours',
]);

/**
 * Kinds that are meant to be sentences, and are therefore the only ones the trailing-chrome
 * trimmer may touch.
 *
 * Titles and labels are excluded on purpose: `service`, `faq_question` and `provider_name` are
 * short capitalised phrases by nature, which is exactly the shape the trimmer's keyword test
 * describes, so running it over them would ask it to distinguish a heading from a menu — a
 * judgement it was measured to get wrong. `cta`, `phone`, `address` and `opening_hours` are
 * operational fields whose whole content is the chrome-shaped thing.
 */
const PROSE_KINDS: ReadonlySet<ProspectPublicSourceKind> = new Set([
  'introduction',
  'provider_bio',
  'service_detail',
  'faq_answer',
  'insurance',
  'price_or_financing',
]);

/**
 * Page text is DOM nodes joined by a single space, so a phone node sitting next to an address node
 * becomes one run of characters. Ora Dentistry's header prints
 *
 *   "Phone: (916) 975-1000 2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758"
 *
 * and ADDRESS_TOKEN_RE's leading street number matched the phone's last four digits — every page
 * but /contact-us/ yielded "1000 2733 Elk Grove Blvd, Suite 180 Elk Grove, CA 95758". The demo
 * then printed that mangled address on its contact page and, because the practice's own contact
 * page carried the clean form, counted two distinct addresses and read one dentist as a chain.
 *
 * A street number is not the tail of a phone number. So a match that begins inside a phone token
 * is discarded and the search resumes after that phone — the address itself is untouched.
 */
/**
 * A page that prints its address twice in a row hands the match a ZIP to start from.
 *
 * Kings Park's footer runs "…Contact 5200A Rolling RoadBurke VA 22015 US 5200A Rolling RoadBurke
 * VA 22015 US…". `ADDRESS_TOKEN_RE` needs whitespace after the leading number, and "5200A" has a
 * letter glued to it, so the leftmost match it can make begins at the PREVIOUS copy's ZIP and the
 * demo's contact bar read "22015 US 5200A Rolling RoadBurke VA 22015" — the zip code twice, once
 * where the street number belongs.
 *
 * A US address does not begin with the ZIP it ends with. Where it does, the head is the tail of a
 * repetition and comes off, along with a country marker if one follows it. Nothing else is
 * touched: an address whose leading number happens to be five digits ("22015 Main St") does not
 * repeat that number at the end, so it never matches.
 */
function addressWithoutRepeatedZipHead(value: string): string {
  const tail = /(\d{5})(?:-\d{4})?$/u.exec(value);
  if (!tail) return value;
  const head = new RegExp(
    `^${tail[1]}(?:-\\d{4})?\\b[\\s,]*(?:U\\.?S\\.?A?\\.?|United States)?[\\s,]*`,
    'u',
  ).exec(value);
  if (!head || head[0].length === 0 || head[0].length === value.length) return value;
  return value.slice(head[0].length).trim() || value;
}

/**
 * A street suffix with the next word glued to it is a missing space, not a word.
 *
 * The same footer emits "Rolling RoadBurke VA 22015" because the CMS concatenates two inline
 * elements without one. The repair is anchored to the closed set of street and unit suffixes a US
 * address actually uses, followed immediately by a capital letter — so "McDonald", "LaSalle" and
 * every other legitimate internal capital is untouched, because none of them follows "Road",
 * "Suite" or "Boulevard". It also restores the locality the geo rules read: "RoadBurke" is not a
 * town, and "Burke" is.
 */
const GLUED_STREET_SUFFIX_RE =
  /\b(Road|Rd|Street|St|Avenue|Ave|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Court|Ct|Place|Pl|Circle|Cir|Highway|Hwy|Parkway|Pkwy|Terrace|Ter|Trail|Trl|Square|Sq|Suite|Ste|Floor|Unit)\.?(?=\p{Lu})/gu;

function addressWithSeparatedTokens(value: string): string {
  return value.replace(GLUED_STREET_SUFFIX_RE, (suffix) => `${suffix} `);
}

function addressFromPageText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const phones = new RegExp(PHONE_TOKEN_RE.source, 'gu');
  const spans: Array<{ start: number; end: number }> = [];
  for (let hit = phones.exec(text); hit; hit = phones.exec(text)) {
    spans.push({ start: hit.index, end: hit.index + hit[0].length });
  }
  for (let from = 0; from <= text.length;) {
    const match = ADDRESS_TOKEN_RE.exec(text.slice(from));
    if (!match) return undefined;
    const start = from + match.index;
    const phone = spans.find((span) => span.start <= start && start < span.end);
    if (!phone) {
      return addressWithSeparatedTokens(addressWithoutRepeatedZipHead(match[0]));
    }
    from = phone.end;
  }
  return undefined;
}

/** How many of a provider page's pairs may become biographies. Four bios reach a demo at most. */
const PROVIDER_BIO_PAIR_LIMIT = 4;
/**
 * A bio slot is a paragraph, not a page. Longer runs are cut back to whole sentences.
 *
 * 900 rather than something rounder because of what it buys on the practice this was measured
 * against: it carries the degree, the licence year, the three decades, the advanced-restorative
 * certifications and the twenty years of gold-level Invisalign, and stops at the finished sentence
 * before the run that follows them — an unpunctuated glue of six society names ending in a
 * magazine's "Best Aesthetic Dentist in LA", which is a superiority claim the demo screen would
 * rewrite anyway. A shorter ceiling stopped at the third sentence; a longer one buys only that run.
 */
const PROVIDER_BIO_MAXIMUM = 900;
/** Below this, and below two finished sentences, a run is a caption or a roster of links. */
const PROVIDER_BIO_MINIMUM = 200;
/**
 * A paragraph that names a clinician. `Dr.` followed by a capital, or a post-nominal in either the
 * plain or the dotted rendering a practice prints on a name plate ("NEDA NAIM D.D.S.").
 */
const PROVIDER_BIO_SUBJECT_RE =
  /\bDr\.?\s+\p{Lu}|\b(?:DDS|DMD|BDS|MDS|MSD|FAGD|MAGD)\b|\b(?:D\.D\.S|D\.M\.D|M\.D)\.?/u;
/**
 * The LAST segment of a path whose subject is the practice's people.
 *
 * `pathIntroducesProviders` matches any segment so that a page nested under `/team/` or `/about/`
 * keeps its provider treatment, which is what the old predicate did and what APA and ID Dental
 * rely on. Composition needs the narrower question — is this page ABOUT the people, or a topic
 * filed under the About tree — because the wider one made `/about/technology` contribute a Cone
 * Beam CT paragraph as a biography and `/about-us/philanthropy-partnerships/` a donation
 * announcement. Both are the practice's own writing; neither is anybody's biography.
 *
 * `dr-<name>` is safe HERE and not in the outer predicate: composition only ever runs on a page the
 * outer predicate already accepted, so a root-level blog post with a `dr-` slug never reaches it.
 */
const PROVIDER_LEAF_SEGMENT_RE = /^dr-[\p{L}\d-]+$/iu;

function pathIsAboutTheProviders(pathname: string): boolean {
  const leaf = pathname.split('/').filter(Boolean).at(-1);
  if (!leaf) return false;
  return PROVIDER_SEGMENT_RE.test(leaf) || PROVIDER_LEAF_SEGMENT_RE.test(leaf);
}

/**
 * A provider page's paragraph as a biography: about a person, at least a short paragraph of
 * finished sentences, and cut back to whole sentences under the ceiling. Returns nothing for the
 * office copy, the photo caption and the roster of colleague links that share these pages.
 */
function providerBiographyProse(value: string | undefined): string | undefined {
  const text = clean(value);
  if (!text || text.length < PROVIDER_BIO_MINIMUM) return undefined;
  if (!PROVIDER_BIO_SUBJECT_RE.test(text)) return undefined;
  const first = sourceLastSentenceEnd(text.slice(0, Math.floor(text.length / 2)));
  if (first <= 0 || sourceLastSentenceEnd(text) <= first) return undefined;
  if (text.length <= PROVIDER_BIO_MAXIMUM) return text;
  const boundary = sourceLastSentenceEnd(text.slice(0, PROVIDER_BIO_MAXIMUM));
  return boundary > 0 ? text.slice(0, boundary).trim() || undefined : undefined;
}

/** Whether the composed paragraph and the page's meta description are the same biography. */
function biographyRepeatsDescription(bio: string, description: string | undefined): boolean {
  const summary = clean(description);
  if (!summary || summary.length < 60) return false;
  return bio.includes(summary.slice(0, 60)) || summary.includes(bio.slice(0, 60));
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
    // Contact fields are exempt: hours and addresses share vocabulary with footer chrome and are
    // extracted from structured data, not from the page-text sweep that picks chrome up.
    if (!CHROME_EXEMPT_KINDS.has(kind) && sourceTextIsSiteChrome(text)) return;
    /**
     * Body-copy hygiene, applied to the prose kinds only and at the one point every one of them
     * passes through. It runs here rather than at a render site so that the block a consumer
     * receives is already clean — the insurance card is assembled straight from blocks and never
     * reaches `clinicCardBody`, which is why the length band and the keyword-blob test that guard
     * every other card never saw Brentwood's contamination.
     *
     * Extraction is upstream of the whole compile, so this is upstream of the medical-ad screen
     * in `prepareUsMedicalPreview` by construction: blocks -> `compileUsMedicalDemo` ->
     * `enforceGeneratedMedicalConfig`. The screen therefore reads the trimmed sentence, never the
     * menu that used to follow it.
     */
    const prose = PROSE_KINDS.has(kind) ? sourceProseWithoutTrailingChrome(text) : text;
    if (!prose) return;
    blocks.push(sourceBlock({ kind, text: prose, sourceUrl: page.url, field, ordinal }));
  };
  add('business_name', clinicDisplayName(page), 'structured.businessName');
  add('phone', page.structured.phone, 'structured.phone');
  /**
   * Structured extraction misses address and hours on sites that print them as ordinary footer
   * text — one twenty-page crawl produced structured.address on zero pages while every page
   * carried "3435 W. Irving Park Rd, Chicago, IL 60618" in its text. Without these the demo has
   * no visible NAP and no LocalBusiness detail, and scores below the site it rebuilt.
   *
   * The patterns are the ones this file already uses to find the operational boundary, so a
   * match is the same shape the compiler elsewhere treats as an address or an hours line, and
   * the text stays verbatim.
   */
  add(
    'address',
    page.structured.address ?? addressFromPageText(page.text),
    page.structured.address ? 'structured.address' : 'text.address',
  );
  add(
    'opening_hours',
    page.structured.openingHours ?? OPENING_HOURS_TOKEN_RE.exec(page.text ?? '')?.[0],
    page.structured.openingHours ? 'structured.openingHours' : 'text.opening-hours',
  );

  const url = new URL(page.url);
  const introducesProviders = pathIntroducesProviders(url.pathname);
  if (url.pathname === '/' || introducesProviders) {
    const providerHeadings = introducesProviders
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
    /**
     * The biography the practice actually published, ahead of the one it wrote for search engines.
     *
     * Until now `provider_bio` was `structured.description` and nothing else, so the About section
     * of a demo was whatever fitted in a meta tag. Brentwood's read "Brentwood Dentistry is located
     * in the heart of West Los Angeles. Dr. Neda Naim and her team do their utmost to ensure that
     * you have a pleasant experience." while `/meet-our-doctor/` carried her degree, her licence
     * year, her Invisalign standing and her society memberships — none of which the demo could
     * reach, because that path was not a provider path.
     *
     * Composed from the page's own heading/body pairs and emitted BEFORE the description, because
     * the meta description is a summary of the page and the page is the source. Only pairs that
     * name a clinician qualify: an About page's office copy ("our treatment rooms are equipped
     * with...") is a practice introduction, not a biography, and giving it the `provider_bio` kind
     * would have let it crowd the doctor out of the four-slot provider list downstream.
     *
     * Each contribution is cut to whole sentences under a ceiling — half a sentence about a named
     * person is worse than a shorter bio. Credential sentences are kept: a credential is a factual
     * claim the practice attests to under the terms of service, and `medical-credential-claim` is
     * an advisory rule, so it reaches the operator on `deliveryAdvisories` rather than being
     * suppressed here.
     */
    if (introducesProviders && pathIsAboutTheProviders(url.pathname)) {
      const description = page.structured.description ?? page.description;
      sourceHeadingBodyPairs(page)
        .filter((pair) => pair.body && !pair.heading.endsWith('?'))
        .slice(0, PROVIDER_BIO_PAIR_LIMIT)
        .forEach((pair) => {
          const bio = providerBiographyProse(pair.body);
          // The description of a one-doctor page is a summary OF this paragraph, not a second bio.
          if (bio && !biographyRepeatsDescription(bio, description)) {
            add('provider_bio', bio, 'text', pair.headingOrdinal);
          }
        });
    }
    /**
     * A META DESCRIPTION IS A BIOGRAPHY ONLY WHERE THERE IS A CLINICIAN TO HAVE ONE.
     *
     * The kind used to be decided by the PATH alone, so any page under a provider tree handed its
     * meta description to a section headed "Meet the Doctor". Kings Park's `/meet-our-staff` reads
     * "We welcome everyone to meet our professional and lovely staff at Kings Park Dental Center
     * in Burke VA." — office copy about a page of assistants, hygienists and coordinators — and it
     * became the practice's third doctor, wearing the office manager's photograph. Dental 360's
     * `/about-us/` ("Learn about Dental 360 USA & our commitment to providing high-quality dental
     * care.") is the same shape, and APA's `/team/` and `/about-us/philanthropy-partnerships/`
     * are two more.
     *
     * Two kinds of evidence count, either one alone: the description NAMES a clinician
     * (`PROVIDER_BIO_SUBJECT_RE`, the same subject test the composed bios above already pass), or
     * the page itself contributed a `provider_name` heading — which is what keeps Larkfield's and
     * Northbank's "Meet the dermatologists" one-line descriptions attached to the doctor they
     * head, and what keeps Forefront's description, which names Dr. Nathan Powell outright.
     *
     * With neither, the sentence is not thrown away: it stays the practice's own words as an
     * `introduction`, which is what it is.
     */
    const pageDescription = page.structured.description ?? page.description;
    const descriptionIsBiography = introducesProviders
      && Boolean(providerName || (pageDescription && PROVIDER_BIO_SUBJECT_RE.test(pageDescription)));
    add(
      descriptionIsBiography ? 'provider_bio' : 'introduction',
      pageDescription,
      page.structured.description ? 'structured.description' : 'description',
    );
  }
  if (pathOffersTreatmentContent(url.pathname)) {
    sourceHeadingBodyPairs(page)
      .filter((pair) => pair.heading.length <= 120)
      .slice(0, 12)
      .forEach((pair) => {
        if (pair.relocatedCta) {
          add('cta', pair.relocatedCta, 'text.cta', pair.headingOrdinal);
        }
        if (sourceTextIsOperationalBlob(pair.heading, pair.body)) return;
        if (pair.heading.endsWith('?')) {
          add('faq_question', pair.heading, 'headings', pair.headingOrdinal);
          const listItems = splitVerbatimListItems(pair.body ?? '');
          add('faq_answer', listItems[0], 'text', pair.headingOrdinal);
          listItems.slice(1).forEach((item, index) => {
            add(
              'service',
              item,
              `text.list-item.${index + 1}`,
              pair.headingOrdinal,
            );
          });
        } else {
          add('service', pair.heading, 'headings', pair.headingOrdinal);
          const listItems = splitVerbatimListItems(pair.body ?? '');
          if (listItems.length > 1) {
            listItems.forEach((item, index) => {
              add(
                'service_detail',
                item,
                `text.list-item.${index}`,
                pair.headingOrdinal,
              );
            });
          } else {
            add('service_detail', pair.body, 'text', pair.headingOrdinal);
          }
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
  /**
   * A heading that ends in a question mark, with a body under it, is a FAQ wherever it sits. The
   * path was standing in for that signal and reading it wrong: one clinic kept its two questions
   * on /orthodontics/, which matches neither the FAQ nor the service path, so the demo compiled
   * with no FAQ section while the source had one. Service pages keep their own branch above, so
   * this runs only where nothing has claimed the page yet.
   */
  if (FAQ_PATH_RE.test(url.pathname) || !pathOffersTreatmentContent(url.pathname)) {
    sourceHeadingBodyPairs(page)
      .filter((pair) => pair.heading.endsWith('?') && pair.heading.length <= 240)
      .slice(0, 12)
      .forEach((pair) => {
        if (pair.relocatedCta) {
          add('cta', pair.relocatedCta, 'text.cta', pair.headingOrdinal);
        }
        if (sourceTextIsOperationalBlob(pair.heading, pair.body)) return;
        const listItems = splitVerbatimListItems(pair.body ?? '');
        add('faq_question', pair.heading, 'headings', pair.headingOrdinal);
        add('faq_answer', listItems[0], 'text', pair.headingOrdinal);
        listItems.slice(1).forEach((item, index) => {
          add(
            'service',
            item,
            `text.list-item.${index + 1}`,
            pair.headingOrdinal,
          );
        });
      });
  }
  return blocks;
}

/**
 * Kinds whose identical text on two different pages is two different things.
 *
 * A practice that gives every treatment page the same section headings — "Recovery and follow-up",
 * "Who it suits" — is writing good pages. Deduping those globally kept the heading only on
 * whichever page happened to be processed first and orphaned every body underneath it on the
 * others: a `service_detail` whose `service` title no longer exists at its ordinal is claimed by no
 * content unit, so nothing renders it. Measured on the orthopedic practice: five of six treatment
 * pages lost their headings, orphaning 15 blocks and 5,006 characters, including every material-
 * risk sentence the practice published — which the medical screen then reported as an omission.
 *
 * Everything else keeps the global key on purpose. Business name, phone, address, hours and the
 * introduction sit in the header and footer of every page, and the global key is the only reason a
 * twenty-page crawl yields one of each instead of twenty.
 */
const PAGE_SCOPED_DEDUPE_KINDS: ReadonlySet<ProspectPublicSourceKind> = new Set([
  'service',
  'service_detail',
]);

function extractProspectPublicSourceBlocks(
  artifact: CrawlArtifactPayload,
): ProspectPublicSourceBlock[] {
  const seen = new Set<string>();
  return artifact.pages.flatMap(pageBlocks).filter((block) => {
    const sourceLocal = block.kind === 'cta'
      || block.sourceLocation.field.startsWith('text.list-item.');
    if (!sourceLocal && PAGE_SCOPED_DEDUPE_KINDS.has(block.kind)) {
      // Page-scoped, deliberately not ordinal-scoped: the same heading twice on one page is still
      // one heading, so within-page repetition collapses exactly as it did before.
      const scoped = `${block.kind}:${block.sourceUrl}:${block.text.toLocaleLowerCase('en-US')}`;
      if (seen.has(scoped)) return false;
      seen.add(scoped);
      return true;
    }
    const key = sourceLocal
      ? [
          block.kind,
          block.sourceUrl,
          block.sourceLocation.ordinal,
          block.sourceLocation.field,
          block.text,
        ].join(':')
      : `${block.kind}:${block.text.toLocaleLowerCase('en-US')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function prospectPublicSourceBlocks(
  artifact: CrawlArtifactPayload,
): ProspectPublicSourceBlock[] {
  return runClinicSourceExtraction({
    profile: US_MEDICAL_OUTREACH_PROFILE,
    value: artifact,
    extract: extractProspectPublicSourceBlocks,
  });
}

/** Rebuild feature-ready title/body units only from immutable source blocks. */
export function prospectPublicSourceContentUnits(
  blocks: readonly ProspectPublicSourceBlock[],
): ProspectPublicSourceContentUnit[] {
  return blocks
    .filter((block) => block.kind === 'service')
    .flatMap((title) => {
      const matchingDetails = blocks.filter((candidate) => (
        candidate.kind === 'service_detail'
        && candidate.sourceUrl === title.sourceUrl
        && candidate.sourceLocation.ordinal === title.sourceLocation.ordinal
      ));
      const listItems = matchingDetails.filter((candidate) => (
        candidate.sourceLocation.field.startsWith('text.list-item.')
      ));
      const details = listItems.length > 1
        ? listItems.sort((left, right) => (
            left.sourceLocation.field.localeCompare(
              right.sourceLocation.field,
              'en-US',
              { numeric: true },
            )
          ))
        : matchingDetails.filter((candidate) => candidate.sourceLocation.field === 'text');
      const body = details[0];
      const first: ProspectPublicSourceContentUnit = {
        id: `clinic-source-unit-${title.id}`,
        sourceUrl: title.sourceUrl,
        headingOrdinal: title.sourceLocation.ordinal,
        title,
        ...(body ? { body } : {}),
      };
      return [
        first,
        ...details.slice(1).map((detail, index) => ({
          id: `clinic-source-list-unit-${detail.id}-${index + 1}`,
          sourceUrl: title.sourceUrl,
          headingOrdinal: title.sourceLocation.ordinal,
          title: detail,
          parentTitle: title,
        })),
      ];
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
