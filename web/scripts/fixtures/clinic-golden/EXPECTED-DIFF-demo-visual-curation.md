# Expected golden diff — `fix/demo-visual-curation`

Written and committed BEFORE `dental-golden.json` is regenerated, per the arithmetic rule in
`src/lib/us-demo/dental-golden.test.ts`. Any golden movement **not** on this list is a stop —
including one that could be explained afterwards. A stated mover that does not move is equally a
stop.

Measured on the real issuance path (`prepareUsMedicalPreview`), not a harness: every number below
came from compiling the fixture and diffing against the committed golden.

Baseline before this branch: **2500 tests, 2500 pass, 0 fail.**
With the code change and the golden not yet regenerated: **2500 tests, 2494 pass, 6 fail** — the 6
failures are exactly the 6 golden entries below and nothing else.

---

## Total permitted movement: 40 JSON paths across 6 entries

| entry | paths | gallery name | directions title `w` |
|---|---|---|---|
| cameods outreach-safe | 10 | 2 | 8 |
| cameods preview-full | 6 | 2 | 4 |
| dental360 outreach-safe | 8 | — | 8 |
| dental360 preview-full | 4 | — | 4 |
| iddental outreach-safe | 8 | — | 8 |
| iddental preview-full | 4 | — | 4 |

Nothing else moves. Specifically **unchanged, byte for byte**, in all six entries:
`deliverable`, `deliveryBlockers`, `sourceReport` (totalBlocks / usedBlocks / excludedBlocks),
every `jsonLd` node, `theme.palette` (all seven slots), every `meta.title`, every element `src`
and `alt`, every element count, and every `sectionHeight`.

---

## Change 1 — second practice gallery is renamed (cameods only)

Two sections on the cameods home page were both titled "Practice Gallery". The 24-photograph pool
splits into two twelve-tile bands and the continuation now says what is true of it.

Exactly 2 paths per cameods entry, 0 for dental360 and iddental (neither has a second band):

```
p0/s3 name           : "Practice Gallery" -> "More From Our Practice"
p0/s3 elements[0].text: "Practice Gallery" -> "More From Our Practice"
```

## Change 2 — `directions.info-card-stack` title frame widens

The cards in this variant already span the full `flow-full` text zone; the heading above them was
capped at `zone.w * 0.68`. The cap is removed, so the title frame ends where its own content ends.

Only the `w` of `*-layout-title` moves, and only on the `wide` and `compact` bands. `x`, `y`, `h`,
`sectionHeight`, `fontSizes` and every card frame are unchanged — the titles are single-line at
both widths, so nothing reflows. `mobile` was already at `1.0` and does not move.

Every affected frame takes exactly one of two value pairs:

```
bands.wide.frames.<id>.w   : 861.696 -> 1267.2
bands.compact.frames.<id>.w:  470.016 ->  691.2
```

Three section ids use this variant and all three move:

| section id | fixtures |
|---|---|
| `us-demo-contact-layout-title` | cameods, dental360, iddental (home + contact page) |
| `clinic-rating-aggregate-layout-title` | cameods, dental360, iddental (outreach-safe only) |
| `clinic-before-after-placeholder-layout-title` | cameods, dental360, iddental (outreach-safe only) |

`preview-full` carries fewer of these sections than `outreach-safe`, which is why its path count is
4 rather than 8.

---

## Deliberately NOT in the golden

- **Association marks in galleries.** dental360's two marks (`AAO.png`, `ABO-3.png`) are not placed
  in any gallery in its compiled output, so its golden does not move. cameods and iddental have
  none. The rule is real and measured — it removes 10 marks across the seven corpora — but the
  three dental fixtures happen not to exercise it in a gallery slot.
- **Palette.** cameods holds at `#3C2029 deep-neutral`, dental360 at `#003EDA darken-to-gate`,
  iddental at the specialty fallback. No pinned expectation in `clinic-palette-wiring.test.ts` or
  `clinic-palette-rescue.test.ts` was edited.
- **Display name.** The rule fires on 4 of Ora's 100 pages and on 0 pages of all six other corpora,
  including all three golden fixtures.
- **Logo selection.** Changes Ora only. Brentwood, dental360, iddental keep the mark they had.
- **Gallery crop anchor.** A renderer stylesheet rule, so it cannot reach the compiled config.

## Already-issued previews

Unaffected. A previously issued preview is a stored `site_config` read back from the shared-preview
repository; nothing in this branch rewrites stored configs, and the compile path only runs when a
new preview is prepared. The one exception is the crop anchor, which is renderer CSS and therefore
applies to stored configs on next render — deliberately, since it changes no data and only moves
the crop window of gallery tiles.
