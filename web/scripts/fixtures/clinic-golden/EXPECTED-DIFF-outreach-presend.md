# Expected golden diff — `fix/outreach-presend`

Written and committed BEFORE `dental-golden.json` is regenerated, per the arithmetic rule in
`src/lib/us-demo/dental-golden.test.ts`. Any golden movement **not** on this list is a stop —
including one that could be explained afterwards. A stated mover that does not move is equally a
stop.

Measured on the real issuance path (`prepareUsMedicalPreview`), not a harness: every number below
came from compiling the fixture and diffing against the committed golden.

Baseline before this branch: **2580 tests, 2580 pass, 0 fail.**
With the code change and the golden not yet regenerated: **2580 tests, 2575 pass, 5 fail** — the 4
golden entries below plus one consumer assertion (`clinic-multipage.test.ts`, recorded at the end)
and nothing else.

---

## Permitted movement

| entry | movement |
|---|---|
| cameods outreach-safe | **none — byte-identical, same sha256** |
| cameods preview-full | **none — byte-identical, same sha256** |
| dental360 outreach-safe | `us-demo-services` 2 images → 0; `ABO-3.png` swapped out of `oral-surgery`; body-image reindex |
| dental360 preview-full | same three |
| iddental outreach-safe | `us-demo-services` 7 images → 0; `clinic-practice-gallery` 10 → 12; body-image reindex |
| iddental preview-full | same three |

cameods moving by zero bytes is not incidental. It has no association marks, its services grid was
already uniform at 0 of 10 cards, and it publishes no insurance strip — so it exercises none of the
three changes, and its silence is the evidence that each change is scoped to what it claims.

Verified **unchanged, byte for byte, on all four moving entries** (asserted field by field, not
eyeballed):

`deliverable`, `deliveryBlockers`, `sourceReport` (totalBlocks / usedBlocks / excludedBlocks),
every `jsonLd` node, the whole `theme` object, the whole `meta` object, the page slug list, the
section id list of every page, every `surfaceTone`, and **every text element** — 169 on dental360
outreach-safe, 170 preview-full, 563 on iddental outreach-safe, 564 preview-full, all identical in
content and order.

No source block is added or removed anywhere, which also records that the `#1` matcher change
(below) drops nothing in these three fixtures: none of them publishes the token.

---

## Change 1 — the association filter moves from two gallery points to every selection path

`sourceImageIsAssociationMark` was applied only at the two `buildClinicGallerySections` inputs. It
now runs at every site that can put an image in a rendered slot: the home hero pool, the
services-grid card pool, `topicPhotoPool` (procedure heroes, detail bodies, page galleries), and
the provider-photo and before/after selections in `previewExperience`.

**It is still NOT applied at pool level.** That was re-measured on this branch rather than taken on
trust, and it reproduces:

```
dental360, procedureBodyImageBudget(photoSlotPool.length, procedurePages):
  pool 29, 7 procedure pages -> floor(29/7) = 4 body images per page
  pool 27 (the two marks removed) -> floor(27/7) = 3
```

An integer-division cliff. Filtering in `clinicPhotoSlotPool` costs one body slot on each of seven
procedure pages: dental360's compiled output falls 43 → 36 image elements, of which 1 is the mark
and **six are the practice's own photographs**. Filtering at the selection sites leaves the pool
size — and therefore the budget — untouched.

Golden effect, dental360 only (cameods and iddental have no marks):

```
oral-surgery/clinic-procedure-implant-details-overview
  ABO-3.png  ->  INVISALIGN.png        image count 4 -> 4, unchanged
```

This closes the defect the previous branch recorded as unreachable and deliberately left in place.

The remaining movement inside `*-details-overview` sections on dental360 is reindexing: element ids
encode the slot index (`-layout-0-N`), so removing one image from an ordered pool renumbers the
slots after it. Every filename involved is present before and after; only the index moves.

## Change 2 — the services card grid fills every media slot or none

Measured coverage before the change (cards with an image / cards):

| fixture | before | after |
|---|---|---|
| cameods | 0 / 10 | 0 / 10 — already uniform, does not move |
| enamel | 0 / 6 | 0 / 6 — already uniform, does not move |
| larkfield-derm | 6 / 6 | **6 / 6 — keeps its media** |
| dental360 | 2 / 7 | 0 / 7 |
| apa | 4 / 10 | 0 / 10 |
| northbank-ortho | 5 / 6 | 0 / 6 |
| iddental | 7 / 10 | 0 / 10 |
| ora (not committed) | 6 / 10 | 0 / 10 |

larkfield-derm keeping all six is the control: the rule enforces uniformity, it does not remove
media. Broadening each card's pool until every slot filled was the alternative and was rejected —
a card draws from its own procedure topic, so broadening it puts a photograph on a card it is not
about, and a grid of confidently mismatched pictures is worse than a grid of none.

Golden effect:

```
dental360  (home)/us-demo-services  imgs 2 -> 0   (INVISALIGN.png, invisalign-teen.png)
iddental   (home)/us-demo-services  imgs 7 -> 0
```

`sectionLayout.resolvedId` moves with it, `features.three-column-cards` → `features.icon-grid`,
because the imageless variant is now chosen deliberately rather than as a consolation.

Dropping the slot releases the reservation. `homeServiceImageIds` exists to stop a photograph being
shown twice; holding it after the grid stops showing the photograph would delete it from the page
set instead of moving it. iddental's seven released photographs are visible in the golden:

