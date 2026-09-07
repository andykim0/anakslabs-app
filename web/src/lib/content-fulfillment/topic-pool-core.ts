/**
 * What a month's articles are about, derived instead of typed.
 *
 * Until now every slot took a hand-typed topic: one operator sentence per post, per site, per
 * month. At the contracted eight posts a month that is eight typed topics per customer, and the
 * default the console offered ("Criteria for customers to check before making a decision") is the
 * same sentence for every site, which produces eight interchangeable articles.
 *
 * The pool is derived from two things the product already holds:
 *
 *  1. THE SITE'S OWN SURVEY. A question the customer actually answered is the best possible
 *     topic, because `source-snapshot.ts` puts that answer in the generator's source catalog —
 *     the article can make claims and cite them. These come first for that reason.
 *  2. THE INDUSTRY CATALOGUE in `lib/content/content-depth.ts`, which already knows which
 *     questions a clinic, a salon, or a law office is asked. These carry no stored answer, so an
 *     article written from one is a checklist of questions rather than a set of claims — which is
 *     exactly what the honesty gate permits when sources are thin.
 *
 * Everything here is pure: same site, same month, same stored posts ⇒ same topics. That is what
 * makes the batch re-runnable without reshuffling a month that is half generated.
 */
import type {
  BusinessFactAnswer,
  GuidedFaqAnswer,
  LivePurposeId,
  SurveyInput,
} from '@/lib/types/domain';
import {
  factQuestionsForIndustry,
  faqQuestionsForIndustry,
  resolveGuidedFaqAnswers,
} from '@/lib/content/content-depth';

export type ContentTopicSource =
  | 'survey-faq'
  | 'survey-offering'
  | 'survey-highlight'
  | 'industry-faq'
  | 'industry-fact';

export interface ContentTopicCandidate {
  /** Stable across runs. Used for dedupe inside the pool and to explain a choice in the log. */
  id: string;
  topic: string;
  source: ContentTopicSource;
}

/** `topicSchema` in the fulfillment service accepts 2–240 characters; nothing longer may leave here. */
export const CONTENT_TOPIC_MAX_LENGTH = 240;

const WHITESPACE = /\s+/gu;

function tidy(value: string | undefined | null): string {
  return (value ?? '').replace(WHITESPACE, ' ').trim().slice(0, CONTENT_TOPIC_MAX_LENGTH);
}

/**
 * Words that carry no subject. Dropping them stops "What are your hours?" and "What should I
 * bring?" from looking like the same topic just because both are mostly function words.
 */
const STOPWORDS = new Set([
  'a', 'about', 'after', 'all', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'before', 'by',
  'can', 'do', 'does', 'for', 'from', 'get', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'long',
  'many', 'me', 'much', 'my', 'need', 'of', 'on', 'or', 'our', 'should', 'so', 'that', 'the',
  'their', 'there', 'they', 'this', 'to', 'up', 'we', 'what', 'when', 'where', 'which', 'who',
  'why', 'will', 'with', 'you', 'your',
]);

/** Lowercased content words. Non-Latin scripts survive whole, so Korean titles still compare. */
export function contentTopicTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFKC')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 1 && !STOPWORDS.has(token)),
  );
}

/**
 * Whether a stored post already covers this topic.
 *
 * Nothing persists the topic a post was generated from — the slot stores a `YYYY-MM-post-N` slug
 * and the version stores the title the model wrote. So this compares against the titles, and it
 * is deliberately a heuristic: containment (the title says everything the topic said) or a
 * Jaccard overlap past 0.6. It exists to stop the obvious repeat, not to prove novelty.
 */
export function contentTopicIsAlreadyCovered(
  topic: string,
  usedTitles: readonly string[],
): boolean {
  const wanted = contentTopicTokens(topic);
  if (wanted.size === 0) return false;
  for (const title of usedTitles) {
    const seen = contentTopicTokens(title);
    if (seen.size === 0) continue;
    let shared = 0;
    for (const token of wanted) if (seen.has(token)) shared += 1;
    if (shared === wanted.size) return true;
    const union = wanted.size + seen.size - shared;
    if (union > 0 && shared / union >= 0.6) return true;
  }
  return false;
}

