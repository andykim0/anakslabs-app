import { createHash } from 'node:crypto';
import {
  isValidPageSlug,
  type CanvasElement,
  type ClinicMasterPin,
  type Section,
  type SiteConfig,
  type SitePage,
  type SiteTheme,
} from '@/lib/types/site';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import {
  applyDentalStockToClinicMaster,
  buildClinicCtaSection,
  buildClinicFaqSection,
  buildClinicFeatureSections,
  buildClinicGallerySections,
  buildClinicHeroSection,
  buildClinicStatStripSection,
  CLINIC_RADIUS_TOKENS,
  compilePremiumDentalMaster,
  dentalStockCategoryForSource,
  orderClinicServices,
  verifyClinicUsDestination,
  verifyClinicSourcePhone,
  type ClinicLayoutContentUnit,
  type ClinicLayoutImage,
  type ClinicMasterExperience,
  type ClinicPreviewProviderPhotoProjection,
  type ClinicSourcePhoneProjection,
} from '@/lib/clinic-master';
import type {
  ClinicHeroDecision,
  ProspectPublicSourceBlock,
  ProspectPublicSourceImage,
  UsDemoRenderMode,
} from './contracts';
import {
  clinicHeroLayoutDecision,
  clinicImageDimensions,
  clinicPhotoGate,
  eligibleForClinicHero,
  heroImageIsProviderPortrait,
  clinicPhotoPoolForPattern,
  clinicPhotoPoolForTopic,
  clinicPhotoSlotPool,
  prospectBrandLogo,
  prospectPublicSourceImages,
  sourceImageIsBeforeAfter,
  sourceImageIsAssociationMark,
  sourceImageIsInsuranceCarrierMark,
  sourceImageIsInsuranceLogo,
  sourceImageIsProvider,
  type ClinicImagePageTopic,
  type ProjectedUsDemoSourceImage,
} from './source-images';
import { isUsableProcedurePageTitle } from './source-noise';
import {
  clinicProcedureCategoryDef,
  clinicProcedureCategoryFor,
  clinicProcedureTaxonomy,
  type ClinicProcedureTaxonomy,
} from './procedure-taxonomy';
import { US_DEMO_FALLBACK_CLINIC_SPECIALTY } from './clinic-palette';
import { clinicStockLibraryFor } from './clinic-stock';
import {
  prospectPublicSourceContentUnits,
  prospectPublicSourceOperationalStats,
  type ProspectPublicSourceContentUnit,
} from './source-extraction';

/**
 * A category id from the specialty's taxonomy (`procedure-taxonomy.ts`), no longer a dental union.
 * The set of legal values depends on the specialty, so it cannot be a type — the taxonomy is the
 * authority and `clinicProcedureCategoryDef` throws on an id it does not own.
 */
export type ClinicProcedureCategory = string;

export const MIN_BLOCKS_FOR_INDIVIDUAL_PAGE = 2;

/**
 * A crawl page can carry one long article under a single heading. Block count alone reads that as
 * thin and merges it away, so substantial prose earns a page on its own.
 */
export const MIN_CHARACTERS_FOR_INDIVIDUAL_PAGE = 1_500;

/** Above this a page stops adding source units. Verbatim text is never cut mid-string. */
export const MAX_CHARACTERS_PER_PAGE = 8_000;

/** A merged child is summarised, so only a body this short rides along with its title. */
const MERGED_CHILD_SUMMARY_MAXIMUM = 240;

/**
 * TREATMENT-CARD BODY BAND.
 *
 * Three cards in a row are read as a comparison, so their bodies have to be the same KIND of
 * thing. Measured on the issued round-3 previews, they were not: Ora's ten services cards ran
 * 39 / 566 / 572 / 667 / 679 / 686 / 715 / 725 / 970 / 1416 characters and Brentwood's ran
 * 37 / 37 / 370 / 534 / 884 / 935 / 938 / 987 / 993 / 1111. One card was a nine-line essay, its
 * neighbour a single clause, and a third was not prose at all — Enamel's first card carried
 * "Preventive Dental Care Pediatric Dentistry Oral Cancer Screenings Periodontal Care TMJ/TMD
 * Treatment Sleep Apnea Treatment", which is verbatim source (kind `service_detail`, confirmed in
 * the artifact — not a join defect) and is a menu, not a sentence about a treatment.
 *
 * 320 characters is the band, which is two to three ordinary sentences of clinical copy. It is
 * not a round number chosen for looking tidy: across the three golden fixtures the bodies that
 * already read as a card sit at 107-252, so 320 keeps every one of them untouched and only
 * reaches the ones that were never card copy.
 *
 * A long body is cut at the last SENTENCE boundary inside the band, never mid-sentence and never
 * with an ellipsis: a medical claim that trails off is a different claim. When there is no
 * sentence boundary to cut at — one 900-character sentence, or a keyword run with no punctuation
 * at all — the body is dropped and the card keeps its title and its link. Nothing is invented to
 * fill it, and a card that was already a stub stays a stub.
 *
 * ORDERING, verified rather than assumed: this runs inside `compileUsMedicalDemo`, and
 * `prepareUsMedicalPreview` (us-demo/admin-workflow.ts) calls `compileUsMedicalDemo` and only
 * then `enforceGeneratedMedicalConfig`. So every string here is already at its final length
 * before the medical-ad screen reads it, and no text can be cut after being screened or shipped
 * without having been screened.
 *
 * SCOPE: the treatment cards — the home services grid and the merged-child grid. FAQ answers and
 * prose-article bodies are deliberately outside it; an answer to "how long does surgery take" is
 * supposed to be longer than a card.
 */
const CARD_BODY_TARGET = 320;

/**
 * The cut lands on the sentence boundary NEAREST the target, not the last one before it, and may
 * overshoot to this ceiling. Measured reason: Northbank's longest card is 332 characters and ends
 * two sentences, the second of which starts at 82. Cutting at the last boundary at or under 320
 * threw away 250 characters to save 12, leaving a one-clause card next to five full ones — the
 * imbalance this rule exists to remove, caused by the rule itself. Reaching forward the 12
 * characters keeps whole sentences and keeps the row even.
 */
const CARD_BODY_CEILING = 400;

/** Below this a "sentence boundary" is a decimal point or an abbreviation, not a sentence. */
const CARD_BODY_SENTENCE_MINIMUM = 40;

/* ------------------------------------------------------------------ nav display labels ----- */

/**
 * NAV LABELS ARE NOT PAGE TITLES.
 *
 * A treatment page's `title` is a source heading, written to be found by a search engine, and it
 * keeps that job: it is the <title>, the H1 and the JSON-LD name, and nothing here touches it.
 * The nav is a different surface with a different constraint — a bar of a dozen items, read
 * sideways, where every character past roughly two words is noise. Feeding it the SEO title gave
 * the issued round-3 previews a header reading "Dental Implants in Elk Grove, CA",
 * "Wisdom teeth removal at The Grove", "BASIC CARE FOR PARTIAL DENTURES", and — on Brentwood —
 * "Cosmetic & Restorative" twice in the same dropdown, which is a nav that cannot be used at all.
 *
 * The label is the first candidate that is free, in this order. Each rung exists because the one
 * above it can be absent or already taken, and the last rung always exists, so no page can end up
 * without an entry:
 *
 *   1. the title with its geo qualifier stripped and ALL-CAPS normalised, if it fits the cap
 *   2. the page's own slug, title-cased, if it fits the cap        (the practice's own URL words)
 *   3. that stripped title plus the qualifier that was removed     (restores the distinguisher)
 *   4. the slug again, allowed up to the longer qualified cap
 *   5. the category label from the taxonomy                        (short, always reads correctly)
 *   6. the stripped title cut at a word boundary
 *   7. the untouched title
 *
 * Rung 5 is deliberately BELOW the page's own words rather than above them. It is safe in the
 * sense that it always reads like a treatment, but it describes the CATEGORY, not the page: an
 * earlier ordering that preferred it labelled Ora's "Emergency Dentistry in Sacramento" page
 * "Cosmetic & Restorative" and its "Emergency Dental Treatments We Offer" page "Implants", which
 * is a worse failure than the long titles this exists to fix — a nav that is short and wrong.
 *
 * Collisions are compared case-insensitively, because a reader cannot see the difference between
 * "Scaling and Root Planing" and "Scaling And Root Planing". Untouched labels are claimed in a
 * first pass so a derived label can never be handed a string a page outside this rule is using.
 */
const NAV_LABEL_MAXIMUM = 28;

/** One rung is allowed to be longer, because its entire job is to tell two pages apart. */
const NAV_QUALIFIED_MAXIMUM = 38;

const NAV_RESERVED_LABELS = new Set(['home', 'about', 'contact', 'services']);

const US_STATE_CODE_RE = /^(?:A[LKZR]|C[AOT]|DE|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]|DC)$/u;

const NAV_TRAILING_FUNCTION_WORD_RE =
  /\s+(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with|your|our)$/iu;

const NAV_SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

/**
 * The city and neighbourhood names this practice itself publishes, read off its own address
 * blocks. Nothing is stripped on the strength of a gazetteer we do not have; the evidence that
 * "Elk Grove" is a place is that the practice prints "Elk Grove, CA 95758" as its address.
 *
 * One, two and three word tails are all kept because an address is not reliably comma-separated:
 * "128 South Brook Drive Leander, TX 78641" puts the street and the locality in one run.
 */
