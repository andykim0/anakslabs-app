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
