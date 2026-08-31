/**
 * ONE SCHEDULE PER COMPILE, OR NONE.
 *
 * A practice publishes its hours in more than one place — a footer on every page, a compact line
 * on `/contact/`, sometimes JSON-LD — and the extractor emits one `opening_hours` block per page.
 * The global dedupe key is `kind + exact text`, so two DIFFERENTLY WORDED renderings of the same
 * schedule both survive, and `compilePremiumDentalMaster` used to hand every survivor to the
 * directions section, which labels each one `Hours`. Brentwood shipped with two Hours cards that
 * disagreed. A demo may not print contradicting facts about the practice.
 *
 * So the schedule is read rather than compared as a string. Each candidate is parsed into a
 * weekday -> interval map; two candidates AGREE when no weekday is assigned two different values,
 * which makes a subset ("Mon–Thu 9:30–6") agree with its superset ("Mon–Thu 9:30–6, Sat 9–2")
 * instead of counting as a contradiction. Then:
 *
 *   - nothing parses            -> no Hours card. Never synthesised, never guessed.
 *   - the candidates conflict   -> no Hours card. We cannot tell which one is current, and an
 *                                 arbitrary pick is a coin toss printed as a fact.
 *   - they agree                -> the most complete one, placed exactly ONCE.
 *
 * The completeness gate is also what keeps a prose fragment out of the card. `apa` publishes
 * "…open Monday through Thursday from 9:00 a.m. to 5:00 p.m." in a sentence; the extractor's
 * `[^.]` window stops at the period inside "a.m.", yielding "Monday through Thursday from
 * 9:00 a.m" — a weekday and an opening time with no closing time. That resolves zero intervals,
 * so it is not a schedule and no card is printed.
 */

/** Monday = 0 … Sunday = 6. Interval minutes from midnight, or the literal closed. */
export type OpeningHoursValue = 'closed' | { readonly open: number; readonly close: number };

export interface OpeningHoursReading {
  /** Weekday index -> what the practice says about that day. */
  readonly days: ReadonlyMap<number, OpeningHoursValue>;
  /** How many weekdays this rendering actually resolves. The completeness score. */
  readonly coverage: number;
}

const DAY_INDEX: ReadonlyMap<string, number> = new Map([
  ['mon', 0], ['monday', 0],
  ['tue', 1], ['tues', 1], ['tuesday', 1],
  ['wed', 2], ['weds', 2], ['wednesday', 2],
  ['thu', 3], ['thur', 3], ['thurs', 3], ['thursday', 3],
  ['fri', 4], ['friday', 4],
  ['sat', 5], ['saturday', 5],
  ['sun', 6], ['sunday', 6],
]);

/**
 * Spelled out rather than `(?:mon|tues?|weds?)(?:day)?`, which cannot match "Wednesday" or
 * "Saturday" at all — it matches their first three letters and leaves "nesday"/"urday" behind, so
 * every Wednesday and Saturday row was silently dropped from the reading. The `\b` at the end is
 * what stops "Sat" from matching inside "Saturday" and taking the short branch.
 */
const DAY_TOKEN =
  '(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\\b';
const RANGE_JOIN = '(?:\\s*(?:[-–—]|to|through|thru|until|till)\\s*)';
const LIST_JOIN = '(?:\\s*(?:,|&|and|\\+)\\s*)';
/** A day group: "Monday", "Mon–Fri", "Sat & Sun", "Monday,Tuesday,Wednesday". */
const DAY_GROUP = `${DAY_TOKEN}(?:(?:${RANGE_JOIN}|${LIST_JOIN})${DAY_TOKEN})*`;
/** A clock reading. The meridiem is optional because plenty of practices omit it ("9:00 - 6:00"). */
const CLOCK = '\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?\\s?m\\.?)?';
/** What the practice says about that group: an interval, or closed. Never a bare opening time. */
const VALUE = `(?:closed|${CLOCK}${RANGE_JOIN}${CLOCK})`;

const ENTRY_RE = new RegExp(
  `(${DAY_GROUP})\\s*(?::|-|–|—|,|\\.)?\\s*(?:from\\s+)?(${VALUE})`,
  'giu',
);
const DAY_IN_GROUP_RE = new RegExp(DAY_TOKEN, 'giu');
const CLOCK_RE = new RegExp(CLOCK, 'iu');