function push(
  into: ContentTopicCandidate[],
  seen: Set<string>,
  candidate: ContentTopicCandidate,
): void {
  const topic = tidy(candidate.topic);
  if (topic.length < 2) return;
  const key = [...contentTopicTokens(topic)].sort().join(' ') || topic.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  into.push({ ...candidate, topic });
}

/**
 * `requiredFactKeysFor` is a total map over `LivePurposeId` only. A legacy draft can still carry
 * one of the retired purposes (`ecommerce`, `blog_media`, `community`, `event`), and passing one
 * of those through would index the map with a key it does not have and throw inside what is
 * meant to be a pure derivation. Anything unrecognised falls back to the common question set.
 */
const LIVE_PURPOSE_IDS = new Set<string>([
  'local_store',
  'booking_service',
  'edu_membership',
  'company_brand',
  'portfolio',
  'one_page',
]);

export function liveContentPurpose(purposeId: string | undefined): LivePurposeId {
  return LIVE_PURPOSE_IDS.has(purposeId ?? '')
    ? purposeId as LivePurposeId
    : 'local_store';
}

/**
 * One subject per business fact, phrased as an article rather than as the form label it came from.
 *
 * Without this the whole industry tier reads "What to know about wi-fi before your visit",
 * "What to know about pets before your visit", eight times a month — the same stem the customer
 * would see in every title. The fallback keeps that stem for a key not listed here, so adding a
 * fact key to `content-depth.ts` cannot break this derivation.
 */
const FACT_TOPICS: Readonly<Record<string, string>> = {
  phone: 'How to reach us, and what to have ready when you call',
  openingHours: 'Our hours, and how to plan a visit around them',
  address: 'How to find us, and what to expect when you arrive',
  directions: 'Getting here: routes, landmarks, and nearby transit',
  parking: 'Where to park, and how much time to allow',
  reservation: 'How booking works, from first contact to confirmation',
  paymentMethods: 'How payment works, and what to bring',
  accessibility: 'Accessibility here, step by step',
  pets: 'Coming with a pet: what is allowed and what to plan for',
  wifi: 'Working here: Wi-Fi, seating, and what to expect',
  insurance: 'How to check what your coverage includes before you come in',
  services: 'The services we offer, and who each one is for',
  specialties: 'What we focus on, and how to tell if it fits your situation',
  credentials: 'Who provides your care, and how to ask about their training',
  duration: 'How long an appointment takes, and how to plan around it',
  caseStudies: 'How to read our past work when you are comparing options',
  signature: 'What to try first, and how to choose between the options',
  seating: 'Seating here: what is available and when',
  outlets: 'Where to sit if you are staying to work',
  groupSeating: 'Coming as a group: sizes, timing, and what to arrange ahead',
  classes: 'The classes we run, and how to pick the right one',
  materials: 'What is included, and what to bring yourself',
};

export interface ContentTopicPoolInput {
  /** `survey.industry`, the same string `contentIndustryGroup` classifies elsewhere. */
  industry: string;
  /** Any `SitePurposeId`; retired ones are narrowed by `liveContentPurpose`. */
  purposeId?: string;
  survey?: Pick<SurveyInput, 'contentDepth' | 'contentItems' | 'highlights'> | null;
}

/**
 * The ordered pool for one site. Survey-backed topics lead; the industry catalogue fills in
 * behind them so a site whose survey is thin still has a month's worth of distinct subjects.
 */
