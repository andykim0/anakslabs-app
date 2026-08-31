/**
 * GEO EVIDENCE, READ OFF THE PRACTICE'S OWN ADDRESS.
 *
 * Nothing here consults a gazetteer. The only reason "Tulsa" counts as a place is that the
 * practice prints "Tulsa, OK, 74145" as its own address, and the only reason "OK" counts as a
 * state is that the same address says so. That is the rule the nav-label geo strip already
 * shipped on; this module is where it now lives so the header's brand label can use the same
 * evidence instead of inventing a second one.
 *
 * A leaf module on purpose: the renderer imports it, so it must pull in nothing.
 */

export const US_STATE_CODE_RE =
  /^(?:A[LKZR]|C[AOT]|DE|FL|GA|HI|I[DLNA]|K[SY]|LA|M[EDAINSOT]|N[EVHJMYCD]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[TA]|W[AVIY]|DC)$/u;

/**
 * `<locality> <ST> <ZIP>`, with the separators a real address actually uses. The comma after the
 * state code is the tolerance this rule gained when Forefront's "Tulsa, OK, 74145" — a perfectly
 * ordinary Squarespace address block — matched nothing and left the practice with no locality at
 * all. Everything before that comma is unchanged, which is why no already-correct corpus moves.
 */
const ADDRESS_LOCALITY_RE = /([A-Za-z][A-Za-z.'’\- ]{1,30}?),?\s+([A-Z]{2})[,.]?\s+\d{5}/u;

export interface ClinicGeoEvidence {
  /** Lower-cased one, two and three word tails of the locality run. */
  localities: readonly string[];
  /** Upper-case two-letter state codes this practice publishes for itself. */
  states: readonly string[];
}

/**
 * One, two and three word tails are all kept because an address is not reliably comma-separated:
 * "128 South Brook Drive Leander, TX 78641" puts the street and the locality in one run.
 */
export function clinicAddressGeoEvidence(
  addresses: readonly string[],
): ClinicGeoEvidence {
  const localities = new Set<string>();
  const states = new Set<string>();
  for (const address of addresses) {
    const match = ADDRESS_LOCALITY_RE.exec(address);
    if (!match || !US_STATE_CODE_RE.test(match[2])) continue;
    states.add(match[2]);
    const tail = match[1].trim().replace(/^.*,\s*/u, '').trim();
    const words = tail.split(/\s+/u);
    for (let take = 1; take <= Math.min(3, words.length); take += 1) {
      const candidate = words.slice(words.length - take).join(' ');
      if (candidate.length >= 3) localities.add(candidate.toLocaleLowerCase('en-US'));
    }
  }
  return { localities: [...localities], states: [...states] };
}

/** The nav-label rule's original shape, unchanged for its caller. */
export function clinicNavLocalities(addresses: readonly string[]): string[] {
  return [...clinicAddressGeoEvidence(addresses).localities];
}

/* ------------------------------------------------------- the brand display name ------------ */

/**
 * Separators a practice puts between an SEO phrase and its own name. The em dash is the one the
 * header already split on; the spaced hyphen and the pipe are the two other conventions the same
 * <title> field uses, and they are required to carry spaces so "King's Park" and
 * "Orthopedic & Sports-Medicine" are never cut in half.
 */
const BRAND_SEGMENT_SPLIT_RE = /\s*[—–]\s*|\s+[·•-]\s+|\s*\|\s*/u;

/**
 * Words that describe what a practice is rather than which practice it is. Used only for the
 * whole-segment test: a segment made of nothing but these is a category, not a name.
 */
const GENERIC_PRACTICE_WORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'the', 'of', 'in', 'at', 'near', 'your', 'our',
  'dentist', 'dentists', 'dentistry', 'dental', 'denta',
  'orthodontist', 'orthodontists', 'orthodontics', 'orthodontic',
  'dermatologist', 'dermatologists', 'dermatology', 'dermatologic',
  'orthopedic', 'orthopedics', 'orthopaedic', 'orthopaedics',
  'doctor', 'doctors', 'physician', 'physicians', 'surgeon', 'surgeons',
  'clinic', 'clinics', 'practice', 'office', 'offices', 'center', 'centre',
  'care', 'health', 'medical', 'medicine', 'implants', 'implant',
]);

function brandWords(value: string): string[] {
  return value
    .replace(/[.,;:]+/gu, ' ')
    .split(/\s+/u)
    .map((word) => word.trim())
    .filter(Boolean);
}