/** Which weekdays a group names. A range expands; a list enumerates. */
function daysOfGroup(group: string): number[] {
  const tokens = group.match(DAY_IN_GROUP_RE) ?? [];
  const indices = tokens
    .map((token) => DAY_INDEX.get(token.toLocaleLowerCase('en-US')))
    .filter((index): index is number => index !== undefined);
  if (indices.length === 0) return [];
  // A range is only a range when a range joiner sits between exactly two day tokens.
  const isRange = indices.length === 2
    && new RegExp(`${DAY_TOKEN}${RANGE_JOIN}${DAY_TOKEN}`, 'iu').test(group);
  if (!isRange) return [...new Set(indices)];
  const [start, end] = indices;
  const span: number[] = [];
  for (let day = start; ; day = (day + 1) % 7) {
    span.push(day);
    if (day === end || span.length > 7) break;
  }
  return span;
}

function minutesOf(clock: string): number | null {
  const match = /(\d{1,2})(?::(\d{2}))?\s*([ap])?/iu.exec(clock);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  if (hour > 23 || minute > 59) return null;
  const meridiem = match[3]?.toLocaleLowerCase('en-US');
  if (meridiem === 'p' && hour < 12) hour += 12;
  if (meridiem === 'a' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function valueOf(raw: string): OpeningHoursValue | null {
  if (/closed/iu.test(raw)) return 'closed';
  const clocks = raw.match(new RegExp(CLOCK, 'giu'))?.filter((c) => CLOCK_RE.test(c)) ?? [];
  if (clocks.length < 2) return null;
  const open = minutesOf(clocks[0]);
  const close = minutesOf(clocks[1]);
  if (open === null || close === null) return null;
  return { open, close };
}

/**
 * Read one published rendering. Returns null when the text resolves no weekday at all — which is
 * the difference between a schedule and a sentence that happens to contain a weekday.
 */
export function parseOpeningHours(text: string): OpeningHoursReading | null {
  const days = new Map<number, OpeningHoursValue>();
  ENTRY_RE.lastIndex = 0;
  for (const match of text.matchAll(ENTRY_RE)) {
    const value = valueOf(match[2]);
    if (value === null) continue;
    for (const day of daysOfGroup(match[1])) {
      // First mention of a day wins within one rendering, so a trailing restatement cannot
      // silently overwrite the row the practice led with.
      if (!days.has(day)) days.set(day, value);
    }
  }
  if (days.size === 0) return null;
  return { days, coverage: days.size };
}

function sameValue(left: OpeningHoursValue, right: OpeningHoursValue): boolean {
  if (left === 'closed' || right === 'closed') return left === right;
  return left.open === right.open && left.close === right.close;
}

/** Two readings conflict when one weekday carries two different values. Subsets do not conflict. */
export function openingHoursConflict(
  left: OpeningHoursReading,
  right: OpeningHoursReading,
): boolean {
  for (const [day, value] of left.days) {
    const other = right.days.get(day);
    if (other !== undefined && !sameValue(value, other)) return true;
  }
  return false;
}

/**
 * The single schedule this compile is allowed to print, chosen from every candidate the extractor
 * produced. See the file header for the rule. Deterministic: coverage desc, then the shortest
 * rendering (equally complete renderings say the same thing, and the compact one reads better in
 * a card), then the id, so the choice never depends on crawl order.
 */
export function selectSingleOpeningHours<T extends { readonly id: string; readonly text: string }>(
  candidates: readonly T[],
): T | undefined {
  const readings = candidates
    .map((block) => ({ block, reading: parseOpeningHours(block.text) }))
    .filter((entry): entry is { block: T; reading: OpeningHoursReading } => entry.reading !== null);
  if (readings.length === 0) return undefined;
  for (const [index, entry] of readings.entries()) {
    for (const other of readings.slice(index + 1)) {
      if (openingHoursConflict(entry.reading, other.reading)) return undefined;
    }
  }
  return [...readings].sort((left, right) => (
    right.reading.coverage - left.reading.coverage
    || left.block.text.length - right.block.text.length
    || left.block.id.localeCompare(right.block.id)
  ))[0].block;
}