export function contentTopicPool(input: ContentTopicPoolInput): ContentTopicCandidate[] {
  const industry = tidy(input.industry) || 'generic';
  const candidates: ContentTopicCandidate[] = [];
  const seen = new Set<string>();

  const facts: BusinessFactAnswer[] = [...(input.survey?.contentDepth?.facts ?? [])];
  const faqAnswers: GuidedFaqAnswer[] = [...(input.survey?.contentDepth?.faqAnswers ?? [])];

  // 1. Questions this customer answered. The answer is in the source catalog, so the article
  //    written from it can carry claims with sourceRefs instead of only questions.
  for (const answered of resolveGuidedFaqAnswers(industry, faqAnswers, facts)) {
    push(candidates, seen, {
      id: `survey-faq:${answered.questionId}`,
      topic: answered.question,
      source: 'survey-faq',
    });
  }

  // 2. What the business actually sells, named by the customer.
  for (const [index, item] of (input.survey?.contentItems ?? []).entries()) {
    const name = tidy(item.name);
    if (!name) continue;
    push(candidates, seen, {
      id: `survey-offering:${index}`,
      topic: `What to ask about ${name} before you book`,
      source: 'survey-offering',
    });
  }
  for (const [index, highlight] of (input.survey?.highlights ?? []).entries()) {
    const text = tidy(highlight);
    if (!text) continue;
    push(candidates, seen, {
      id: `survey-highlight:${index}`,
      topic: `${text}: what it means for a first-time visitor`,
      source: 'survey-highlight',
    });
  }

  // 3. The industry's own question list, minus the ones a stored fact already answers.
  for (const question of faqQuestionsForIndustry(industry)) {
    push(candidates, seen, {
      id: `industry-faq:${question.id}`,
      topic: question.question,
      source: 'industry-faq',
    });
  }

  // 4. The industry's fact prompts, as subjects rather than form labels.
  for (const question of factQuestionsForIndustry(industry, liveContentPurpose(input.purposeId))) {
    push(candidates, seen, {
      id: `industry-fact:${question.key}`,
      topic: FACT_TOPICS[question.key]
        ?? `What to know about ${question.label.toLowerCase()} before you visit`,
      source: 'industry-fact',
    });
  }

  return candidates;
}

/** FNV-1a. A stable, dependency-free offset so a month's rotation is reproducible. */
function stableOffset(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export interface MonthlyTopicSelection {
  ordinal: number;
  candidate: ContentTopicCandidate;
  /** True when the pool ran out of unused subjects and the rotation wrapped onto a covered one. */
  repeated: boolean;
}

/**
 * The month's topics, one per ordinal.
 *
 * Deterministic in three ways that matter operationally: the starting point is a hash of
 * (site, month) so two sites do not publish the same article in the same week and one site does
 * not open every month with the same subject; ordinals walk the pool in order so a re-run assigns
 * ordinal 3 the topic it assigned last time; and topics already covered by a stored post are
 * moved to the back rather than dropped, so a site whose pool is exhausted still gets a full
 * month instead of a short one.
 */
export function selectMonthlyContentTopics(input: {
  pool: readonly ContentTopicCandidate[];
  usedTitles: readonly string[];
  siteId: string;
  periodMonth: string;
  count: number;
}): MonthlyTopicSelection[] {
  const count = Math.max(0, Math.trunc(input.count));
  if (count === 0 || input.pool.length === 0) return [];

  const fresh: ContentTopicCandidate[] = [];
  const covered: ContentTopicCandidate[] = [];
  for (const candidate of input.pool) {
    if (contentTopicIsAlreadyCovered(candidate.topic, input.usedTitles)) covered.push(candidate);
    else fresh.push(candidate);
  }
  // Rotate only within the fresh set: a new month should not start where the last one did, but a
  // topic the customer already has an article about stays at the back regardless of the offset.
  const offset = fresh.length > 0
    ? stableOffset(`${input.siteId}:${input.periodMonth.slice(0, 7)}`) % fresh.length
    : 0;
  const rotated = fresh.map((_, index) => fresh[(offset + index) % fresh.length]);
  const ordered = [...rotated, ...covered];

  return Array.from({ length: count }, (_unused, index) => {
    const position = index % ordered.length;
    return {
      ordinal: index + 1,
      candidate: ordered[position]!,
      repeated: position >= rotated.length || index >= ordered.length,
    };
  });
}
