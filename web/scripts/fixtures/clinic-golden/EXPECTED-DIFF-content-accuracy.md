# Expected golden diff — `fix/content-accuracy`

Written and committed BEFORE `dental-golden.json` is regenerated, per the arithmetic rule in
`src/lib/us-demo/dental-golden.test.ts`. Any golden movement **not** on this list is a stop —
including one that could be explained afterwards. A stated mover that does not move is equally a
stop.

Measured on the real issuance path (`prepareUsMedicalPreview`), not a harness: every number below
came from compiling the fixture and diffing against the committed golden, and from an
element-by-element capture of all seven committed corpora plus the stored Brentwood artifact
(row `16303e58-13d0-486a-bb8a-b03ffa3d4f6a`, 91 pages), both render modes. Brentwood was compiled
with `designLanguage: 'marquee'`, the same call that issued the link now under review.

Baseline before this branch: **2715 tests, 2715 pass, 0 fail.**
With the code changes and the golden not yet regenerated: **2751 tests, 2747 pass, 4 fail** — the 4
golden entries below and nothing else. (36 of the 2751 are new; see *Tests added*.)

---

## Permitted movement

| entry | movement |
|---|---|
| cameods outreach-safe | **none — byte-identical, same sha256** |
| cameods preview-full | **none — byte-identical, same sha256** |
| dental360 outreach-safe | one `directions` row VALUE and its element id, on the home page and on `/contact`: the fourth card stops repeating the third address and shows the next distinct location. `elements` length unchanged, `sourceReport` unchanged |
| dental360 preview-full | the same |
| iddental outreach-safe | `pages[0].sections[us-demo-contact].elements` 9 → 7 and `pages[11]` the same — one `Hours` label and its value, on the home page and on `/contact`; `sourceReport.usedBlocks` 375 → 374 |
| iddental preview-full | the same three |

cameods moving by zero bytes is not incidental. It publishes its schedule once, in JSON-LD
(`structured.openingHours`, identical on all 20 pages) and exactly one phone and one address, so it
has a single candidate of every kind and every selector on this branch returns it unchanged. Its
silence is the evidence that both changes are scoped to duplication and touch nothing else.

**Amendment, recorded rather than quietly folded in.** The first version of this document declared
dental360 byte-identical and listed address deduplication under *Deliberately NOT in this branch*,
on the stated ground that "no corpus produces a second one today". **That claim was false**, and the
hours fix is what exposed it: with one of Brentwood's two Hours cards gone, a second Address card
surfaced from under the four-row cap in `layout-sections.ts:738` —
`11611 San Vicente Blvd., Ste L1, Los Angeles, CA 90049` beside the identical line without the comma
after `Ste L1`. dental360 had the same defect and the same cap was hiding it. The rule is now in the
branch and dental360 is a declared mover; see *Change 2*.

iddental is the only dental fixture that publishes **two differently worded** schedules, so it is
the only one that could move:

| block | source | reading |
|---|---|---|
| `Thu: 9:30 AM – 6:00 PMSaturday: 9:00 AM` | `/` footer, 16 of 20 pages | Thu 9:30–18:00 — and nothing else, because the crawl glued "PMSaturday" together and "Saturday: 9:00 AM" has no closing time |
| `Mon–Thu 9:30 AM – 6:00 PM · Sat 9:00 AM – 2:00 PM` | `/services/emergency-dentistry` | Mon–Thu 9:30–18:00, Sat 9:00–14:00 |

They do not contradict each other — Thursday reads 9:30–18:00 in both — so the first is a subset of
the second and the more complete rendering is printed, **once**. The card iddental loses is the
truncated one. Verified unchanged on both moving entries, asserted field by field: `deliverable`,
`deliveryBlockers`, every `jsonLd` node, the whole `theme` object, the whole `meta` object, the page
slug list, the section id list of every page, every `surfaceTone`, and every image element in
content and order (53 outreach-safe, 61 preview-full, unmoved). `totalBlocks` and `excludedBlocks`
do not move either — the block is still extracted and still allowed; it is simply not placed twice.

---

## Change — a practice has one set of opening hours, so the demo prints one

Brentwood's issued link carried two `Hours` cards in one `Location` section, on both the home page
and `/contact`:

> **Hours** — Wednesday: 8am – 5pm Thursday: 8am – 5pm Friday: 8am – 5pm Saturday: Closed Sunday: Closed
> **Hours** — Mon – Fri: 8am – 5pm Sat & Sun: Closed

Two independent faults, and the first one is the more serious because it is not a duplication
problem at all — it is a **false statement**.

### Fault 1, the extractor deleted two days from the practice's week

`OPENING_HOURS_TOKEN_RE` (`src/lib/us-demo/source-extraction.ts:62`) terminated on
`\b(?:am|pm|closed)\b`. A word boundary cannot sit between a digit and a letter, so **`8am` and
`5pm` were never valid terminators** — `/\bam\b/u.test('8am')` is `false`. Every match therefore had
to run all the way to a `Closed`.

