/**
 * Site chrome that a whole-page text capture cannot tell apart from copy.
 *
 * The crawl artifact keeps no HTML, so there is no nav or footer landmark to consult: a widget's
 * control labels and a language switcher arrive as ordinary sentences in the same string as the
 * practice's own writing. These predicates name the shapes that chrome takes, and each one needs
 * more than a single hit before it fires, because clinics do write "contrast" and "cleaning".
 */

const ACCESSIBILITY_WIDGET_PHRASES = [
  /\bvision impaired mode\b/iu,
  /\bseizure safe\b/iu,
  /\badhd friendly\b/iu,
  /\bblindness mode\b/iu,
  /\bepilepsy safe\b/iu,
  /\bscreen reader\b/iu,
  /\breading (?:mask|line|guide)\b/iu,
  /\bhighlight (?:links|content)\b/iu,
  /\bstop animations\b/iu,
  /\bhide images\b/iu,
  /\bhide toolbar\b/iu,
  /\baccessibility (?:profile|adjustments|menu|statement|widget)\b/iu,
  /\b(?:content|color|orientation) modules\b/iu,
  /\bletter spacing\b/iu,
  /\bline height\b/iu,
  /\bmonochrome\b/iu,
  /\bhigh contrast\b/iu,
  /\breadable font\b/iu,
  /\bskip to content\b/iu,
  /\breset settings\b/iu,
];

/**
 * Endonyms as a switcher prints them, plus the English names. A page that names four of these in
 * one block is listing locales, not describing care.
 */
const LANGUAGE_NAMES = [
  'English', 'Deutsch', 'German', 'Español', 'Spanish', 'Français', 'French',
  'Italiano', 'Italian', 'Polski', 'Polish', 'Svenska', 'Swedish', 'Suomi', 'Finnish',
  'Português', 'Portuguese', 'Română', 'Romanian', 'Slovenščina', 'Slovenčina',
  'Nederlands', 'Dutch', 'Dansk', 'Danish', 'Ελληνικά', 'Greek', 'Čeština', 'Czech',
  'Magyar', 'Hungarian', 'Lietuvių', 'Latviešu', 'Eesti', 'Hrvatski', 'Croatian',
  'Gaeilge', 'Български', 'Norsk', 'Norwegian', 'Türkçe', 'Turkish',
  'Bahasa Indonesia', 'Indonesian', '日本語', 'Japanese', '한국어', 'Korean',
  '简体中文', 'Chinese', 'العربية', 'Arabic', 'Русский', 'Russian',
  'हिन्दी', 'Hindi', 'Українська', 'Ukrainian', 'Srpski', 'Serbian', 'Việt Nam', 'Vietnamese',
];

const LEGAL_FOOTER_PHRASES = [
  /\bprivacy policy\b/iu,
  /\bterms of (?:use|service)\b/iu,
  /\ball rights reserved\b/iu,
  /\bcopyright\b|©/iu,
  /\bpowered by\b/iu,
  /\bcookie (?:policy|preferences|settings)\b/iu,
  /\bsitemap\b/iu,
  /\baccessibility statement\b/iu,
];

function countMatches(value: string, patterns: readonly RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(value)).length;
}

export function sourceTextIsAccessibilityWidget(value: string): boolean {
  return countMatches(value, ACCESSIBILITY_WIDGET_PHRASES) >= 2;
}

export function sourceTextIsLanguageList(value: string): boolean {
  const seen = new Set<string>();
  for (const name of LANGUAGE_NAMES) {
    if (value.includes(name)) seen.add(name.toLocaleLowerCase('en-US'));
  }
  return seen.size >= 4;
}

export function sourceTextIsLegalFooter(value: string): boolean {
  return countMatches(value, LEGAL_FOOTER_PHRASES) >= 2;
}

/** Any of the three shapes above. Applied to copy, never to phone, address, or hours. */
export function sourceTextIsSiteChrome(value: string): boolean {
  return sourceTextIsAccessibilityWidget(value)
    || sourceTextIsLanguageList(value)
    || sourceTextIsLegalFooter(value);
}