function clinicNavLocalities(addresses: readonly string[]): string[] {
  const localities = new Set<string>();
  for (const address of addresses) {
    const match = /([A-Za-z][A-Za-z.'’\- ]{1,30}?),?\s+([A-Z]{2})\s+\d{5}/u.exec(address);
    if (!match || !US_STATE_CODE_RE.test(match[2])) continue;
    const tail = match[1].trim().replace(/^.*,\s*/u, '').trim();
    const words = tail.split(/\s+/u);
    for (let take = 1; take <= Math.min(3, words.length); take += 1) {
      const candidate = words.slice(words.length - take).join(' ');
      if (candidate.length >= 3) localities.add(candidate.toLocaleLowerCase('en-US'));
    }
  }
  return [...localities];
}

/** ALL-CAPS is a source stylesheet decision, not a name. Title Case, small words left small. */
function normaliseAllCaps(value: string): string {
  if (/[a-z]/u.test(value)) return value;
  if ((value.match(/[A-Za-z]/gu) ?? []).length < 2) return value;
  const words = value.toLocaleLowerCase('en-US').split(/\s+/u);
  return words
    .map((word, index) => (
      index > 0 && index < words.length - 1 && NAV_SMALL_WORDS.has(word)
        ? word
        : word.replace(/^[a-z]/u, (character) => character.toLocaleUpperCase('en-US'))
    ))
    .join(' ');
}

interface ClinicNavGeoStrip {
  label: string;
  qualifier?: string;
}

/**
 * Remove a trailing location qualifier, but only when there is evidence the tail IS a location.
 * Four kinds of evidence, any one of which is enough:
 *   (a) it ends in ", <ST>" — a US state code after a comma is not a treatment
 *   (b) it ends in a locality this practice publishes in its own address
 *   (c) the preposition is "at" — "X at <somewhere>" in a treatment title names a place
 *   (d) the same tail recurs as a geo tail on another of this practice's pages
 * Without one of them the title is left exactly as written; guessing costs a treatment name.
 */
function stripClinicNavGeoTail(
  title: string,
  localities: readonly string[],
  repeatedTails: ReadonlySet<string>,
): ClinicNavGeoStrip {
  const match = /^(.*?)(\s+(?:in|at|near)\s+([^.!?]{2,40}?))[\s.,]*$/u.exec(title);
  if (!match) return { label: title.trim() };
  const head = match[1].trim();
  if (head.length < 6) return { label: title.trim() };
  const preposition = /\s+(in|at|near)\s+/u.exec(match[2])?.[1] ?? 'in';
  const tail = match[3].trim().replace(/[\s.,]+$/u, '');
  const normalised = tail.toLocaleLowerCase('en-US');
  const isLocation = /,\s*[A-Z]{2}$/u.test(tail)
    || localities.some((locality) => normalised.endsWith(locality))
    || preposition === 'at'
    || repeatedTails.has(normalised);
  if (!isLocation) return { label: title.trim() };
  return { label: head.replace(/[\s,]+$/u, ''), qualifier: tail };
}

/** Cut at a word boundary, then drop any function word the cut left dangling. No ellipsis. */
function navWordCut(value: string, maximum: number): string {
  if (value.length <= maximum) return value;
  const window = value.slice(0, maximum + 1);
  const space = window.lastIndexOf(' ');
  let cut = space > 0 ? window.slice(0, space) : value.slice(0, maximum);
  while (NAV_TRAILING_FUNCTION_WORD_RE.test(cut)) {
    cut = cut.replace(NAV_TRAILING_FUNCTION_WORD_RE, '');
  }
  return cut.replace(/[\s,;:·-]+$/u, '');
}

function navLabelFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.replace(/^[a-z]/u, (character) => character.toLocaleUpperCase('en-US')))
    .join(' ');
}

export interface ClinicNavLabelInput {
  /** Page id, used only to key the answer back onto the page. */
  id: string;
  slug: string;
  title: string;
  /** The label the page ships today; also what an untouched page claims. */
  navLabel: string;
  /** The taxonomy label for this page's category, or undefined for a non-procedure page. */
  categoryLabel?: string;
  /** False for Home/Contact and for a category with a single page — those are left alone. */
  derives: boolean;
}

/** Page id -> nav label. Only pages with `derives` appear; everything else keeps what it had. */
export function resolveClinicNavLabels(
  pages: readonly ClinicNavLabelInput[],
  addresses: readonly string[],
): Map<string, string> {
  const localities = clinicNavLocalities(addresses);
  const tailCounts = new Map<string, number>();
  for (const page of pages) {
    const match = /\s+(?:in|at|near)\s+([^.!?]{2,40}?)[\s.,]*$/u.exec(page.title);
    if (!match) continue;
    const key = match[1].trim().replace(/[\s.,]+$/u, '').toLocaleLowerCase('en-US');
    tailCounts.set(key, (tailCounts.get(key) ?? 0) + 1);
  }
  const repeatedTails = new Set(
    [...tailCounts].filter(([, count]) => count >= 2).map(([key]) => key),
  );

  const taken = new Set<string>(NAV_RESERVED_LABELS);
  const claim = (value: string) => {
    taken.add(value.toLocaleLowerCase('en-US'));
    return value;
  };
  const free = (value: string | undefined): value is string => (
    Boolean(value) && !taken.has(value!.toLocaleLowerCase('en-US'))
  );
  for (const page of pages) if (!page.derives) claim(page.navLabel);

  const resolved = new Map<string, string>();
  for (const page of pages) {
    if (!page.derives) continue;
    const stripped = stripClinicNavGeoTail(page.title, localities, repeatedTails);
    const derived = normaliseAllCaps(stripped.label).replace(/\s+/gu, ' ').trim();
    const slugLabel = navLabelFromSlug(page.slug);
    const slugUsable = !NAV_RESERVED_LABELS.has(slugLabel.toLocaleLowerCase('en-US'));
    const qualified = stripped.qualifier ? `${derived} · ${stripped.qualifier}` : undefined;
    const candidates: Array<string | undefined> = [
      derived.length > 0 && derived.length <= NAV_LABEL_MAXIMUM ? derived : undefined,
      slugUsable && slugLabel.length <= NAV_LABEL_MAXIMUM ? slugLabel : undefined,
      qualified && qualified.length <= NAV_QUALIFIED_MAXIMUM ? qualified : undefined,
      slugUsable && slugLabel.length <= NAV_QUALIFIED_MAXIMUM ? slugLabel : undefined,
      page.categoryLabel,
      derived.length > NAV_LABEL_MAXIMUM ? navWordCut(derived, NAV_LABEL_MAXIMUM) : undefined,
      page.title,
    ];
    resolved.set(page.id, claim(candidates.find(free) ?? page.title));
  }
  return resolved;
}

/**
 * A run of Title-Case service names is a menu the practice printed, not body copy. It reaches the
 * card because `service_detail` is a kind, not a judgement about shape.
 *
 * The three conditions together, because none of them alone is safe: no sentence-ending
 * punctuation anywhere (a menu has none), at least six words (a two-word fragment is a stub, not
 * a menu), and at least sixty per cent of the words that carry meaning starting with a capital
 * (which is what makes it a list of proper treatment names rather than a sentence). Function
 * words of three letters or fewer are not counted either way — "and", "of", "to" are lower case
 * in a menu and in a sentence alike, so counting them would only dilute the signal.
 *
 * It is NOT rendered as a delimited list, which was the other option. Splitting
 * "Preventive Dental Care Pediatric Dentistry Oral Cancer Screenings" back into its items needs a
 * delimiter, and the source string has none — every split is a guess that either joins two
 * treatments or cuts one in half, and printing a wrong list of what a practice offers on their
 * own medical page is worse than printing none.
 */
function isKeywordBlob(text: string): boolean {
  if (/[.!?]/u.test(text)) return false;
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length < 6) return false;
  const carrying = words.filter((word) => word.replace(/[^A-Za-z]/gu, '').length > 3);
  if (carrying.length < 4) return false;
  const capitalised = carrying.filter((word) => /^[^A-Za-z]*[A-Z]/u.test(word)).length;
  return capitalised / carrying.length >= 0.6;
}

/** The sentence end nearest `CARD_BODY_TARGET` and at or under the ceiling, or -1 if there is none. */
function nearestSentenceEnd(text: string): number {
  const window = text.slice(0, CARD_BODY_CEILING);
  let best = -1;
  for (const match of window.matchAll(/[.!?](?=\s|$)/gu)) {
    const index = (match.index ?? 0) + 1;
    // "Dr." / "St." / "U.S." end a token, not a sentence.
    if (/(?:^|\s)(?:[A-Z][a-z]{0,2}|[A-Z](?:\.[A-Z])*)\.$/u.test(window.slice(0, index))) continue;
    if (index < CARD_BODY_SENTENCE_MINIMUM) continue;
    if (best < 0 || Math.abs(index - CARD_BODY_TARGET) < Math.abs(best - CARD_BODY_TARGET)) {
      best = index;
    }
  }
  return best;
}

/**
 * Below this a card body is a fragment, not a sentence. The extractor's own floor for a paired
 * body is 32 characters, which "in Brentwood, LA in Los Angeles, CA |" — 37 characters of title
 * residue — cleared, and it shipped as the body of three service cards. The card slot is a
 * paragraph, so it can ask for more than the extractor's minimum without touching it.
 */
const CARD_BODY_MINIMUM = 48;

/** A trailing separator is a run that was cut, not a sentence that ended. */
const CARD_BODY_DANGLING_TAIL_RE = /[|·•/\\,;:–—-]$/u;

/**
 * The card body a source block may become: itself when it already reads as one, a shorter run of
 * its own whole sentences when it does not, and nothing at all when it was never prose.
 */
function clinicCardBody<T extends { text: string }>(block: T | undefined): T | undefined {
  if (!block) return undefined;
  const text = block.text.trim();
  if (text.length === 0) return undefined;
  /**
   * Shape, checked before length so the reason is the shape. A body that opens on a lowercase
   * letter is the back half of somebody else's sentence, and a body that closes on a separator is
   * the front half of a run that kept going. Both are what a boundary-less heading match leaves
   * behind, and neither is a sentence the practice wrote. This is a floor under the card slot, not
   * a scrubber: it declines to print a fragment, it never repairs one.
   */
  if (/^\p{Ll}/u.test(text)) return undefined;
  if (CARD_BODY_DANGLING_TAIL_RE.test(text)) return undefined;
  if (text.length < CARD_BODY_MINIMUM) return undefined;
  if (isKeywordBlob(text)) return undefined;
  if (text.length <= CARD_BODY_TARGET) return block;
  const end = nearestSentenceEnd(text);
  if (end < 0) return undefined;
  if (end >= text.length) return block;
  return { ...block, text: text.slice(0, end) };
}

/**
 * Home, About and Contact sit outside this count, so a full crawl lands in the eight-to-fifteen
 * page range. The block threshold alone does not bound it: a thin crawl page still carries a
 * title, a service and a detail, which clears any small threshold, so a twenty-page site would
 * otherwise compile to twenty pages of a paragraph each.
 */
export const MAX_PROCEDURE_PAGES = 10;

/** Matches the home practice gallery so one subpage cannot absorb the whole photo pool. */
const PROCEDURE_GALLERY_MAXIMUM = 12;

/**
 * Body budget for one procedure page, split between the feature units and the trailing gallery.
 * Without it a fallback pool of every eligible practice photo lands on the first subpage.
 */
export const PROCEDURE_BODY_IMAGE_BUDGET = 16;

/** Below this a page looks bare, so repetition is accepted rather than an empty body. */
const PROCEDURE_BODY_IMAGE_MINIMUM = 2;

/**
 * Share the practice's photographs across the subpages instead of giving each the full budget.
 * A clinic with thirty usable photos and eight treatment pages cannot fill sixteen slots on every
 * one of them; taking the budget literally put a single portrait on eight of nine pages.
 */
export function procedureBodyImageBudget(
  eligibleImageCount: number,
  procedurePageCount: number,
): number {
  if (procedurePageCount <= 0) return PROCEDURE_BODY_IMAGE_BUDGET;
  const share = Math.floor(eligibleImageCount / procedurePageCount);
  return Math.min(
    PROCEDURE_BODY_IMAGE_BUDGET,
    Math.max(PROCEDURE_BODY_IMAGE_MINIMUM, share),
  );
}

/**
 * The dental table that used to live here — CATEGORY_META, the three ordered regexes and
 * procedureCategory() — is now the `dental` entry of `procedure-taxonomy.ts`, unchanged. This file
 * reads whichever entry the compiled pin's specialty names.
 */
const DENTAL_PROCEDURE_TAXONOMY = clinicProcedureTaxonomy('dental');

