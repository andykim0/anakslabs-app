import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  US_DEMO_FALLBACK_CLINIC_SPECIALTY,
  type ClinicSpecialty,
} from './clinic-palette';
import type { ProspectPublicSourceBlock } from './contracts';

/**
 * Resolve the specialty of a practice ONCE, at compile, so it can be stored on the pin.
 *
 * Nothing downstream may re-derive it. Previews are force-dynamic and re-render against whatever
 * code is deployed, so a renderer that classified a practice itself would be free to reach a
 * different answer than the compile did — the prospect would be shown a dermatology page and the
 * search engine told it was a dentist. The compile decides; the renderer reads.
 */

/**
 * Vocabulary per specialty. Deliberately narrow: a term is here only if a practice of another
 * specialty would not routinely publish it. "surgery" is absent because oral surgery is dental,
 * "laser" because both dermatologists and dentists advertise it, "cosmetic" because it belongs to
 * dentistry and dermatology equally.
 *
 * These read the practice's own words. They are NOT a URL path gate and they are not consulted by
 * one — `TREATMENT_PATH_RE` decides which pages become source blocks and is untouched here.
 */
const SPECIALTY_VOCABULARY: Readonly<Record<ClinicSpecialty, readonly RegExp[]>> = Object.freeze({
  dental: [
    /\bdent(?:al|ist|istry)\b/iu,
    /\bteeth\b|\btooth\b/iu,
    /\bimplants?\b/iu,
    /\borthodont(?:ic|ics|ist)\b|\bbraces\b|\binvisalign\b/iu,
    /\bveneers?\b/iu,
    /\bcrowns?\b|\bbridges?\b|\bdentures?\b/iu,
    /\bperiodont(?:al|ics|ist)\b|\bgingiv/iu,
    /\bendodont|\broot canal\b/iu,
    /\bhygienist\b|\bcleaning\b/iu,
    /\bwisdom (?:teeth|tooth)\b|\bextractions?\b/iu,
  ],
  'derm-plastic-aesthetic': [
    /\bdermatolog(?:y|ist|ical)\b/iu,
    /\bskin\b/iu,
    /\bacne\b/iu,
    /\beczema\b|\bpsoriasis\b|\brosacea\b/iu,
    /\bmohs\b|\bskin cancer\b|\bmelanoma\b/iu,
    /\bbotox\b|\bfillers?\b|\bneurotoxin\b/iu,
    /\bmoles?\b|\blesions?\b/iu,
    /\bplastic surgery\b|\brhinoplasty\b|\bliposuction\b/iu,
    /\bmicroneedling\b|\bchemical peel\b/iu,
    /\bhair loss\b|\balopecia\b/iu,
  ],
  'ortho-surgery-pain': [
    /\borthop(?:a?edic|a?edics|a?edist)\b/iu,
    /\bjoint replacements?\b|\barthroplasty\b/iu,
    /\bknee\b|\bhip\b|\bshoulder\b/iu,
    /\bspine\b|\bspinal\b|\bdisc\b/iu,
    /\bsports medicine\b/iu,
    /\brotator cuff\b|\bacl\b|\bmeniscus\b/iu,
    /\bphysical therapy\b|\bphysiotherapy\b|\brehabilitation\b/iu,
    /\barthritis\b|\bosteoarthritis\b/iu,
    /\bfractures?\b|\btendon\b|\bligament\b/iu,
    /\bpain management\b|\bchronic pain\b/iu,
  ],
  'eye-internal-general': [
    /\bophthalmolog(?:y|ist)\b|\boptometr(?:y|ist|ic)\b/iu,
    /\bcataracts?\b|\bglaucoma\b|\blasik\b/iu,
    /\bretina\b|\bcornea\b|\bvision\b|\beyes?\b/iu,
    /\binternal medicine\b|\binternist\b/iu,
    /\bprimary care\b|\bfamily (?:medicine|practice)\b/iu,
    /\bdiabetes\b|\bhypertension\b|\bcholesterol\b/iu,
    /\bphysicals?\b|\bcheck-?ups?\b|\bimmunizations?\b/iu,
  ],
});