function isAllGeneric(value: string): boolean {
  const words = brandWords(value);
  if (words.length === 0) return true;
  return words.every((word) => (
    GENERIC_PRACTICE_WORDS.has(word.toLocaleLowerCase('en-US').replace(/[^a-z]/gu, ''))
  ));
}

/** Does this segment carry the practice's own state code, or its own locality, as a whole token? */
function carriesGeoMarker(value: string, evidence: ClinicGeoEvidence): boolean {
  const words = brandWords(value);
  if (words.some((word) => evidence.states.includes(word))) return true;
  const lower = words.map((word) => word.toLocaleLowerCase('en-US'));
  return evidence.localities.some((locality) => {
    const parts = locality.split(' ');
    for (let start = 0; start + parts.length <= lower.length; start += 1) {
      if (parts.every((part, offset) => lower[start + offset] === part)) return true;
    }
    return false;
  });
}

/**
 * Remove a trailing geo qualifier, and only on the practice's own evidence.
 *
 * The run has to END in this practice's own state code — "Forefront Dentistry Tulsa OK", and not
 * "Northbank Orthopedic & Sports Medicine", whose last word is a word. Once the state code is off,
 * a locality this practice publishes may come off with it, then a dangling preposition. Two
 * independent tokens from the same address agreeing on the same tail is what makes this safe; a
 * bare city word alone is not enough, because a practice named for its neighbourhood
 * ("Brentwood Dentistry", "Larkfield Dermatology") prints that word in front, not behind.
 */
export function stripClinicBrandGeoQualifier(
  name: string,
  evidence: ClinicGeoEvidence,
): string {
  const words = name.trim().split(/\s+/u);
  const bare = (word: string) => word.replace(/[.,;:]+$/u, '');
  if (words.length < 2) return name.trim();
  if (!evidence.states.includes(bare(words[words.length - 1]))) return name.trim();
  let head = words.slice(0, -1);
  const lower = head.map((word) => bare(word).toLocaleLowerCase('en-US'));
  const locality = evidence.localities
    .map((value) => value.split(' '))
    .filter((parts) => parts.length <= head.length)
    .filter((parts) => parts.every((part, offset) => (
      lower[head.length - parts.length + offset] === part
    )))
    .sort((left, right) => right.length - left.length)[0];
  if (locality) head = head.slice(0, head.length - locality.length);
  while (head.length > 0 && /^(?:in|at|near)$/iu.test(bare(head[head.length - 1]))) {
    head = head.slice(0, -1);
  }
  const stripped = head.join(' ').replace(/[\s,;:·-]+$/u, '').trim();
  /** A strip that leaves nothing, or leaves only a category, has removed the name. Keep the name. */
  if (!stripped || isAllGeneric(stripped)) return name.trim();
  return stripped;
}

/**
 * THE PRACTICE'S NAME, OUT OF A FIELD WRITTEN FOR A SEARCH ENGINE.
 *
 * `meta.title` is the SEO title and keeps that job — it is the <title> and the JSON-LD name, and
 * nothing here rewrites it. The header, and the blog's educational notice, need the name on the
 * door, and a <title> carries it in one of three conventions this corpus actually contains:
 *
 *   "Brentwood Dentistry"                              nothing to do
 *   "Forefront Dentistry Tulsa OK"                     geo appended, no separator
 *   "Dentist Burke VA - King's Park Dental Center"     geo FIRST, the name after the separator
 *
 * So the segment is chosen before anything is stripped: of the separator-delimited segments, the
 * first that carries no geo marker of this practice's own and is not purely a category. That
 * answers the third case without a rule about which side of a dash a name lives on. Only then is
 * a trailing qualifier removed, which answers the second.
 */
export function clinicBrandDisplayName(
  rawName: string,
  addresses: readonly string[],
): string {
  const raw = rawName.trim();
  if (!raw) return raw;
  const evidence = clinicAddressGeoEvidence(addresses);
  const segments = raw.split(BRAND_SEGMENT_SPLIT_RE).map((part) => part.trim()).filter(Boolean);
  const chosen = segments.length > 1
    ? segments.find((segment) => !carriesGeoMarker(segment, evidence) && !isAllGeneric(segment))
      ?? segments[0]
    : segments[0] ?? raw;
  return stripClinicBrandGeoQualifier(chosen, evidence) || raw;
}