export interface PlannedMergedChild {
  sourceUrl: string;
  blocks: ProspectPublicSourceBlock[];
}

interface PlannedProcedurePage {
  category: ClinicProcedureCategory;
  blocks: ProspectPublicSourceBlock[];
  sourceUrls: Set<string>;
  sourceUrl?: string;
  /** Thin descendants folded in here. They render as cards, never as body copy. */
  mergedChildren: PlannedMergedChild[];
}

function sourceUrlParent(raw: string): string | undefined {
  const url = new URL(raw);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return undefined;
  segments.pop();
  url.pathname = segments.length > 0 ? `/${segments.join('/')}` : '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function nearestSourceParent(
  sourceUrl: string,
  knownUrls: ReadonlySet<string>,
): string | undefined {
  let parent = sourceUrlParent(sourceUrl);
  while (parent) {
    if (knownUrls.has(parent)) return parent;
    const next = sourceUrlParent(parent);
    if (!next || next === parent) return undefined;
    parent = next;
  }
  return undefined;
}

function blockCharacters(blocks: readonly ProspectPublicSourceBlock[]): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}

/**
 * Keep the most substantial pages and fold the rest into whichever kept page already owns them —
 * their nearest kept URL ancestor, else a kept page of the same service category, else Home. A
 * demoted page becomes a card, so its heading and a short summary survive; nothing is discarded
 * silently and nothing is dumped as body copy.
 */
function capProcedurePages(
  pages: readonly PlannedProcedurePage[],
  homeBlocks: ProspectPublicSourceBlock[],
): PlannedProcedurePage[] {
  if (pages.length <= MAX_PROCEDURE_PAGES) return [...pages];
  const ranked = [...pages].sort((left, right) => (
    blockCharacters(right.blocks) - blockCharacters(left.blocks)
    || right.blocks.length - left.blocks.length
    || (left.sourceUrl ?? '').localeCompare(right.sourceUrl ?? '')
  ));
  const kept = ranked.slice(0, MAX_PROCEDURE_PAGES);
  const keptUrls = new Set(
    kept.flatMap((page) => (page.sourceUrl ? [page.sourceUrl] : [])),
  );
  const keptByUrl = new Map(
    kept.flatMap((page) => (page.sourceUrl ? [[page.sourceUrl, page] as const] : [])),
  );
  for (const demoted of ranked.slice(MAX_PROCEDURE_PAGES)) {
    const ancestor = demoted.sourceUrl
      ? nearestSourceParent(demoted.sourceUrl, keptUrls)
      : undefined;
    const host = (ancestor ? keptByUrl.get(ancestor) : undefined)
      ?? kept.find((page) => page.category === demoted.category);
    if (!host) {
      homeBlocks.push(...demoted.blocks);
      continue;
    }
    host.mergedChildren.push(
      {
        sourceUrl: demoted.sourceUrl ?? [...demoted.sourceUrls][0],
        blocks: demoted.blocks,
      },
      ...demoted.mergedChildren,
    );
    demoted.sourceUrls.forEach((url) => host.sourceUrls.add(url));
  }
  return kept;
}

/**
 * A crawl page earns an individual demo page with two source blocks, or with enough prose under
 * however few headings it happens to use. Thin pages merge into their nearest crawled URL parent
 * as summarised children, then a factual service category, and finally Home.
 */
export function planProcedurePages(
  blocks: readonly ProspectPublicSourceBlock[],
  /** Defaults to dental, so the existing callers and their recorded output are unchanged. */
  taxonomy: ClinicProcedureTaxonomy = DENTAL_PROCEDURE_TAXONOMY,
): {
  pages: PlannedProcedurePage[];
  homeBlocks: ProspectPublicSourceBlock[];
} {
  const categoryOrder = taxonomy.categories.map((category) => category.id);
  const procedureCategory = (text: string) => clinicProcedureCategoryFor(taxonomy, text);
  const allByUrl = new Map<string, ProspectPublicSourceBlock[]>();
  for (const block of blocks) {
    const current = allByUrl.get(block.sourceUrl) ?? [];
    current.push(block);
    allByUrl.set(block.sourceUrl, current);
  }
  const servicesByUrl = new Map<string, ProspectPublicSourceBlock[]>();
  for (const block of blocks.filter((candidate) => candidate.kind === 'service')) {
    const current = servicesByUrl.get(block.sourceUrl) ?? [];
    current.push(block);
    servicesByUrl.set(block.sourceUrl, current);
  }
  const knownServiceUrls = new Set(servicesByUrl.keys());
  const aggregates = new Map<string, {
    blocks: ProspectPublicSourceBlock[];
    sourceUrls: Set<string>;
    sourceBlockCount: number;
    mergedChildren: PlannedMergedChild[];
  }>();
  const categoryBuckets = new Map<ClinicProcedureCategory, {
    blocks: ProspectPublicSourceBlock[];
    sourceUrls: Set<string>;
    sourceBlockCount: number;
  }>();

  const appendCategory = (
    category: ClinicProcedureCategory,
    sourceBlocks: readonly ProspectPublicSourceBlock[],
    sourceUrl: string,
    sourceBlockCount: number,
  ) => {
    const bucket = categoryBuckets.get(category) ?? {
      blocks: [],
      sourceUrls: new Set<string>(),
      sourceBlockCount: 0,
    };
    bucket.blocks.push(...sourceBlocks);
    bucket.sourceUrls.add(sourceUrl);
    bucket.sourceBlockCount += sourceBlockCount;
    categoryBuckets.set(category, bucket);
  };

  const pages: PlannedProcedurePage[] = [];
  const homeBlocks: ProspectPublicSourceBlock[] = [];
  for (const [sourceUrl, serviceBlocks] of servicesByUrl) {
    aggregates.set(sourceUrl, {
      blocks: [...(allByUrl.get(sourceUrl) ?? serviceBlocks)],
      sourceUrls: new Set([sourceUrl]),
      sourceBlockCount: allByUrl.get(sourceUrl)?.length ?? serviceBlocks.length,
      mergedChildren: [],
    });
  }
  const urlsByDepth = [...servicesByUrl.keys()].sort((left, right) => (
    new URL(right).pathname.split('/').filter(Boolean).length
    - new URL(left).pathname.split('/').filter(Boolean).length
    || left.localeCompare(right)
  ));
  for (const sourceUrl of urlsByDepth) {
    const bucket = aggregates.get(sourceUrl)!;
    if (
      bucket.sourceBlockCount >= MIN_BLOCKS_FOR_INDIVIDUAL_PAGE
      || blockCharacters(bucket.blocks) >= MIN_CHARACTERS_FOR_INDIVIDUAL_PAGE
    ) {
      pages.push({
        category: procedureCategory(bucket.blocks.map((block) => block.text).join(' ')),
        blocks: bucket.blocks,
        sourceUrls: bucket.sourceUrls,
        sourceUrl,
        mergedChildren: bucket.mergedChildren,
      });
      continue;
    }
    const parent = nearestSourceParent(sourceUrl, knownServiceUrls);
    if (parent) {
      const parentBucket = aggregates.get(parent)!;
      // The child's own text stays out of the parent's body; only a card is carried up.
      parentBucket.mergedChildren.push({ sourceUrl, blocks: bucket.blocks });
      parentBucket.mergedChildren.push(...bucket.mergedChildren);
      bucket.sourceUrls.forEach((url) => parentBucket.sourceUrls.add(url));
      parentBucket.sourceBlockCount += bucket.sourceBlockCount;
      continue;
    }
    appendCategory(
      procedureCategory(bucket.blocks.map((block) => block.text).join(' ')),
      bucket.blocks,
      sourceUrl,
      bucket.sourceBlockCount,
    );
  }
  for (const category of categoryOrder) {
    const bucket = categoryBuckets.get(category);
    if (!bucket) continue;
    if (
      bucket.sourceBlockCount >= MIN_BLOCKS_FOR_INDIVIDUAL_PAGE
      || blockCharacters(bucket.blocks) >= MIN_CHARACTERS_FOR_INDIVIDUAL_PAGE
    ) {
      pages.push({
        category,
        blocks: bucket.blocks,
        sourceUrls: bucket.sourceUrls,
        mergedChildren: [],
      });
    } else {
      homeBlocks.push(...bucket.blocks);
    }
  }
  const kept = capProcedurePages(pages, homeBlocks);
  kept.sort((left, right) => (
    categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category)
    || (left.sourceUrl ?? '').localeCompare(right.sourceUrl ?? '')
    || left.blocks[0].id.localeCompare(right.blocks[0].id)
  ));
  return { pages: kept, homeBlocks };
}

function procedureSlug(
  plan: PlannedProcedurePage,
  used: Set<string>,
  taxonomy: ClinicProcedureTaxonomy,
): string {
  const fallback = clinicProcedureCategoryDef(taxonomy, plan.category).slug;
  const sourceSegment = plan.sourceUrl
    ? new URL(plan.sourceUrl).pathname.split('/').filter(Boolean).at(-1)
    : undefined;
  const normalized = sourceSegment
    ?.toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40);
  let slug = normalized
    && isValidPageSlug(normalized)
    && !['about', 'contact'].includes(normalized)
    ? normalized
    : fallback;
  if (used.has(slug)) {
    const suffix = createHash('sha256')
      .update(plan.sourceUrl ?? plan.blocks.map((block) => block.id).join('|'), 'utf8')
      .digest('hex')
      .slice(0, 8);
    slug = `${slug.slice(0, 31)}-${suffix}`;
  }
  used.add(slug);
  return slug;
}

function section(input: {
  id: string;
  type: Section['type'];
  name: string;
  height: number;
  elements: CanvasElement[];
  theme: SiteTheme;
  surface?: boolean;
}): Section {
  return {
    id: input.id,
    type: input.type,
    name: input.name,
    height: input.height,
    layout: 'canvas',
    background: {
      color: input.surface ? input.theme.palette.surface : input.theme.palette.background,
    },
    elements: input.elements,
  };
}

function layoutImage(image: ProjectedUsDemoSourceImage): ClinicLayoutImage {
  return {
    id: image.source.id,
    src: image.source.url,
    alt: image.source.alt,
    ...(image.candidate.declaredWidth && image.candidate.declaredHeight
      ? {
          sourceWidth: image.candidate.declaredWidth,
          sourceHeight: image.candidate.declaredHeight,
        }
      : {}),
  };
}

function sourceLayoutImage(image: ProspectPublicSourceImage | undefined): ClinicLayoutImage | undefined {
  return image
    ? {
        id: image.id,
        src: image.url,
        alt: image.alt,
      }
    : undefined;
}