/**
 * The label at the top of a footer column, or of a nav group. It heads a list of links, never a
 * paragraph, so the text underneath it is the link list itself.
 *
 * The crawl keeps no HTML, so a footer column heading and a section heading arrive identically —
 * as an entry in `page.headings` with a run of page text under it. That is how Brentwood's
 * "Insurance & Financing" card ended with "Meet Us / Meet Our Doctor Meet Our Team Office Tour
 * Testimonials / Hours / Monday: 8am – 5pm Tuesday: 8am – 5pm": four blocks, not one contaminated
 * paragraph, each one a footer column of `/insurance/` that the insurance branch classified as
 * insurance copy because of the path it sat on.
 *
 * This is the same idea as `GENERIC_HEADING_RE` in `source-extraction.ts`, which already discards
 * "Home", "About", "Services", "Contact" and "Menu" for exactly this reason, and it is deliberately
 * confined to the labels that only ever head a link list. `Location`, `Address` and `Resources`
 * were measured and left out: a practice can and does write a real section under those.
 *
 * Measured across all eight corpora — 2,835 heading/body pairs — this removes 225, and every one
 * of them is footer chrome: opening-hours tables, "Quick Links" columns, "Find Us" address-and-
 * copyright dumps. Nothing that reads as the practice's own writing is in the set.
 *
 * Hours are the notable case, and removing them loses nothing: `opening_hours` is extracted from
 * structured data as its own kind and rendered by the directions section, so the footer copy of it
 * is a duplicate that had wandered into a prose slot.
 */
const CHROME_SECTION_LABEL_RE =
  /^(?:meet\s+us|follow\s+us|connect(?:\s+with\s+us)?|quick\s+links|useful\s+links|helpful\s+links|navigation|main\s+menu|site\s*map|find\s+us|social(?:\s+media)?|newsletter|patient\s+portal|(?:office\s+|opening\s+|business\s+|our\s+)?hours?)$/iu;

export function sourceHeadingIsChromeSectionLabel(value: string): boolean {
  return CHROME_SECTION_LABEL_RE.test(value.trim());
}

/**
 * A published opening-hours row: a weekday, a separator, and a clock time or "Closed".
 *
 * All three parts are required, and that is the whole precision argument. "We reopen on Monday."
 * and "Appointments run Monday through Friday" name a weekday and are ordinary sentences; a
 * schedule prints the time next to the day. The separator requirement rules out the remaining
 * prose shape, "open Monday 8am", which no practice writes inside a paragraph.
 */
const SCHEDULE_ROW_RE =
  /\b(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?\b\s*[:–—-]\s*(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|closed)\b/iu;

/**
 * A run of capitalised label words with no sentence punctuation — a printed menu, not a sentence.
 *
 * This is the predicate `clinicCardBody` already uses to reject a whole card body, restated here
 * so the same judgement can be made about a TAIL. It is not applied to a whole block: measured
 * against the corpora, "What to Expect at Your Appointment" and "The Real Risk of Veneers Isn't
 * the Procedure Itself" are both keyword blobs by this test and both are the practice's own
 * headings, which is why the trimmer below only ever consults it after a real sentence has ended.
 */
function isKeywordRun(text: string): boolean {
  /**
   * The ellipsis counts as sentence punctuation here, which is not a nicety — it is the whole
   * reason this rule is safe. Three apa provider biographies end in a sentence the crawl truncated
   * ("He is board-certified by the American Board of Oral Implantology…", "In 2002, he founded the
   * Rosenthal Institute at New York University's College of Dentistry to further the…"). Those are
   * proper-noun-dense, carry no full stop, and were cut as menus by the first version of this
   * rule. A run that ends mid-sentence is a sentence; a menu never trails off.
   */
  if (/[.!?]|…|\.\.\./u.test(text)) return false;
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length < 6) return false;
  const carrying = words.filter((word) => word.replace(/[^A-Za-z]/gu, '').length > 3);
  if (carrying.length < 4) return false;
  const capitalised = carrying.filter((word) => /^[^A-Za-z]*[A-Z]/u.test(word)).length;
  return capitalised / carrying.length >= 0.6;
}

/** The index just past the last `.`/`!`/`?` that ends a sentence rather than an abbreviation. */
function lastSentenceEnd(text: string): number {
  let best = -1;
  for (const match of text.matchAll(/[.!?](?=\s|$)/gu)) {
    const index = (match.index ?? 0) + 1;
    // "Dr." / "St." / "U.S." end a token, not a sentence — the same guard `clinicCardBody` uses.
    if (/(?:^|\s)(?:[A-Z][a-z]{0,2}|[A-Z](?:\.[A-Z])*)\.$/u.test(text.slice(0, index))) continue;
    best = index;
  }
  return best;
}

/**
 * Prose with a trailing run of site chrome removed, cut at the last real sentence boundary before
 * it. Returns `undefined` when nothing but chrome is left.
 *
 * The cut point is a sentence end and never a word boundary, because half a sentence published
 * under a practice's name is worse than the menu it replaced. Where there is no sentence at all
 * before the contamination the whole block goes: a block that is only a schedule row or only a
 * menu was never prose, and there is nothing in it to keep.
 *
 * Deliberately NOT a general "Title Case looks like a menu" rule over the whole block. That was
 * built, measured against the eight corpora, and rejected: it fired on 40+ of the practices' own
 * headings and on two apa provider biographies ("...and at Nova Southeastern University College of
 * Dental Medicine"), because a proper-noun phrase and a nav column have the same capitalisation.
 * Requiring a completed sentence in front of the run is what separates them.
 */