/**
 * A term counts once however often it appears, so a practice that says "skin" forty times on one
 * page does not outvote one that describes eight distinct orthopedic procedures. What is being
 * measured is breadth of vocabulary, which is what actually distinguishes a specialty.
 */
function distinctTermHits(text: string, patterns: readonly RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

/**
 * The winner must clear this many distinct terms, and beat the runner-up by this margin. Both
 * exist because misclassifying is worse than defaulting: a dermatology practice compiled as
 * dermatology is right, compiled as dental is the known defect, but a *dental* practice compiled
 * as dermatology because it mentions gum tissue and skin would be a new and worse one.
 */
export const SPECIALTY_MINIMUM_DISTINCT_TERMS = 3;
export const SPECIALTY_MINIMUM_MARGIN = 2;

export interface ClinicSpecialtyResolution {
  specialty: ClinicSpecialty;
  /** How the value was reached, so an operator can see whether to overrule it. */
  basis: 'operator-override' | 'source-vocabulary' | 'fallback';
  /** Distinct term counts per specialty, for the audit and for arguing with the verdict. */
  scores: Readonly<Record<ClinicSpecialty, number>>;
  reason: string;
}

export function resolveClinicSpecialty(input: {
  artifact: Pick<CrawlArtifactPayload, 'pages'>;
  blocks: readonly ProspectPublicSourceBlock[];
  /** An operator who has looked at the site always wins over the vocabulary count. */
  override?: ClinicSpecialty;
}): ClinicSpecialtyResolution {
  /**
   * Read the practice's own headings and titles plus the extracted blocks, not whole page text:
   * body prose carries the boilerplate every medical site shares, and a footer that says "skin"
   * once should not weigh the same as a page called Dermatology.
   */
  const corpus = [
    ...input.artifact.pages.flatMap((page) => [page.title ?? '', ...page.headings]),
    ...input.blocks.map((block) => block.text),
  ].join(' \n ').toLocaleLowerCase('en-US');

  const scores = Object.fromEntries(
    (Object.keys(SPECIALTY_VOCABULARY) as ClinicSpecialty[]).map((specialty) => [
      specialty,
      distinctTermHits(corpus, SPECIALTY_VOCABULARY[specialty]),
    ]),
  ) as Record<ClinicSpecialty, number>;

  if (input.override) {
    return {
      specialty: input.override,
      basis: 'operator-override',
      scores,
      reason: `set by an operator to ${input.override}`,
    };
  }

  const ranked = (Object.keys(scores) as ClinicSpecialty[])
    .sort((left, right) => scores[right] - scores[left] || left.localeCompare(right));
  const [winner, runnerUp] = ranked;
  const top = scores[winner];
  const second = runnerUp ? scores[runnerUp] : 0;

  if (top < SPECIALTY_MINIMUM_DISTINCT_TERMS) {
    return {
      specialty: US_DEMO_FALLBACK_CLINIC_SPECIALTY,
      basis: 'fallback',
      scores,
      reason: `no specialty cleared ${SPECIALTY_MINIMUM_DISTINCT_TERMS} distinct terms (best: ${winner} at ${top})`,
    };
  }
  if (top - second < SPECIALTY_MINIMUM_MARGIN) {
    return {
      specialty: US_DEMO_FALLBACK_CLINIC_SPECIALTY,
      basis: 'fallback',
      scores,
      reason: `${winner} (${top}) did not beat ${runnerUp} (${second}) by ${SPECIALTY_MINIMUM_MARGIN}`,
    };
  }
  return {
    specialty: winner,
    basis: 'source-vocabulary',
    scores,
    reason: `${winner} on ${top} distinct terms against ${second} for ${runnerUp}`,
  };
}