function insuranceStripSection(input: {
  id: string;
  images: readonly ProjectedUsDemoSourceImage[];
  theme: SiteTheme;
}): Section | null {
  const images = input.images.slice(0, 12);
  if (images.length === 0) return null;
  return section({
    id: input.id,
    type: 'custom',
    name: 'Accepted Insurance',
    height: 300,
    theme: input.theme,
    surface: true,
    elements: [
      {
        id: `${input.id}-title`,
        kind: 'text',
        text: 'Accepted Insurance',
        frame: { x: 0, y: 0, w: 1, h: 1 },
        z: 2,
        style: {
          fontSize: 40,
          fontWeight: 600,
          fontFamily: 'heading',
          color: input.theme.palette.text,
          lineHeight: 1.2,
        },
        entrance: { effect: 'none' },
      },
      ...images.map((image, index) => ({
        id: `source-image-${image.source.id}-insurance-${index}`,
        kind: 'image' as const,
        src: image.source.url,
        alt: image.source.alt,
        frame: { x: 0, y: 0, w: 1, h: 1 },
        z: 1,
        style: {
          objectFit: 'contain' as const,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
          shadow: false,
        },
        entrance: { effect: 'none' as const },
      })),
    ],
  });
}

const PROCESS_RE =
  /\b(?:step|process|consultation|placement|healing|recovery|procedure|what to expect)\b/iu;
const BENEFIT_RE =
  /\b(?:benefits?|advantages?|why choose|candidates?|improve|restore|comfort|confidence)\b/iu;
const LONG_PROSE_MINIMUM = 420;
type ClinicFeatureCandidates = Parameters<typeof buildClinicFeatureSections>[0]['candidates'];

/** The count is the matched real-photo pool remaining after the page hero is assigned. */
export function clinicProcedureMediaCandidates(
  remainingImageCount: number,
): ClinicFeatureCandidates {
  if (remainingImageCount >= 5) {
    return ['features.zigzag-media', 'features.featured-first', 'features.icon-grid'];
  }
  if (remainingImageCount >= 2) {
    return ['features.featured-first', 'features.three-column-cards', 'features.icon-grid'];
  }
  return ['features.icon-grid', 'features.sticky-heading-two-column', 'features.numbered-list'];
}

const CLINIC_PROSE_RESET_VARIANTS = new Set([
  'features.numbered-list',
  'features.icon-grid',
  'features.faq-accordion',
  'features.stat-strip',
]);

export function clinicSectionIsProse(section: Section): boolean {
  const resolvedId = section.sectionLayout?.resolvedId;
  if (!resolvedId || section.sectionLayout?.kind !== 'features') return false;
  if (CLINIC_PROSE_RESET_VARIANTS.has(resolvedId)) return false;
  return !section.elements.some((element) => (
    element.kind === 'image' || element.kind === 'video'
  ));
}