Brentwood's footer, published on 82 of its 91 pages, reads:

> Hours Monday: 8am – 5pm Tuesday: 8am – 5pm Wednesday: 8am – 5pm Thursday: 8am – 5pm Friday: 8am – 5pm Saturday: Closed Sunday: Closed

The first `Closed` is **100 characters** past `Monday` and **81** past `Tuesday`, both outside the
80-character window; it is **60** past `Wednesday`. So the leftmost match that could fit began at
Wednesday, and the card told the prospect's patients the practice is shut on Monday and Tuesday.
The other card, from `/contact/`, was the correct one all along.

**Fix.** The terminator now accepts the clock itself (`\bclosed\b|\d\s*[ap]\.?m\.?\b`) and the
window holds a seven-day enumeration (150). Measured page by page across all eight corpora:

| fixture | before | after |
|---|---|---|
| cameods | *(structured JSON-LD; regex not consulted)* | unchanged |
| dental360 | `Monday - Friday 9:00 - 6:00 \| Saturday 9:00 - 2:00 \| Sunday Closed` ×20 | **identical** |
| iddental | `Thu: 9:30 AM – 6:00 PMSaturday: 9:00 AM` ×16, `Mon–Thu 9:30 AM – 6:00 PM · Sat 9:00 AM – 2:00 PM` ×1 | **identical** |
| larkfield-derm | `Monday to Friday…` ×12, `Monday to Thursday…` ×1 | **identical** |
| northbank-ortho | `Monday to Friday, 8:00 AM to 5:00 PM` ×15 | **identical** |
| apa | *(no match on any of 92 pages)* | `Monday through Thursday from 9:00 a.m` ×1 — **read as nothing, see below** |
| enamel | *(no match on any of 27 pages)* | `Mon–Fri, 7am–7pm` ×1 |
| **brentwood** | `Wednesday: … Sunday: Closed` ×82 | **`Monday: 8am – 5pm Tuesday: … Sunday: Closed` ×82** |

Five of eight byte-identical. The widened window costs nothing on them because their schedules were
already short enough to terminate inside 80 characters.

### Fault 2, every surviving block became its own card

`buildClinicDirectionsSection` labels each row from `block.kind`, so **every** `opening_hours` block
that reached it was rendered as a card titled `Hours`
(`src/lib/clinic-master/compiler.ts:341-349`). The row list had no per-kind uniqueness
(`compiler.ts:230-232`), and the only limiter is `rows.slice(0, 4)`
(`src/lib/clinic-engine/layout-sections.ts:738`) — Phone + Address + Hours + Hours is exactly 4, so
both fitted. Upstream, the global dedupe key is `kind + exact text`
(`source-extraction.ts:702`), which collapses twenty identical footers into one but cannot see that
two differently worded strings describe the same week.

**Fix.** `src/lib/us-demo/opening-hours.ts` (new) reads each candidate into a weekday → interval map
instead of comparing strings, and `compiler.ts:230` places at most one:

- **nothing parses** → no Hours card. Never synthesised, never guessed.
- **the candidates conflict** (one weekday carries two different values) → no Hours card. We cannot
  tell which is current, and an arbitrary pick is a coin toss printed as a fact.
- **they agree** (a subset agrees with its superset) → the most complete one, placed exactly once.
  Ties break on the shorter rendering, then the block id, so the choice never depends on crawl
  order.

The completeness gate is also what keeps a prose fragment out of the card, and it is why **apa gains
no Hours card despite gaining a match**: `Monday through Thursday from 9:00 a.m` is a weekday and an
*opening* time with no closing time — the crawl's `[^.]` window stopped at the period inside
"a.m." — so it resolves zero intervals and is not a schedule.

A day-token bug found while building the reader is recorded because it would have silently halved
the evidence: `(?:mon|tues?|weds?|thurs?|fri|sat|sun)(?:day)?` **cannot match "Wednesday" or
"Saturday"**. It matches their first three letters and leaves `nesday`/`urday` behind, so every
Wednesday and Saturday row dropped out of the reading — including, on the very footer under repair,
the `Saturday: Closed` that makes the week complete. The tokens are now spelled out with a trailing
`\b`.

Effect, per corpus, on the rendered `Location` section (cards per page; the section renders on both
the home page and `/contact`):

| fixture | Hours cards before | after | what the single card says |
|---|---|---|---|
| cameods | 1 | 1 | unchanged — `Monday,Tuesday,…Friday 08:00-17:00 · Saturday 08:00-12:00` |
| dental360 | 1 | 1 | unchanged |
| northbank-ortho | 1 | 1 | unchanged |
| apa | 0 | 0 | — |
| enamel | 0 | **1** | `Mon–Fri, 7am–7pm` |
| **iddental** | **2** | **1** | `Mon–Thu 9:30 AM – 6:00 PM · Sat 9:00 AM – 2:00 PM` |
| **larkfield-derm** | **2** | **1** | `Monday to Friday, 8:00 AM to 5:00 PM` |
| **brentwood** | **2** | **1** | `Mon – Fri: 8am – 5pm Sat & Sun: Closed` |