```
iddental   (home)/clinic-practice-gallery  imgs 10 -> 12   (to its twelve-tile cap)
```

dental360's two released photographs do not raise a count — they re-enter the procedure pools and
displace others, which is the rest of its `*-details-overview` reshuffle.

## Change 3 — the insurance strip takes carrier evidence, not page membership

`sourceImageIsInsuranceLogo` is a page-scoped sweep (anything unclassified on `/insurance/`,
`/financing/`, `/payment/`, `/membership/`). That is correct for the photo gate, whose question is
"may this occupy a photograph slot", and wrong for a strip headed "Accepted Insurance". A new
`sourceImageIsInsuranceCarrierMark` requires positive evidence — a named payer or plan vocabulary —
and disqualifies page banners (the crawler's own `atmosphere` role), accrediting marks, directory
rating badges, and patient-lending marks.

| fixture | swept | carrier evidence |
|---|---|---|
| iddental | 10 | **10** — every tile a named payer, strip unchanged |
| ora (not committed) | 15 | 1 |
| larkfield-derm | 1 | 0 — the one tile is the practice's own logo |
| northbank-ortho | 1 | 0 — the one tile is the practice's own logo |
| cameods, dental360, apa, enamel | 0 | 0 — no strip either way |

**Zero golden movement.** iddental's ten tiles all qualify and cameods and dental360 have no strip,
so no dental entry moves on this change. The movement is on the two non-dental specimens, which are
not in the golden:

```
larkfield-derm / northbank-ortho, both modes:
  (home)   clinic-accepted-insurance (1 tile)  ->  clinic-insurance-pricing (text)
  contact  clinic-accepted-insurance (1 tile)  ->  removed
```

When nothing qualifies, `insuranceStripSection` returns null and the existing caller falls through
to the text `clinic-insurance-pricing` section on home; contact already carries that section. This
is the honest reduction, and it needed no new code.

On the broken tile: `header-finances-insurance.jpg` is **not corrupt at source and our crop does
not break it**. It fetches HTTP 200 as a valid 26,135-byte progressive JPEG at 1920x435. It is a
page-header banner being rendered inside a 148px-minimum logo tile at 60px height with
`objectFit: contain`, which letterboxes it to a grey band with a small face. The gate is therefore
compositional rather than a decode check: a strip tile must be a mark, and the crawl already
classified this one `atmosphere`.

## Change 4 — the `#1` matcher, which was dead in both registries

No golden movement: no dental fixture publishes the token, and `sourceReport` is asserted unchanged
on all four moving entries, which is the proof.

Upstream (`us-medical-ad-guard.ts`) `#\s*1` sat inside `\b(?:…)\b`; `\b` cannot hold before `#`
after a space or at the start of a string, so the alternative never fired. It is now its own
alternative, right-anchored `1\b` and left-guarded against ordinal designators.

Downstream (`medical-ad-policy.ts`) the miss had a different shape — punctuation is stripped before
matching, so the claim arrives as `1 …`, and `\b1\s+(?:clinic|practice|provider)\b` required the
noun to be adjacent. It takes the bounded word gap the `leading` matcher in the same rule uses, and
that matcher's noun list, so the two tokens in one rule cannot disagree about what a self-reference
is.

`#1 Dental Emergency provider in Sacramento Region` — the sentence that rendered as a services-card
title on the live preview — now blocks upstream on `#1` and downstream on
`1 dental emergency provider`.

---

## Test consumers updated, with rationale in the file

- `us-demo/clinic-multipage.test.ts` — asserted the fixture's home services grid resolves to
  `features.three-column-cards`. Retargeted to `features.icon-grid` **and strengthened**: the
  resolver is still pinned, and an added assertion pins the uniformity that makes it the right
  resolver. Everything else in that test, including the insurance-strip and gallery assertions,
  passes unchanged.

## Tests added

- `us-demo/outreach-curation.test.ts` (48 cases) — all seven corpora x both render modes: no
  association mark in any rendered slot, every "Accepted Insurance" tile is carrier evidence, every
  services grid uniform. Plus the four named regressions: dental360 swaps `ABO-3.png` without
  losing the slot, iddental keeps all ten payers, larkfield-derm keeps all six card images, and
  the two specimens render no strip when their only tile is their own logo.
- `us-demo/us-medical-ad-guard.test.ts` (+10 cases) — the live sentence at both screens, four more
  `#1` shapes, eight ordinal false-positive probes (`Chapter #10`, `Suite #1`, `Implant #1`,
  `Room #1`, `Building #1`, `Figure #12`, `Step 1`, and `Suite #1, Ora Dental Practice`), and the
  five pre-existing superiority terms plus the two negative controls for `leading` and `only`.

## Deliberately NOT in the golden

- **Pool-level association filtering.** Re-measured and rejected; the numbers are in Change 1.
- **The strip's single-tile layout.** With one qualifying tile the renderer's
  `repeat(auto-fit,minmax(148px,1fr))` stretches that tile across the container. Not changed here:
  Ora's one qualifying tile is a 1029x200 composite carrier sheet, for which a wide box is the
  correct presentation, and touching the grid would move all three design-language renderers.
- **Already-issued previews.** Unaffected. A previously issued preview is a stored `site_config`
  read back from the shared-preview repository; nothing in this branch rewrites stored configs, and
  the compile path only runs when a new preview is prepared.