export function clinicMaximumConsecutiveProseSections(
  sections: readonly Section[],
): number {
  let current = 0;
  let maximum = 0;
  for (const section of sections) {
    current = clinicSectionIsProse(section) ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function isPreFooterCta(section: Section): boolean {
  return section.type === 'cta'
    || section.sectionLayout?.kind === 'cta'
    || section.sectionLayout?.resolvedId.startsWith('cta.') === true;
}

export function clinicSectionHasPlaceholder(section: Section): boolean {
  return /placeholder/iu.test(section.id)
    || section.elements.some((element) => (
      element.kind === 'image'
        ? /placeholder/iu.test(element.src)
        : element.kind === 'text'
          ? /\b(?:preview note|placeholder|can be added|can appear)\b/iu.test(element.text)
          : false
    ));
}

function tintPairFor(
  content: readonly Section[],
  darkIndex: number | undefined,
): readonly [number, number] | null {
  for (let index = 0; index < content.length - 1; index += 1) {
    if (index === darkIndex || index + 1 === darkIndex) continue;
    if (isPreFooterCta(content[index]) || isPreFooterCta(content[index + 1])) continue;
    return [index, index + 1];
  }
  return null;
}

/**
 * premium-dental-v1 opt-in cadence. Every section receives an enum, while Basic/non-clinic
 * configs never call this projector. Short pages stay semantic base; substantial pages gain one
 * isolated mid-page dark punctuation and a contiguous two-section tint block.
 */
export function applyClinicSurfaceCadence(pages: readonly SitePage[]): SitePage[] {
  return pages.map((page) => {
    const sections = page.sections.map((section) => ({
      ...section,
      surfaceTone: section.surfaceTone ?? section.sectionLayout?.surfaceTone ?? 'base' as const,
    }));
    const contentIndices = sections.flatMap((section, index) => (
      section.type === 'hero' ? [] : [index]
    ));
    if (contentIndices.length < 4) return { ...page, sections };

    const existingDarkContentIndex = contentIndices.findIndex((sectionIndex) => (
      sections[sectionIndex].surfaceTone === 'dark'
      && !isPreFooterCta(sections[sectionIndex])
      && !clinicSectionHasPlaceholder(sections[sectionIndex])
    ));
    const midpoint = Math.floor((contentIndices.length - 1) / 2);
    const content = contentIndices.map((index) => sections[index]);
    const regularDarkCandidates = [...contentIndices.keys()]
      .filter((contentIndex) => (
        contentIndex > 0
        && contentIndex < contentIndices.length - 1
        && !isPreFooterCta(sections[contentIndices[contentIndex]])
        && !clinicSectionHasPlaceholder(sections[contentIndices[contentIndex]])
      ));
    const fallbackDarkContentIndex = [...contentIndices.keys()]
      .filter((contentIndex) => (
        !clinicSectionHasPlaceholder(sections[contentIndices[contentIndex]])
        && (
          sections[contentIndices[contentIndex]].type === 'faq'
          || isPreFooterCta(sections[contentIndices[contentIndex]])
        )
      ))
      .sort((left, right) => (
        Math.abs(left - midpoint) - Math.abs(right - midpoint)
        || left - right
      ))[0];
    const darkContentIndex = existingDarkContentIndex >= 0
      ? existingDarkContentIndex
      : regularDarkCandidates
          .sort((left, right) => (
            Number(tintPairFor(content, left) === null)
            - Number(tintPairFor(content, right) === null)
            || Math.abs(left - midpoint) - Math.abs(right - midpoint)
            || left - right
          ))[0] ?? fallbackDarkContentIndex;

    const tintPair = tintPairFor(content, darkContentIndex);
    for (const [contentIndex, sectionIndex] of contentIndices.entries()) {
      const section = sections[sectionIndex];
      const requestedTone = contentIndex === darkContentIndex
        ? 'dark'
        : tintPair?.includes(contentIndex)
          ? 'tint'
          : isPreFooterCta(section)
            ? 'brand'
            : 'base';
      sections[sectionIndex] = { ...section, surfaceTone: requestedTone };
    }
    return { ...page, sections };
  });
}

function unitContext(unit: ProspectPublicSourceContentUnit): string {
  return `${unit.parentTitle?.text ?? ''} ${unit.title.text} ${unit.body?.text ?? ''}`;
}

function clinicLayoutUnit(
  unit: ProspectPublicSourceContentUnit,
  image: ProjectedUsDemoSourceImage | undefined,
  href?: string,
): ClinicLayoutContentUnit {
  return {
    id: unit.id,
    title: unit.title,
    ...(unit.body ? { body: unit.body } : {}),
    ...(image ? { image: layoutImage(image) } : {}),
    ...(href ? { href } : {}),
  };
}

function procedureContentSections(input: {
  id: string;
  name: string;
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
  theme: SiteTheme;
  bookingUrl?: string;
  phone?: string;
}): { sections: Section[]; usedImageIds: Set<string> } {
  const sourceUnits = prospectPublicSourceContentUnits(input.blocks);
  const images = input.images.filter((image) => !sourceImageIsInsuranceLogo(image));
  const buckets = {
    overview: [] as ProspectPublicSourceContentUnit[],
    process: [] as ProspectPublicSourceContentUnit[],
    benefits: [] as ProspectPublicSourceContentUnit[],
    long: [] as ProspectPublicSourceContentUnit[],
  };
  for (const unit of sourceUnits) {
    const context = unitContext(unit);
    if (PROCESS_RE.test(context)) buckets.process.push(unit);
    else if ((unit.body?.text.length ?? 0) >= LONG_PROSE_MINIMUM) buckets.long.push(unit);
    else if (BENEFIT_RE.test(context)) buckets.benefits.push(unit);
    else buckets.overview.push(unit);
  }
  // Hold the page to a readable length by dropping whole units past the budget. Cutting inside a
  // unit would leave a rendered string that no longer matches the source block it cites.
  let remaining = MAX_CHARACTERS_PER_PAGE;
  for (const key of ['overview', 'process', 'benefits', 'long'] as const) {
    buckets[key] = buckets[key].filter((unit) => {
      const cost = unit.title.text.length + (unit.body?.text.length ?? 0);
      if (cost > remaining) return false;
      remaining -= cost;
      return true;
    });
  }
  const usedImageIds = new Set<string>();
  const imageByUnit = new Map<string, ProjectedUsDemoSourceImage>();
  [...buckets.overview, ...buckets.benefits].forEach((unit, index) => {
    const image = images[index];
    if (!image) return;
    imageByUnit.set(unit.id, image);
    usedImageIds.add(image.source.id);
  });
  const mediaCandidates = clinicProcedureMediaCandidates(images.length);
  const sections: Section[] = [];
  let proseRun = 0;
  const pushSection = (section: Section) => {
    sections.push(section);
    proseRun = clinicSectionIsProse(section) ? proseRun + 1 : 0;
  };
  const append = (
    key: keyof typeof buckets,
    name: string,
    candidates: Parameters<typeof buildClinicFeatureSections>[0]['candidates'],
    numbered = false,
  ) => {
    const units = buckets[key].map((unit) => clinicLayoutUnit(
      unit,
      imageByUnit.get(unit.id),
    ));
    const breakDeviceCandidates = proseRun >= 2 && units.length >= 2
      ? ['features.icon-grid' as const, ...candidates.filter(
          (candidate) => candidate !== 'features.icon-grid',
        )]
      : candidates;
    buildClinicFeatureSections({
      id: `${input.id}-${key}`,
      name,
      units,
      theme: input.theme,
      candidates: breakDeviceCandidates,
      titleSourceIdPrefix: 'procedure-service',
      numbered,
      surface: sections.length % 2 === 1,
    }).forEach(pushSection);
  };
  append(
    'overview',
    `${input.name} Overview`,
    mediaCandidates,
  );
  const operationalStats = prospectPublicSourceOperationalStats(input.blocks);
  const statStrip = buildClinicStatStripSection({
    id: `${input.id}-operational-stats`,
    name: 'Practice at a glance',
    theme: input.theme,
    units: operationalStats.map((stat) => ({
      id: stat.id,
      title: stat.title,
      marker: { source: stat.title, text: stat.marker },
    })),
  });
  if (statStrip) pushSection(statStrip);
  append(
    'process',
    'Treatment Process',
    ['features.numbered-list', 'features.sticky-heading-two-column', 'features.icon-grid'],
    true,
  );
  append(
    'benefits',
    'Treatment Benefits',
    mediaCandidates,
  );
  append(
    'long',
    `${input.name} Details`,
    ['features.sticky-heading-two-column', 'features.numbered-list', 'features.icon-grid'],
  );

  const questions = input.blocks.filter((block) => block.kind === 'faq_question');
  const answers = input.blocks.filter((block) => block.kind === 'faq_answer');
  const faq = buildClinicFaqSection({
    id: `${input.id}-faq`,
    name: 'Frequently Asked Questions',
    theme: input.theme,
    items: questions.map((question) => ({
      question,
      answer: answers.find((answer) => (
        answer.sourceUrl === question.sourceUrl
        && answer.sourceLocation.ordinal === question.sourceLocation.ordinal
      )),
    })),
  });
  if (faq) pushSection(faq);
  if (input.bookingUrl) {
    const ctaTitle = input.blocks.find((block) => block.kind === 'cta')
      ?? sourceUnits[0]?.title
      ?? input.blocks.find((block) => block.kind === 'service');
    if (ctaTitle) {
      pushSection(buildClinicCtaSection({
        id: `${input.id}-cta`,
        name: 'Book Appointment',
        theme: input.theme,
        title: ctaTitle,
        href: input.bookingUrl,
        ...(input.phone ? { phoneHref: `tel:${input.phone}` } : {}),
      }));
    }
  }
  return { sections, usedImageIds };
}

/**
 * One card per thin descendant folded into this page: its heading, a body only when the source
 * already offers a short one, and a link when that descendant also earned a page of its own.
 * Nothing is truncated, so every rendered string still matches the block it cites.
 */
function mergedChildSections(input: {
  id: string;
  children: readonly PlannedMergedChild[];
  theme: SiteTheme;
  hrefBySourceUrl: ReadonlyMap<string, string>;
  focus: ClinicMasterPin['focus'];
}): Section[] {
  const units = input.children.flatMap((child) => {
    const services = orderClinicServices(
      child.blocks.filter((block) => block.kind === 'service'),
      input.focus,
    );
    const title = services.find((block) => block.text.length <= 72) ?? services[0];
    if (!title) return [];
    const body = clinicCardBody(child.blocks
      .filter((block) => (
        block.kind === 'service_detail'
        && block.text.length <= MERGED_CHILD_SUMMARY_MAXIMUM
      ))
      .sort((left, right) => right.text.length - left.text.length)[0]);
    const href = input.hrefBySourceUrl.get(child.sourceUrl);
    return [{
      id: `clinic-merged-child-${title.id}`,
      title,
      ...(body ? { body } : {}),
      ...(href ? { href } : {}),
    }];
  });
  if (units.length === 0) return [];
  return buildClinicFeatureSections({
    id: input.id,
    name: 'Also offered here',
    units,
    theme: input.theme,
    candidates: ['features.three-column-cards', 'features.icon-grid'],
    titleSourceIdPrefix: 'procedure-service',
  });
}

function firstHomeImage(
  artifact: CrawlArtifactPayload,
  images: readonly ProjectedUsDemoSourceImage[],
): ProjectedUsDemoSourceImage | undefined {
  const home = artifact.pages.find((page) => new URL(page.url).pathname === '/')
    ?? artifact.pages[0];
  const homeImages = images.filter((image) => (
    image.page.url === home?.url
    && !sourceImageIsProvider(image)
    && !sourceImageIsBeforeAfter(image)
    && !sourceImageIsInsuranceLogo(image)
  ));
  return homeImages.find((image) => image.candidate.role === 'atmosphere')
    ?? homeImages[0]
    ?? images.find((image) => (
      image.candidate.role === 'atmosphere'
      && !sourceImageIsProvider(image)
      && !sourceImageIsBeforeAfter(image)
      && !sourceImageIsInsuranceLogo(image)
    ));
}

function procedureImageTopic(
  plan: PlannedProcedurePage,
  slug: string,
  taxonomy: ClinicProcedureTaxonomy,
): ClinicImagePageTopic | RegExp {
  /**
   * Non-dental categories carry their own alt-text pattern, because the checks below are dental
   * vocabulary. Dental categories declare no pattern, so dental falls through to exactly the
   * sequence it always used.
   */
  const declared = clinicProcedureCategoryDef(taxonomy, plan.category).photoMatch;
  if (declared) return declared;
  const routeContext = [
    slug,
    plan.sourceUrl ?? '',
  ].join(' ').replace(/[-_/]+/gu, ' ');
  if (/\b(?:emergency|toothache|urgent)\b/iu.test(routeContext)) return 'emergency';
  if (/\b(?:endodontics?|root canal)\b/iu.test(routeContext)) return 'endodontic';
  if (/\b(?:oral surgery|bone graft|extraction)\b/iu.test(routeContext)) return 'oral-surgery';
  if (/\b(?:porcelain veneer|veneers?)\b/iu.test(routeContext)) return 'porcelain-veneers';
  if (plan.category === 'implant') return 'implant';
  if (plan.category === 'orthodontic') return 'orthodontic';
  if (plan.category === 'cosmetic-restorative') return 'cosmetic-restorative';
  return 'contact';
}

function rotateSourceOrder<T>(items: readonly T[], offset: number): T[] {
  if (items.length < 2) return [...items];
  const normalized = offset % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

function sourcePhoneFromBlocks(
  artifact: CrawlArtifactPayload,
  blocks: readonly ProspectPublicSourceBlock[],
): ClinicSourcePhoneProjection | undefined {
  const pageOrder = new Map(
    artifact.pages.map((page, index) => [page.url, index]),
  );
  const orderedPhones = blocks
    .filter((block) => block.kind === 'phone' && pageOrder.has(block.sourceUrl))
    .map((block) => ({ block, pageIndex: pageOrder.get(block.sourceUrl)! }))
    .sort((left, right) => (
      left.pageIndex - right.pageIndex
      || left.block.sourceLocation.ordinal - right.block.sourceLocation.ordinal
      || left.block.sourceLocation.field.localeCompare(right.block.sourceLocation.field)
      || left.block.id.localeCompare(right.block.id)
    ));
  for (const { block } of orderedPhones) {
    const verified = verifyClinicSourcePhone({
      sourceBlockId: block.id,
      sourceText: block.text,
      sourceSha256: block.originalSha256,
    });
    if (verified) return verified;
  }
  return undefined;
}

/**
 * The photo the "Meet the Doctor" slot shows, one per `provider_bio` block.
 *
 * The candidate ladder is ordered by strength of evidence that the file depicts THIS person,
 * because the previous ordering had only one rung — crawl-page membership — and Brentwood is what
 * that costs. Its bio is `structured.description` on `/about/`, whose single eligible image is
 * `13575800_1327592913934828_482243595075617930_o.webp`: a Facebook asset id with empty alt, which
 * `sourceImageIsProvider` marks a provider photo because the PAGE title says "Dentist". The two
 * actual portraits, `Dr.-Neda-Naim.jpg` on `/` and `Dr.-Neda-Naim-1.jpg` on `/meet-our-doctor/`,
 * were never candidates: not a token miss (both match every provider predicate), not the dimension
 * gate (both clear it), not a reservation (nothing held them) — they simply sat on other pages,
 * and at the time `/meet-our-doctor/` was not a provider path at all, so no bio was extracted
 * there for a photo to attach to. `pathIntroducesProviders` has since widened to reach it and the
 * page now contributes its own biography, which makes the ladder below load-bearing rather than
 * the only thing standing between this practice and a Facebook asset id.
 *
 * Rung 2 is `heroImageIsProviderPortrait`, the D1 filename person-predicate: `dr`, `dds`, `dmd`,
 * `doctor`, `headshot`, `portrait` in the filename, measured at 16 of 113 with zero false
 * positives, and deliberately excluding the profession words that describe ordinary clinical
 * photography. It outranks both page-scoped rungs because a filename naming a person's title is
 * stronger evidence than a page whose title happens to say "Dentist" — which is precisely the
 * distinction the D1 comment already drew for heroes.
 */
function providerPhotoProjections(input: {
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
}): ClinicPreviewProviderPhotoProjection[] {
  const eligible = (image: ProjectedUsDemoSourceImage): boolean => (
    !sourceImageIsBeforeAfter(image)
    && !sourceImageIsAssociationMark(image)
    && clinicPhotoGate(image).eligibleForPhotoSlot
  );
  const sitePortraits = input.images.filter(
    (image) => eligible(image) && heroImageIsProviderPortrait(image),
  );
  const providers = input.blocks.filter((block) => block.kind === 'provider_bio');
  /**
   * Claimed rather than indexed. The old `[occurrence]` worked only because page-scoped pools are
   * disjoint — `prospectPublicSourceImages` projects each URL once, under the first page it
   * appeared on — and the site-wide rung breaks that, so two bios could otherwise be given the
   * same face. Taking the first UNCLAIMED candidate is the same answer wherever the pools are
   * still disjoint and the only correct one where they are not.
   */
  const claimed = new Set<string>();
  return providers.flatMap((bio) => {
    const exactPageImages = input.images.filter(
      (image) => image.page.url === bio.sourceUrl && eligible(image),
    );
    const free = (image: ProjectedUsDemoSourceImage): boolean => !claimed.has(image.source.id);
    const photo = [
      exactPageImages.filter(heroImageIsProviderPortrait),
      sitePortraits,
      exactPageImages.filter(sourceImageIsProvider),
      exactPageImages,
    ].flatMap((rung) => rung.filter(free).slice(0, 1))[0];
    if (!photo) return [];
    claimed.add(photo.source.id);
    return [{
      version: 1 as const,
      providerBioBlockId: bio.id,
      src: photo.source.url,
      alt: photo.source.alt,
      origin: 'prospect_public_source' as const,
      sourceImageId: photo.source.id,
    }];
  });
}

function previewExperience(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  images: readonly ProjectedUsDemoSourceImage[];
}): Extract<ClinicMasterExperience, { mode: 'preview-full' }> {
  const sourcePhone = sourcePhoneFromBlocks(input.artifact, input.blocks);
  const bookingUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'us_booking')?.url;
  const googleMapsUrl = input.artifact.pages
    .flatMap((page) => page.connectors)
    .find((connector) => connector.kind === 'google_maps')?.url;
  const destination = verifyClinicUsDestination({
    ...(bookingUrl ? { bookingUrl } : {}),
    ...(sourcePhone ? { phone: sourcePhone.sourceText } : {}),
    ...(googleMapsUrl ? { googleMapsUrl } : {}),
  }) ?? undefined;
  const providerPhotos = providerPhotoProjections(input);
  const beforeAfterImages = input.images
    .filter((image) => sourceImageIsBeforeAfter(image) && !sourceImageIsAssociationMark(image))
    .slice(0, 8)
    .map((image) => ({
      sourceImageId: image.source.id,
      src: image.source.url,
      alt: image.source.alt,
    }));
  return {
    mode: 'preview-full',
    ...(destination ? { destination } : {}),
    ...(sourcePhone ? { sourcePhone } : {}),
    ...(providerPhotos.length > 0 ? { providerPhotos } : {}),
    ...(beforeAfterImages.length >= 2 ? { beforeAfterImages } : {}),
  };
}

function pageHeroHasImage(page: SitePage): boolean {
  return Boolean(page.sections.find((candidate) => candidate.type === 'hero')?.background.image);
}

function sourceIdsFromSections(sections: readonly Section[]): string[] {
  return sections.flatMap((item) => item.elements).flatMap((element) => {
    const match = /^source-image-(pps-image-[a-f0-9]{16}-\d+)-/u.exec(element.id);
    return match ? [match[1]] : [];
  });
}

function compilationDate(artifact: CrawlArtifactPayload): string {
  const observedAt = new Date(artifact.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new Error('CLINIC_ARTIFACT_OBSERVED_AT_INVALID');
  }
  return observedAt.toISOString().slice(0, 10);
}

export interface FullPreviewCompilation {
  config: SiteConfig;
  experience: Extract<ClinicMasterExperience, { mode: UsDemoRenderMode }>;
  sourceImages: readonly ProspectPublicSourceImage[];
  usedImageIds: readonly string[];
  /** §D4, one per hero slot, resolved after the stock pass so the outcome is the final one. */
  heroDecisions: readonly ClinicHeroDecision[];
}

export function compileUsMedicalFullPreview(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
  baseConfig: SiteConfig;
  hospitalStableId: string;
  renderMode: UsDemoRenderMode;
}): FullPreviewCompilation {
  const { artifact, blocks, baseConfig, hospitalStableId, renderMode } = input;
  const theme = baseConfig.theme;
  const pin = baseConfig.clinicMaster;
  if (!pin) throw new Error('CLINIC_MASTER_PIN_REQUIRED');
  /**
   * Read off the pin the compile has already decided, not classified again from the source. Absent
   * means dental, which is what every pin issued before the field existed meant.
   */
  const specialty = pin.specialty ?? US_DEMO_FALLBACK_CLINIC_SPECIALTY;
  const taxonomy = clinicProcedureTaxonomy(specialty);
  const stockLibrary = clinicStockLibraryFor(specialty);
  const projectedImages = prospectPublicSourceImages(artifact);
  const photoSlotPool = clinicPhotoSlotPool(projectedImages);
  const heroUseCounts = new Map<string, number>();
  let previousHeroImageId: string | undefined;
  const heroDecisions: {
    pageSlug: string;
    imageUrl?: string;
    dimensionSource?: ClinicHeroDecision['dimensionSource'];
    tieBreak: ClinicHeroDecision['tieBreak'];
    candidateCount: number;
  }[] = [];
  let lastHeroTieBreak: ClinicHeroDecision['tieBreak'] = 'no-candidate';
  let lastHeroCandidateCount = 0;
  /** Called right after each hero allocation, while the tie-break that produced it is still known. */
  const recordHeroDecision = (
    pageSlug: string,
    image: ProjectedUsDemoSourceImage | undefined,
  ) => {
    heroDecisions.push({
      pageSlug,
      ...(image ? { imageUrl: image.source.url } : {}),
      ...(image ? { dimensionSource: clinicImageDimensions(image).source } : {}),
      tieBreak: lastHeroTieBreak,
      candidateCount: lastHeroCandidateCount,
    });
  };
  /**
   * Measured pixels only, and deliberately not the filename suffix. The two questions take
   * different evidence: for eligibility a publisher's own `-150x150` label is enough to know the
   * asset is a thumbnail, but for ranking two large images against each other it mixes a label
   * with a measurement. Admitting labels here reshuffled 18 of 33 heroes on the samples — mostly
   * for the better on treatment pages, but it also replaced a practice's own lobby photograph
   * with a stock one, which is not a trade this ticket authorised.
   */
  const knownArea = (image: ProjectedUsDemoSourceImage): number => {
    const dimensions = clinicImageDimensions(image);
    return dimensions.source === 'metadata' && dimensions.width && dimensions.height
      ? dimensions.width * dimensions.height
      : 0;
  };
  const allocateHeroImage = (
    candidates: readonly ProjectedUsDemoSourceImage[],
  ): ProjectedUsDemoSourceImage | undefined => {
    const available = candidates.filter((candidate) => (
      candidate.source.id !== previousHeroImageId
      && (heroUseCounts.get(candidate.source.id) ?? 0) < 2
    ));
    /**
     * §D4. Atmosphere first, because a room reads as a place and a cropped object does not; then
     * the largest image we have actual pixels for; then the pool's own order, which is stable.
     */
    const isAtmosphere = (image: ProjectedUsDemoSourceImage) => (
      image.candidate.role === 'atmosphere' ? 0 : 1
    );
    available.sort((left, right) => (
      isAtmosphere(left) - isAtmosphere(right)
      || knownArea(right) - knownArea(left)
      || photoSlotPool.indexOf(left) - photoSlotPool.indexOf(right)
    ));
    const selected = available[0];
    const runnerUp = available[1];
    /**
     * Which comparison actually settled it. The same rule resolves at different stages on
     * different sites — atmosphere counts across the three samples are 5, 16 and 2 — so without
     * this the log would say "ranked" and tell us nothing about why.
     */
    const stage: ClinicHeroDecision['tieBreak'] = !selected
      ? 'no-candidate'
      : !runnerUp
        ? 'only-candidate'
        : isAtmosphere(selected) !== isAtmosphere(runnerUp)
          ? 'atmosphere'
          : knownArea(selected) !== knownArea(runnerUp)
            ? 'known-area'
            : 'pool-order';
    lastHeroTieBreak = stage;
    lastHeroCandidateCount = available.length;
    if (!selected) {
      previousHeroImageId = undefined;
      return undefined;
    }
    heroUseCounts.set(selected.source.id, (heroUseCounts.get(selected.source.id) ?? 0) + 1);
    previousHeroImageId = selected.source.id;
    return selected;
  };
  const experience: Extract<ClinicMasterExperience, { mode: UsDemoRenderMode }> =
    renderMode === 'preview-full'
      ? previewExperience({
          artifact,
          blocks,
          images: projectedImages,
        })
      : outreachSafeExperienceFromArtifact({ artifact, blocks });
  const businessName = blocks.find((block) => block.kind === 'business_name')!;
  const articleAuthor = blocks.find((block) => block.kind === 'provider_name');
  const articleDateModified = compilationDate(artifact);
  const introduction = blocks.find((block) => block.kind === 'introduction');
  const heroPool = photoSlotPool.filter(
    (image) => eligibleForClinicHero(image) && !sourceImageIsAssociationMark(image),
  );
  const homeCandidate = firstHomeImage(artifact, heroPool);
  const homeImage = allocateHeroImage(homeCandidate
    ? [
        homeCandidate,
        ...heroPool.filter((image) => image !== homeCandidate),
      ]
    : heroPool);
  recordHeroDecision('', homeImage);
  const services = blocks.filter((block) => block.kind === 'service');
  const procedurePlan = planProcedurePages(blocks, taxonomy);
  const procedureCategoryCounts = new Map(taxonomy.categories.map((category) => [
    category.id,
    procedurePlan.pages.filter((page) => page.category === category.id).length,
  ]));
  const usedProcedureSlugs = new Set<string>(['', 'about', 'contact']);
  const plannedPages = procedurePlan.pages.map((planned) => ({
    planned,
    slug: procedureSlug(planned, usedProcedureSlugs, taxonomy),
  }));
  const bodyImageBudget = procedureBodyImageBudget(
    photoSlotPool.length,
    procedurePlan.pages.length,
  );
  const procedureHrefBySourceUrl = new Map(
    plannedPages.flatMap(({ planned, slug }) => (
      planned.sourceUrl ? [[planned.sourceUrl, `/${slug}`] as const] : []
    )),
  );
  /**
   * §3 T6 is a media treatment: the practice's rooms carry the page. It reads the decision the
   * pin already stored rather than re-deciding, so the template that renders is the one recorded.
   */
  const photoImmersive = pin.templateDecision?.templateId === 'T6';
  const masterSections = compilePremiumDentalMaster({
    blocks,
    theme,
    pin,
    experience,
  }).map((candidate) => (
    candidate.type === 'hero' && homeImage
      ? buildClinicHeroSection({
          id: candidate.id,
          name: candidate.name,
          title: businessName,
          ...(introduction ? { lead: introduction } : {}),
          theme,
          image: sourceLayoutImage(homeImage.source),
          requestedId: 'hero.split-left',
          clinicHeroLayout: clinicHeroLayoutDecision(homeImage),
        })
      : candidate
  ));
  const reservedImages = new Set([
    homeImage?.source.id,
    // Both prospect-facing modes now place a provider photo, so both must hold it: an unreserved
    // portrait is shown twice, once as the doctor and once as a gallery tile.
    ...(experience.mode === 'preview-full' || experience.mode === 'outreach-safe'
      ? experience.providerPhotos?.map((photo) => photo.sourceImageId) ?? []
      : []),
    ...(experience.mode === 'preview-full'
      ? experience.beforeAfterImages?.map((image) => image.sourceImageId) ?? []
      : []),
  ].filter((id): id is string => Boolean(id)));
  const homeServiceImageIds = new Set<string>();
  const homeServiceCandidateUnits = plannedPages.slice(0, 12).flatMap(({ planned, slug }) => {
    const orderedServices = orderClinicServices(
      planned.blocks.filter((block) => block.kind === 'service'),
      pin.focus,
    );
    const title = orderedServices.find((block) => (
      block.kind === 'service' && block.text.length <= 72
    )) ?? orderedServices[0];
    if (!title) return [];
    const body = clinicCardBody(planned.blocks.find((block) => (
      block.kind === 'service_detail' && block.sourceUrl === title.sourceUrl
    )));
    const topic = procedureImageTopic(planned, slug, taxonomy);
    const pool = topic instanceof RegExp
      ? clinicPhotoPoolForPattern(projectedImages, topic)
      : clinicPhotoPoolForTopic(projectedImages, topic);
    const image = pool.find((candidate) => (
      !homeServiceImageIds.has(candidate.source.id)
      && candidate.source.id !== homeImage?.source.id
      && !sourceImageIsAssociationMark(candidate)
    ));
    if (image) homeServiceImageIds.add(image.source.id);
    return [{
      id: `clinic-home-summary-${slug}`,
      title,
      ...(body ? { body } : {}),
      ...(image ? { image: layoutImage(image) } : {}),
      href: `/${slug}`,
    }];
  });
  /**
   * The identical-slot rule, decided at compile rather than at render.
   *
   * The services grid renders one card per unit and every card is the same object, so a media slot
   * that some cards fill and others do not is not a grid with some pictures in it — it is a grid
   * whose cards disagree about what they are. Ora's first outreach preview showed the failure
   * plainly: 6 of 10 units carried an image, and the four that did not rendered as large empty
   * colour fields between the photographs.
   *
   * The alternative — broadening each card's pool until every slot fills — was rejected. The pool
   * a card draws from is its own procedure topic, so broadening it means putting a photograph on a
   * card it is not about, and a grid of confidently mismatched pictures is worse than a grid of
   * none. So the slot is all-or-nothing across the whole section.
   *
   * Decided here and not in `buildClinicFeatureSections`, because the rule belongs to the variant
   * that renders identical cards. The procedure-detail grids use `zigzag-media` and
   * `featured-first`, which alternate and single out on purpose; imposing uniformity on those
   * would break layouts that are deliberately non-uniform.
   *
   * Measured across the corpus (units with an image / units): larkfield-derm 6/6 keeps its media,
   * cameods 0/10 and enamel 0/6 were already uniform and do not move, and the ragged five become
   * uniform text cards — ora 6/10, iddental 7/10, apa 4/10, northbank-ortho 5/6, dental360 2/7.
   */
  const homeServiceMediaIsUniform = homeServiceCandidateUnits.length > 0
    && homeServiceCandidateUnits.every((unit) => unit.image);
  const homeServiceUnits = homeServiceMediaIsUniform
    ? homeServiceCandidateUnits
    : homeServiceCandidateUnits.map(({ image: _dropped, ...unit }) => unit);
  /**
   * Reservations are released with the slot. `homeServiceImageIds` exists to stop the gallery and
   * the procedure pages from repeating a photograph the services grid already showed; if the grid
   * is not showing it, holding the reservation would delete the practice's photograph from the
   * page set instead of moving it.
   */
  if (!homeServiceMediaIsUniform) homeServiceImageIds.clear();
  const homeServiceSections = buildClinicFeatureSections({
    id: 'us-demo-services',
    name: 'Services',
    units: homeServiceUnits,
    theme,
    candidates: homeServiceMediaIsUniform
      ? ['features.three-column-cards', 'features.icon-grid']
      : ['features.icon-grid', 'features.three-column-cards'],
  });
  const gallerySections = buildClinicGallerySections({
    id: 'clinic-practice-gallery',
    name: 'Practice Gallery',
    images: photoSlotPool
      .filter((image) => (
        !reservedImages.has(image.source.id)
        && !homeServiceImageIds.has(image.source.id)
        && !sourceImageIsInsuranceLogo(image)
        && !sourceImageIsAssociationMark(image)
      ))
      // T6 shows the gallery twice, so it needs enough distinct photographs for two bands
      // rather than the same twelve shown again.
      .slice(0, photoImmersive ? 24 : 12)
      .map(layoutImage),
    theme,
    surface: true,
    candidates: ['gallery.uniform-grid'],
    /**
     * The 24-photograph pool splits into two twelve-tile bands, and both were titled "Practice
     * Gallery" — the same heading twice on one page, which reads as a duplicated section rather
     * than a continuation.
     *
     * They are not two galleries about two subjects; they are one ordered pool that did not fit
     * in one band, and nothing in the source says what the second half is ABOUT. So the second
     * heading says what is true of it — that it is more of the same — instead of inventing a
     * subject ("Our Team", "Facilities") the compiler cannot actually verify.
     */
    groupName: (groupIndex) => (groupIndex === 0 ? 'Practice Gallery' : 'More From Our Practice'),
  });
  const homeGalleryImageIds = new Set(
    gallerySections
      .flatMap((candidate) => candidate.elements)
      .flatMap((element) => (element.kind === 'image' ? [element.src] : []))
      .flatMap((src) => {
        const match = photoSlotPool.find((image) => image.source.url === src);
        return match ? [match.source.id] : [];
      }),
  );
  /**
   * Topic matching reads filenames and alt text, which most practices never write in treatment
   * terms, so a thin match is the normal case rather than a signal that the practice has no usable
   * photography. The hero still prefers a topic match, but the body falls back to the rest of the
   * eligible pool — least-committed first — so a subpage keeps the practice's own photographs
   * instead of dropping to a single stock hero.
   */
  const committedImageIds = new Set([
    ...reservedImages,
    ...homeServiceImageIds,
    ...homeGalleryImageIds,
  ]);
  const topicPhotoPool = (topic: ClinicImagePageTopic | RegExp): {
    hero: ProjectedUsDemoSourceImage[];
    body: ProjectedUsDemoSourceImage[];
  } => {
    const matched = (topic instanceof RegExp
      ? clinicPhotoPoolForPattern(projectedImages, topic)
      : clinicPhotoPoolForTopic(projectedImages, topic))
      .filter((image) => !sourceImageIsAssociationMark(image));
    const matchedIds = new Set(matched.map((image) => image.source.id));
    const rest = photoSlotPool.filter((image) => (
      !matchedIds.has(image.source.id)
      && !sourceImageIsInsuranceLogo(image)
      && !sourceImageIsAssociationMark(image)
    ));
    const broadened = [
      ...matched,
      ...rest.filter((image) => !committedImageIds.has(image.source.id)),
      ...rest.filter((image) => committedImageIds.has(image.source.id)),
    ];
    return {
      hero: matched.length > 0 ? matched : broadened,
      body: broadened,
    };
  };
  const insuranceLogos = projectedImages.filter(sourceImageIsInsuranceCarrierMark);
  const homeInsuranceStrip = insuranceStripSection({
    id: 'clinic-accepted-insurance',
    images: insuranceLogos,
    theme,
  });
  const homeFaqQuestions = blocks
    .filter((block) => block.kind === 'faq_question')
    .slice(0, 4);
  const allFaqQuestions = blocks.filter((block) => block.kind === 'faq_question');
  const allFaqAnswers = blocks.filter((block) => block.kind === 'faq_answer');
  const homeFaq = buildClinicFaqSection({
    id: 'clinic-home-faq',
    name: 'Frequently Asked Questions',
    theme,
    items: homeFaqQuestions.map((question) => {
      const originalIndex = allFaqQuestions.indexOf(question);
      const occurrence = allFaqQuestions.slice(0, originalIndex).filter(
        (candidate) => candidate.sourceUrl === question.sourceUrl,
      ).length;
      return {
        question,
        answer: allFaqAnswers.filter(
          (candidate) => candidate.sourceUrl === question.sourceUrl,
        )[occurrence],
      };
    }),
  });
  const homeCta = buildClinicCtaSection({
    id: 'clinic-home-cta',
    name: 'Book Appointment',
    theme,
    title: introduction ?? businessName,
    href: '#clinic-home-faq',
    candidates: ['cta.fullwidth-band'],
  });
  const homeHero = masterSections.find((candidate) => candidate.type === 'hero');
  const providerTeaser = masterSections.find(
    (candidate) => candidate.id === 'us-demo-providers',
  );
  const beforeAfter = masterSections.filter(
    (candidate) => (
      candidate.id.startsWith('clinic-before-after-preview-full')
      || candidate.id === 'clinic-before-after-placeholder'
    ),
  );
  const ratingAggregate = masterSections.find(
    (candidate) => candidate.id === 'clinic-rating-aggregate',
  );
  const insurancePricing = masterSections.find(
    (candidate) => candidate.id === 'clinic-insurance-pricing',
  );
  const homeLocation = masterSections.find(
    (candidate) => candidate.id === 'us-demo-contact',
  );
  /**
   * §3 T6's plan puts gallery at the measured normalised position 0.57 and repeats it — the one
   * template whose plan does — and that repetition is reproduced on three of the corpus sites.
   * So a photo-immersive practice gets a band before its services and another after; every other
   * section keeps its position, because the template is a media treatment and not a reordering.
   */
  const homeSections = photoImmersive
    ? [
        ...(homeHero ? [homeHero] : []),
        ...(providerTeaser ? [providerTeaser] : []),
        ...gallerySections.slice(0, 1),
        ...homeServiceSections,
        ...gallerySections.slice(1, 2),
        ...(ratingAggregate ? [ratingAggregate] : []),
        ...beforeAfter.slice(0, 1),
        ...(homeInsuranceStrip
          ? [homeInsuranceStrip]
          : insurancePricing
            ? [insurancePricing]
            : []),
        ...(homeLocation ? [homeLocation] : []),
        ...(homeFaq ? [homeFaq] : []),
        homeCta,
      ]
    : [
    ...(homeHero ? [homeHero] : []),
    ...homeServiceSections,
    ...(providerTeaser ? [providerTeaser] : []),
    ...(ratingAggregate ? [ratingAggregate] : []),
    ...gallerySections.slice(0, 1),
    ...beforeAfter.slice(0, 1),
    ...(homeInsuranceStrip
      ? [homeInsuranceStrip]
      : insurancePricing
        ? [insurancePricing]
        : []),
    ...(homeLocation ? [homeLocation] : []),
    ...(homeFaq ? [homeFaq] : []),
    homeCta,
      ];
  /**
   * TenantHeader renders the practice's mark by looking for this element id anywhere in the
   * config, and only the consented compiler was emitting it, so every outreach demo carried the
   * business name as plain text. Placed on the home hero, matching that compiler.
   */
  const brandLogo = prospectBrandLogo(artifact, businessName.text);
  if (brandLogo) {
    const hero = homeSections.find((candidate) => candidate.type === 'hero');
    hero?.elements.push({
      id: `clinic-route-brand-logo-${createHash('sha256').update(brandLogo.src, 'utf8').digest('hex').slice(0, 16)}`,
      kind: 'image',
      src: brandLogo.src,
      alt: brandLogo.alt,
      frame: { x: 0, y: 0, w: 1, h: 1 },
      z: 0,
      style: { objectFit: 'contain', shadow: false },
      entrance: { effect: 'none' },
    });
  }
  const pages: SitePage[] = [{
    id: 'clinic-home-v2',
    title: 'Home',
    slug: '',
    sections: homeSections,
  }];

  for (const [pageIndex, { planned, slug }] of plannedPages.entries()) {
    const { category, blocks: pageSourceBlocks, sourceUrls } = planned;
    const categoryServices = orderClinicServices(
      pageSourceBlocks.filter((block) => block.kind === 'service'),
      pin.focus,
    );
    const meta = clinicProcedureCategoryDef(taxonomy, category);
    /**
     * A page title becomes a nav label, so it has to read like a treatment. The same gate that
     * decides what may be published as a MedicalProcedure decides this: it rejects the list
     * headings ("We Offer Different Services"), the sentences ("Why Periodontal Maintenance Is
     * Essential"), and the symptoms ("Red, swollen, or tender gums") that were reaching the bar.
     * Anything it turns down falls back to the category label, which always reads correctly.
     */
    const displayTitle = categoryServices.find((block) => (
      isUsableProcedurePageTitle(block.text)
    ))?.text ?? meta.navLabel;
    const pageTopic = procedureImageTopic(planned, slug, taxonomy);
    const categoryImages = topicPhotoPool(pageTopic);
    const heroImage = allocateHeroImage(categoryImages.hero.filter(eligibleForClinicHero));
    recordHeroDecision(slug, heroImage);
    const bodyImages = rotateSourceOrder(
      categoryImages.body.filter((image) => image.source.id !== heroImage?.source.id),
      pageIndex,
    ).slice(0, bodyImageBudget);
    const detail = procedureContentSections({
      id: `clinic-procedure-${category}-details`,
      name: displayTitle,
      blocks: pageSourceBlocks,
      images: bodyImages,
      theme,
      bookingUrl: '#clinic-sticky-booking',
    });
    const galleryImages = bodyImages
      .filter((image) => !detail.usedImageIds.has(image.source.id))
      .filter((image) => !sourceImageIsAssociationMark(image))
      .slice(0, PROCEDURE_GALLERY_MAXIMUM);
    const gallery = buildClinicGallerySections({
      id: `clinic-procedure-${category}-gallery`,
      name: `${meta.navLabel} Gallery`,
      images: galleryImages.map(layoutImage),
      theme,
      surface: true,
      candidates: ['gallery.uniform-grid'],
    });
    const mergedCards = mergedChildSections({
      id: `clinic-procedure-${category}-merged`,
      children: planned.mergedChildren,
      theme,
      hrefBySourceUrl: procedureHrefBySourceUrl,
      focus: pin.focus,
    });
    for (const id of detail.usedImageIds) committedImageIds.add(id);
    for (const image of galleryImages) committedImageIds.add(image.source.id);
    if (heroImage) committedImageIds.add(heroImage.source.id);
    pages.push({
      id: `clinic-procedure-${category}-${createHash('sha256')
        .update(planned.sourceUrl ?? [...sourceUrls].join('|'), 'utf8')
        .digest('hex')
        .slice(0, 8)}`,
      title: displayTitle,
      /**
       * Placeholder for the multi-page branch — `resolveClinicNavLabels` rewrites it below, once
       * the whole page set exists, because a label cannot be checked for collision against pages
       * that have not been built yet. A single-page category keeps the category label untouched.
       */
      navLabel: (procedureCategoryCounts.get(category) ?? 0) > 1
        ? displayTitle
        : meta.navLabel,
      slug,
      sections: [
        buildClinicHeroSection({
          id: `clinic-procedure-${category}-hero`,
          title: categoryServices[0],
          ...(categoryServices[1] ? { lead: categoryServices[1] } : {}),
          ...(articleAuthor
            ? {
                articleEvidence: {
                  author: articleAuthor,
                  dateModified: articleDateModified,
                },
              }
            : {}),
          theme,
          image: sourceLayoutImage(heroImage?.source),
          requestedId: 'hero.split-left',
          ...(heroImage ? { clinicHeroLayout: clinicHeroLayoutDecision(heroImage) } : {}),
        }),
        ...detail.sections,
        ...mergedCards,
        ...gallery,
      ],
    });
  }

  const providerSections = masterSections.filter(
    (candidate) => candidate.id.startsWith('us-demo-providers'),
  );
  const providerTitle = blocks.find((block) => block.kind === 'provider_name') ?? businessName;
  if (providerSections.length > 0) {
    const providerImage = allocateHeroImage(projectedImages.filter((image) => (
      experience.mode === 'preview-full'
      && experience.providerPhotos?.some((photo) => photo.sourceImageId === image.source.id)
      && clinicPhotoGate(image).eligibleForPhotoSlot
    )));
    pages.push({
      id: 'clinic-about',
      title: 'About',
      slug: 'about',
      sections: [
        buildClinicHeroSection({
          id: 'clinic-about-hero',
          title: providerTitle,
          ...(blocks.find((block) => block.kind === 'provider_bio')
            ? { lead: blocks.find((block) => block.kind === 'provider_bio') }
            : {}),
          theme,
          image: sourceLayoutImage(providerImage?.source),
          requestedId: 'hero.split-left',
          ...(providerImage ? { clinicHeroLayout: clinicHeroLayoutDecision(providerImage) } : {}),
        }),
        ...providerSections,
      ],
    });
  }

  const contactSections = masterSections.filter((candidate) => (
    candidate.id === 'clinic-insurance-pricing'
    || candidate.id === 'us-demo-contact'
    || candidate.id === 'clinic-faq'
  ));
  if (contactSections.length > 0) {
    const contactTitle = blocks.find((block) => block.kind === 'address') ?? businessName;
    const contactPageUrls = new Set(
      blocks
        .filter((block) => (
          ['insurance', 'price_or_financing', 'phone', 'address', 'opening_hours', 'faq_question', 'faq_answer']
            .includes(block.kind)
        ))
        .map((block) => block.sourceUrl),
    );
    const contactTopicPool = topicPhotoPool('contact');
    const contactOnPage = contactTopicPool.hero.filter(
      (image) => contactPageUrls.size === 0 || contactPageUrls.has(image.page.url),
    );
    const contactImage = allocateHeroImage(
      (contactOnPage.length > 0 ? contactOnPage : contactTopicPool.body)
        .filter(eligibleForClinicHero),
    );
    recordHeroDecision('contact', contactImage);
    const contactInsuranceStrip = insuranceStripSection({
      id: 'clinic-accepted-insurance',
      images: insuranceLogos,
      theme,
    });
    pages.push({
      id: 'clinic-contact',
      title: 'Contact',
      slug: 'contact',
      sections: [
        buildClinicHeroSection({
          id: 'clinic-contact-hero',
          title: contactTitle,
          ...(introduction ? { lead: introduction } : {}),
          theme,
          image: sourceLayoutImage(contactImage?.source),
          requestedId: 'hero.split-left',
          ...(contactImage ? { clinicHeroLayout: clinicHeroLayoutDecision(contactImage) } : {}),
        }),
        ...(contactInsuranceStrip ? [contactInsuranceStrip] : []),
        ...contactSections,
      ],
    });
  }

  /**
   * The nav's display labels, decided once the whole page set exists. `page.title` is untouched —
   * only the label the header prints changes, and only for the multi-page-category branch that
   * was putting SEO titles in the bar.
   */
  const navLabels = resolveClinicNavLabels(
    pages.map((page) => {
      const categoryDef = taxonomy.categories.find((candidate) => (
        page.id.startsWith(`clinic-procedure-${candidate.id}-`)
      ));
      return {
        id: page.id,
        slug: page.slug,
        title: page.title,
        navLabel: page.navLabel ?? page.title,
        ...(categoryDef ? { categoryLabel: categoryDef.navLabel } : {}),
        derives: Boolean(categoryDef)
          && (procedureCategoryCounts.get(categoryDef!.id) ?? 0) > 1,
      };
    }),
    blocks.filter((block) => block.kind === 'address').map((block) => block.text),
  );
  for (const page of pages) {
    const label = navLabels.get(page.id);
    if (label) page.navLabel = label;
  }

  let config: SiteConfig = {
    ...baseConfig,
    pages,
    nav: { enabled: true },
  };
  const stockHeroUseCounts = new Map<string, number>();
  let previousStockHeroAssetId: string | undefined;
  for (const page of pages) {
    if (pageHeroHasImage(page)) {
      previousStockHeroAssetId = undefined;
      continue;
    }
    const procedure = taxonomy.categories.find((category) => (
      page.id.startsWith(`clinic-procedure-${category.id}-`)
    ));
    const category = procedure
      ? procedure.stock
      : page.id === 'clinic-home-v2'
        ? dentalStockCategoryForSource(pin.focus, services.map((block) => block.text).join(' '))
        : 'bright-interior';
    /**
     * No licensed pool for this specialty, or none for this category within it. The page keeps the
     * practice's own photography, or no hero image, rather than borrowing another specialty's.
     */
    if (!stockLibrary || !category) {
      previousStockHeroAssetId = undefined;
      continue;
    }
    config = applyDentalStockToClinicMaster(config, {
      hospitalStableId,
      manifest: stockLibrary,
      category,
      slot: 'hero',
      pageSlug: page.slug,
      selectionSalt: `page:${page.slug || 'home'}`,
      excludedAssetIds: [
        ...(previousStockHeroAssetId ? [previousStockHeroAssetId] : []),
        ...[...stockHeroUseCounts.entries()]
          .filter(([, count]) => count >= 2)
          .map(([assetId]) => assetId),
      ],
    });
    const stockHeroUrl = config.pages
      .find((candidate) => candidate.slug === page.slug)
      ?.sections.find((candidate) => candidate.type === 'hero')
      ?.background.image?.src;
    const stockHeroAssetId = stockHeroUrl
      ? config.assetRefs?.find((ref) => ref.url === stockHeroUrl)?.assetId
      : undefined;
    previousStockHeroAssetId = stockHeroAssetId;
    if (stockHeroAssetId) {
      stockHeroUseCounts.set(
        stockHeroAssetId,
        (stockHeroUseCounts.get(stockHeroAssetId) ?? 0) + 1,
      );
    }
  }
  config = {
    ...config,
    pages: applyClinicSurfaceCadence(config.pages),
  };

  const sourceByUrl = new Map(projectedImages.map((image) => [image.source.url, image.source.id]));
  const usedImageIds = new Set(config.pages.flatMap((page) => [
    ...sourceIdsFromSections(page.sections),
    ...page.sections.flatMap((candidate) => {
      const sourceId = candidate.background.image
        ? sourceByUrl.get(candidate.background.image.src)
        : undefined;
      return sourceId ? [sourceId] : [];
    }),
  ]));
  /**
   * §D3 precedence, read off the finished config rather than predicted: a source survivor if one
   * was allocated, else whatever the stock pass put there, else nothing. Resolving it here is
   * what keeps this log and the audit's heroIsStock telling the same story.
   */
  const resolvedHeroDecisions: ClinicHeroDecision[] = heroDecisions.map((decision) => {
    const heroSrc = config.pages
      .find((page) => page.slug === decision.pageSlug)
      ?.sections.find((section) => section.type === 'hero')
      ?.background.image?.src;
    const outcome: ClinicHeroDecision['outcome'] = !heroSrc
      ? 'none'
      : heroSrc.startsWith('/stock/')
        ? 'stock'
        : 'source';
    return {
      pageSlug: decision.pageSlug,
      outcome,
      ...(heroSrc ? { imageUrl: heroSrc } : {}),
      ...(outcome === 'source' && decision.dimensionSource
        ? { dimensionSource: decision.dimensionSource }
        : {}),
      tieBreak: decision.tieBreak,
      candidateCount: decision.candidateCount,
    };
  });
  return {
    config,
    experience,
    sourceImages: projectedImages.map((image) => image.source),
    usedImageIds: [...usedImageIds],
    heroDecisions: resolvedHeroDecisions,
  };
}

export function previewFullExperienceFromArtifact(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
}): Extract<ClinicMasterExperience, { mode: 'preview-full' }> {
  return previewExperience({
    ...input,
    images: prospectPublicSourceImages(input.artifact),
  }) as Extract<ClinicMasterExperience, { mode: 'preview-full' }>;
}

export function outreachSafeExperienceFromArtifact(input: {
  artifact: CrawlArtifactPayload;
  blocks: readonly ProspectPublicSourceBlock[];
}): Extract<ClinicMasterExperience, { mode: 'outreach-safe' }> {
  const sourcePhone = sourcePhoneFromBlocks(input.artifact, input.blocks);
  const providerPhotos = providerPhotoProjections({
    blocks: input.blocks,
    images: prospectPublicSourceImages(input.artifact),
  });
  return {
    mode: 'outreach-safe',
    ...(sourcePhone ? { sourcePhone } : {}),
    ...(providerPhotos.length > 0 ? { providerPhotos } : {}),
  };
}
