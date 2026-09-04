/**
 * [CITE$] Pure question derivation. No I/O, no clock, no model call.
 *
 * The single hard rule: a citation question must be DISCOVERY-shaped — what a nearby
 * customer types into an assistant when they do not yet know this business exists.
 * Third person, with the place and the need in the sentence.
 *
 *   good: "Which dentist near Lincoln Park can see a new patient this week?"
 *   bad : "What are your hours?"
 *
 * The bad one is not merely weak, it is unmeasurable: addressed to the business, it
 * gives the engine no subject to name, so the answer can never name anyone and the
 * probe burns budget to record a guaranteed miss.
 */

export const CITATION_QUESTION_MIN_CHARS = 12;
export const CITATION_QUESTION_MAX_CHARS = 200;

/**
 * Openers that address the business directly. Anchored at the start because these are
 * the second-person forms; the same words mid-sentence ("...and do you know which
 * clinic...") are not the failure mode we are excluding.
 */
const ADDRESSED_TO_BUSINESS_PATTERNS: readonly RegExp[] = [
  /^what are your\b/u,
  /^do you\b/u,
  /^are you\b/u,
  /^where can i park\b/u,
];

/** Collapse whitespace and strip wrapping quotes/list bullets a model likes to add. */
export function normalizeCitationQuestion(raw: string): string {
  return raw
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '')
    .replace(/^["'“”‘’]+/u, '')
    .replace(/["'“”‘’]+$/u, '')
    .trim();
}

/**
 * A question is discovery-shaped when it is a real question of usable length that is
 * not addressed to the business itself.
 */
export function isDiscoveryShapedQuestion(raw: string): boolean {
  const question = normalizeCitationQuestion(raw);
  if (question.length < CITATION_QUESTION_MIN_CHARS) return false;
  if (question.length > CITATION_QUESTION_MAX_CHARS) return false;
  if (!question.includes('?')) return false;
  const lowered = question.toLowerCase();
  return !ADDRESSED_TO_BUSINESS_PATTERNS.some((pattern) => pattern.test(lowered));
}

/** Case- and spacing-insensitive identity used for deduplication. */
export function citationQuestionKey(raw: string): string {
  return normalizeCitationQuestion(raw).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Trim, drop what is not discovery-shaped, dedupe, and cap — preserving input order so
 * the stored set is stable across runs and a regenerated set does not reshuffle.
 */
export function deriveCitationQuestions(
  candidates: readonly string[],
  maxQuestions: number,
): string[] {
  if (!Number.isFinite(maxQuestions) || maxQuestions <= 0) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const question = normalizeCitationQuestion(candidate);
    if (!isDiscoveryShapedQuestion(question)) continue;
    const key = citationQuestionKey(question);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(question);
    if (result.length >= Math.floor(maxQuestions)) break;
  }
  return result;
}

/**
 * Human-readable category noun per stored industry class. This is only ever used to
 * write a question, never to make a claim about the business.
 */
const CATEGORY_NOUNS: Record<string, string> = {
  cafe: 'cafe',
  retail: 'shop',
  fine_dining: 'restaurant',
  beauty: 'salon',
  medical: 'clinic',
  veterinary: 'veterinarian',
  remodeling: 'remodeling contractor',
  legal: 'law firm',
  consulting: 'consultant',
  workshop: 'studio',
  photography: 'photographer',
  brand: 'business',
  portfolio: 'studio',
  clinic: 'clinic',
  interior: 'interior designer',
  other: 'business',
};

export function citationCategoryNoun(industry: string | undefined): string {
  if (!industry) return CATEGORY_NOUNS.other;
  return CATEGORY_NOUNS[industry] ?? CATEGORY_NOUNS.other;
}

export interface CitationQuestionSubject {
  /** The business name. Used to steer generation; never placed in the question itself. */
  name: string;
  /** `siteConfig.meta.region` — the only location a site carries. May be empty. */
  region: string;
  /** `meta.industryClass` or `meta.industryId`. */
  industry: string;
  locale: string;
}

/** "near Lincoln Park" when a region exists, "nearby" when it does not. */
function placePhrase(region: string): string {
  const place = region.trim();
  return place === '' ? 'nearby' : `in ${place}`;
}

/**
 * The deterministic canned set. Used in mock mode and whenever generation fails, so the
 * dashboard and report are exercisable with no keys at all.
 *
 * Every entry is third person and contains both the place and the need, because those
 * are the two things that make an engine name a specific local business.
 */
export function fallbackCitationQuestions(subject: CitationQuestionSubject): string[] {
  const noun = citationCategoryNoun(subject.industry);
  const place = placePhrase(subject.region);
  return [
    `Which ${noun} ${place} is taking new customers right now?`,
    `Who is the best-reviewed ${noun} ${place}?`,
    `Which ${noun} ${place} has availability this week?`,
    `What should someone look for when choosing a ${noun} ${place}?`,
    `Which ${noun} ${place} is easiest to get to without a car?`,
    `Which ${noun} ${place} is open on weekends?`,
    `Which ${noun} ${place} is a good first visit for someone new to the area?`,
    `How much does a first visit to a ${noun} ${place} usually cost?`,
  ];
}

/**
 * Topic seeds from the survey FAQ. The stored FAQ answers are written for the customer's
 * own visitors ("What are your parking options?"), which is exactly the shape that
 * cannot be measured — so a seed only contributes its TOPIC, and the topic is rewritten
 * here into a third-person local query.
 */
const TOPIC_SEED_TEMPLATES: ReadonlyArray<{
  match: RegExp;
  build: (noun: string, place: string) => string;
}> = [
  {
    match: /park/iu,
    build: (noun, place) => `Which ${noun} ${place} has parking on site?`,
  },
  {
    match: /hour|open|close|weekend|evening/iu,
    build: (noun, place) => `Which ${noun} ${place} is open late or on weekends?`,
  },
  {
    match: /insur|payment|pay|price|cost|fee/iu,
    build: (noun, place) => `Which ${noun} ${place} is affordable and explains pricing up front?`,
  },
  {
    match: /reserv|booking|appointment|walk.?in/iu,
    build: (noun, place) => `Which ${noun} ${place} can book an appointment quickly?`,
  },
  {
    match: /access|wheelchair|elevator|barrier/iu,
    build: (noun, place) => `Which ${noun} ${place} is wheelchair accessible?`,
  },
  {
    match: /pet|dog|animal/iu,
    build: (noun, place) => `Which ${noun} ${place} is pet friendly?`,
  },
  {
    match: /wifi|wi-fi|internet|laptop|work/iu,
    build: (noun, place) => `Which ${noun} ${place} is a good place to sit and work?`,
  },
  {
    match: /kid|child|family|baby/iu,
    build: (noun, place) => `Which ${noun} ${place} is good for families with young children?`,
  },
  {
    match: /direction|address|location|subway|transit|bus/iu,
    build: (noun, place) => `Which ${noun} ${place} is closest to public transit?`,
  },
  {
    match: /language|english|korean|spanish/iu,
    build: (noun, place) => `Which ${noun} ${place} has multilingual staff?`,
  },
];

/**
 * Rewrite one survey-FAQ topic into a discovery question, or return null when the topic
 * has no third-person form we are confident about. Never returns the seed text itself.
 */
export function seededCitationQuestion(
  seedText: string,
  subject: CitationQuestionSubject,
): string | null {
  const noun = citationCategoryNoun(subject.industry);
  const place = placePhrase(subject.region);
  const template = TOPIC_SEED_TEMPLATES.find((entry) => entry.match.test(seedText));
  if (!template) return null;
  const question = template.build(noun, place);
  return isDiscoveryShapedQuestion(question) ? question : null;
}

/** The instruction handed to the generator. Kept here so a test can pin its rules. */
export function citationQuestionPrompt(
  subject: CitationQuestionSubject,
  maxQuestions: number,
  seedTopics: readonly string[],
): string {
  const noun = citationCategoryNoun(subject.industry);
  const place = subject.region.trim() === '' ? 'the local area' : subject.region.trim();
  return [
    `Write ${Math.floor(maxQuestions)} questions that a person near ${place} would type into an AI assistant`,
    `when they need a ${noun} and do not yet know which businesses exist.`,
    '',
    'Rules:',
    '- Third person. Never address a business directly. Never write "What are your hours?" or "Do you take walk-ins?".',
    `- Put both the place (${place}) and the need in each sentence.`,
    `- Never mention "${subject.name}" or any specific business name. The question must be answerable by naming any business.`,
    '- Each question ends with a question mark and stays under 160 characters.',
    '- Return one question per line, with no numbering, quotes, or commentary.',
    ...(seedTopics.length > 0
      ? ['', `Topics the business already answers for its own visitors: ${seedTopics.join(', ')}.`,
        'Use them only as subject matter; rewrite each into the third-person form above.']
      : []),
  ].join('\n');
}

/** Split a model response into candidate questions. Tolerates numbering and bullets. */
export function parseGeneratedCitationQuestions(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => normalizeCitationQuestion(line))
    .filter((line) => line !== '');
}

/** How many of the site's own FAQ topics may become seeded questions. */
export const MAX_SEEDED_QUESTIONS = 3;

export interface CitationQuestionCandidate {
  question: string;
  source: CitationQuestionSourceId;
}

/** Mirrors the stored `source` column without importing the storage contract. */
export type CitationQuestionSourceId = 'generated' | 'seeded' | 'manual';

/**
 * Build the ordered candidate list. `generate` is injected, so this stays free of I/O
 * and its ordering, fallback, and failure behaviour are all unit-testable.
 *
 * Seeded questions come first: they encode what this business already knows its
 * customers ask, which makes them the highest-signal probes. The canned set is appended
 * last so a refusal, a timeout, or an unset key still leaves the site measurable rather
 * than permanently unmeasured.
 */
export async function buildCitationQuestionCandidates(input: {
  subject: CitationQuestionSubject;
  seeds: readonly string[];
  maxQuestions: number;
  generate: (prompt: string) => Promise<string>;
}): Promise<CitationQuestionCandidate[]> {
  const seeded: CitationQuestionCandidate[] = [];
  const seenSeeded = new Set<string>();
  for (const seed of input.seeds) {
    if (seeded.length >= MAX_SEEDED_QUESTIONS) break;
    const question = seededCitationQuestion(seed, input.subject);
    if (!question || seenSeeded.has(question)) continue;
    seenSeeded.add(question);
    seeded.push({ question, source: 'seeded' });
  }

  let generated: string[] = [];
  try {
    const text = await input.generate(
      citationQuestionPrompt(input.subject, input.maxQuestions, input.seeds.slice(0, 6)),
    );
    generated = parseGeneratedCitationQuestions(text);
  } catch {
    generated = [];
  }

  const candidates: CitationQuestionCandidate[] = [
    ...seeded,
    ...generated.map((question) => ({ question, source: 'generated' as const })),
    ...fallbackCitationQuestions(input.subject).map((question) => ({
      question,
      source: 'generated' as const,
    })),
  ];

  // deriveCitationQuestions owns trimming, the discovery-shape guard, dedupe, and the cap.
  const kept = deriveCitationQuestions(
    candidates.map((candidate) => candidate.question),
    input.maxQuestions,
  );
  const sourceByQuestion = new Map<string, CitationQuestionSourceId>();
  for (const candidate of candidates) {
    if (!sourceByQuestion.has(candidate.question)) {
      sourceByQuestion.set(candidate.question, candidate.source);
    }
  }
  return kept.map((question) => ({
    question,
    source: sourceByQuestion.get(question) ?? 'generated',
  }));
}