larkfield-derm's two renderings are `Monday to Friday` and `Monday to Thursday`. They do not
conflict — Monday through Thursday reads 8:00–17:00 in both — so this is a subset, not a
disagreement, and the five-day rendering is printed. Had the practice published two genuinely
different Friday values, the rule prints nothing.

Brentwood ends with **one** card carrying `Mon – Fri: 8am – 5pm Sat & Sun: Closed`, which is what
the practice publishes on `/contact/` and, once the truncation is repaired, exactly what its footer
says on all 82 pages as well. The two renderings now read identically, which is the point: the
selector is choosing between two ways of saying one thing rather than arbitrating a contradiction it
manufactured.

**Never synthesised.** The card prints a source block verbatim. A per-corpus assertion in
`opening-hours.test.ts` pins this: whatever the card says must be a member of the set of
`opening_hours` block texts the practice actually published.

---

## Change 2 — the practice's address, once per place

`buildClinicDirectionsSection` labels a row from `block.kind` the same way it labels Hours, so every
`address` block that reached it became its own `Address` card. The upstream dedupe key is
`kind + exact text` (`source-extraction.ts:702`), which cannot see that a comma is not a second
clinic.

| fixture | address blocks extracted | the same place, worded differently |
|---|---|---|
| cameods | 1 | — |
| iddental, apa, enamel, larkfield-derm, northbank-ortho | 1 each | — |
| dental360 | 8 across 5 clinics | `3435 W. Irving Park Rd, Chicago, IL 60618` · `3435 W. Irving Park Rd Chicago, IL 60618` · `3435 W Irving Park Rd Chicago, IL 60618` |
| brentwood | 2 | `11611 San Vicente Blvd., Ste L1, Los Angeles, CA 90049` · the same without the comma after `Ste L1` |

**Fix.** `compiler.ts:230` keys phone and address on the text with punctuation and spacing
normalised away (`[^a-z0-9]+` collapsed to a single space), and keeps the first of each key. Two
addresses that name different places have different keys and both survive — which is why dental360
keeps its five distinct clinics.

Effect on the rendered `Location` section, both render modes:

| fixture | before | after |
|---|---|---|
| cameods, iddental, apa, enamel, larkfield-derm, northbank-ortho | 1 Address card | unchanged |
| **dental360** | `3435 W. Irving Park Rd, Chicago, IL 60618` **and** `3435 W. Irving Park Rd Chicago, IL 60618` — the same clinic twice | `3435 W. Irving Park Rd, Chicago, IL 60618` **and** `360 Berwyn LLC7039 W Roosevelt Rd, Berwyn, IL 60402` — two different clinics |
| **brentwood** | 2 Address cards, one a punctuation variant of the other | 1 |

dental360's four-row cap is still full, so it loses no card: the slot the duplicate occupied is
taken by the next distinct location the practice publishes. The element count does not move, only
the value in that row and its source-derived element id.

---

## Tests added

- `src/lib/us-demo/opening-hours.test.ts` (34 cases) — all seven committed corpora × both render
  modes: at most one `Hours` card per `Location` section, on every page; plus a per-corpus assertion
  that the printed schedule is a published block verbatim. Plus the reader's unit probes: the
  seven-day footer keeps Monday and Tuesday; Wednesday and Saturday are read rather than truncated
  to a three-letter prefix; ranges expand and lists enumerate; the four weekday-prose survival cases
  (`"We are closed on Sunday."`, `"…every Monday and Thursday."`, `"Appointments run Monday through
  Friday at both locations."`, `"We open Monday 8am for emergencies."`) read as nothing; an opening
  time with no closing time is not a schedule; subset/superset resolves to the complete rendering; a
  real contradiction prints nothing; and the choice is independent of crawl order.

## Deliberately NOT in this branch

- **Merging two renderings into a third.** The card prints what the practice published or nothing.
  A synthesised "Mon–Fri 8am–5pm, Sat–Sun closed" assembled from two partial sources would be a
  sentence no one on the practice's staff ever wrote.
- **Collapsing two addresses that name different places.** The key is the normalised address, not
  the block kind, precisely so a multi-location group keeps every location it publishes. dental360
  is that case: it publishes eight address blocks across five clinics, and the branch removes only
  the punctuation variants of one of them.
- **iddental's glued footer.** `Thu: 9:30 AM – 6:00 PMSaturday: 9:00 AM` is missing a space in the
  practice's own markup. The reader now declines to guess at it and the complete rendering wins, so
  repairing the glue would change no output.