export function sourceProseWithoutTrailingChrome(value: string): string | undefined {
  const text = value.trim();
  if (text.length === 0) return undefined;
  const schedule = SCHEDULE_ROW_RE.exec(text);
  if (schedule) {
    // The last sentence that finished BEFORE the schedule row started, not the last in the block:
    // a paragraph whose middle names an hours row keeps the paragraph up to that point.
    const boundary = lastSentenceEnd(text.slice(0, schedule.index));
    return boundary < 0 ? undefined : text.slice(0, boundary).trim() || undefined;
  }
  const boundary = lastSentenceEnd(text);
  if (boundary < 0 || boundary >= text.length) return text;
  return isKeywordRun(text.slice(boundary).trim())
    ? text.slice(0, boundary).trim() || undefined
    : text;
}

const PROCEDURE_NAME_MAXIMUM = 60;
const PROCEDURE_WORD_MAXIMUM = 6;

/** Headings a page uses to introduce a list of treatments, which are not themselves treatments. */
const SECTION_LABEL_RE =
  /^(?:we\s+offer\b|our\s+(?:services|treatments|procedures)\b|services?\b|treatments?\b|procedures?\b|what\s+we\s+(?:offer|do)\b|opening\s+hours?\b|office\s+hours?\b|hours?\b|about\s+us\b|contact\s+us\b|locations?\b|new\s+patients?\b|meet\s+the\b|why\s+choose\b)/iu;

/**
 * "Our Comprehensive Oral Surgery Services Include" names the list, not a procedure. The phrase
 * can start anywhere in the heading, so it is matched separately from the anchored labels above.
 */
export const LIST_INTRODUCTION_RE =
  /\b(?:services?|treatments?|procedures?)\s+(?:we\s+)?(?:include|offered|available)\b|\binclude\s*:\s*$/iu;

/**
 * Vocabulary a dental or medical procedure name draws on. Brand names that function as procedure
 * names are included because practices list them that way.
 */
const PROCEDURE_VOCABULARY_RE =
  /\b(?:implant|denture|veneer|crown|bridge|filling|extraction|whitening|bleaching|cleaning|hygiene|periodont(?:al|ics)|endodont(?:ic|ics)|root canal|orthodont(?:ic|ics)|braces|aligner|invisalign|dentistry|dental|oral surgery|surgery|graft|sedation|prosthodont(?:ic|ics)|restorative|cosmetic|preventive|prophylaxis|sealant|fluoride|mouthguard|nightguard|retainer|bonding|inlay|onlay|apicoectomy|frenectomy|gingivectomy|scaling|planing|wisdom (?:tooth|teeth)|tmj|smile makeover|full[- ]arch|all[- ]on[- ](?:4|6)|exam|x[- ]?ray|radiograph|consultation|emergency)s?\b/iu;

/**
 * Whether a source string may be published as a schema.org MedicalProcedure.
 *
 * This gate fails closed. A name it wrongly withholds costs one schema node; a name it wrongly
 * publishes tells search engines and AI systems that the practice performs a procedure called
 * "Tap Hide Toolbar Back How long do you want to hide the toolbar" — which is the opposite of what
 * this product claims to do for a clinic.
 */
/**
 * A nav label has to name a treatment, not describe one. These are the shapes that reached the
 * bar from real crawls: a possessive framing, a step or process heading, a stage in a workflow,
 * and a sentence that starts with a verb.
 */
const TITLE_NOT_A_NAME_RE =
  /^(?:our|the|why|how|what|when|a|an)\b|\b(?:process|step|steps|procedure\s+overview|overview|consultation|scan|essential|combines|includes|explained|guide|benefits?)\b|^[a-z]+(?:s|es|ed)\b/iu;

/** A heading that introduces a list, or names the page's own section, is not a page title. */
export function isUsableProcedurePageTitle(value: string): boolean {
  const name = value.trim();
  if (!isPublishableProcedureName(name)) return false;
  return !TITLE_NOT_A_NAME_RE.test(name);
}

export function isPublishableProcedureName(value: string): boolean {
  const name = value.trim();
  if (name.length < 3 || name.length > PROCEDURE_NAME_MAXIMUM) return false;
  if (name.split(/\s+/u).length > PROCEDURE_WORD_MAXIMUM) return false;
  if (sourceTextIsSiteChrome(name)) return false;
  if (SECTION_LABEL_RE.test(name) || LIST_INTRODUCTION_RE.test(name)) return false;
  return PROCEDURE_VOCABULARY_RE.test(name);
}
