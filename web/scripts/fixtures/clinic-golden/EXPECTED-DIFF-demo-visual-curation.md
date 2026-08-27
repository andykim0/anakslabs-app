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

## Amendment — outreach-safe placeholder omission (added after `fix/prospect-surface` merged)

Change 3 below was added to this branch after the first three were measured. It removes two
sections from the outreach-safe home, so on those three entries the movement is now stated as
**section identity and tone** rather than as a JSON path count: deleting a section from the middle
of an array shifts every index after it, and a raw path diff reports that shift as ~330 changes
when the real movement is "two sections left, the rest kept their content".

`preview-full` never emitted these placeholders, so its three entries are unaffected by Change 3
and keep the path counts below.

## Permitted movement

| entry | movement |
|---|---|
| cameods outreach-safe | 2 gallery-name paths + 2 directions `w` + **2 sections removed** (no tone change) |
| cameods preview-full | 2 gallery-name paths + 4 directions `w` |
| dental360 outreach-safe | 8 directions `w` + **2 sections removed** + 2 tone reassignments |
| dental360 preview-full | 4 directions `w` |
| iddental outreach-safe | 8 directions `w` + **2 sections removed** + 2 tone reassignments |
| iddental preview-full | 4 directions `w` |

For the three `preview-full` entries the original path counts still hold exactly: cameods 6,
dental360 4, iddental 4.

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

## Change 3 — the two demo placeholders leave the outreach-safe section list

`clinic-rating-aggregate` and `clinic-before-after-placeholder` are no longer compiled on
outreach-safe, matching what preview-full already did. `demo` and `live` keep them; new-build
reaches the compiler through `demo` and removes them with `omitRoles`, which is untouched.

They were already suppressed at render by `fix/prospect-surface`. Removing them at compile is what
makes the cadence correct: `applyClinicSurfaceCadence` assigns tones over the section list, so
while the placeholders were still in that list the rhythm was solved against sections nobody saw.

**Home section list and tone, before → after. This is the complete permitted movement for the
three outreach-safe entries; every other page is unchanged apart from the directions `w`.**

```
cameods     before  hero:base  gallery:tint  services:tint  gallery-2:dark  rating:base  beforeafter:base  contact:base  faq:base  cta:brand
            after   hero:base  gallery:tint  services:tint  gallery-2:dark               contact:base  faq:base  cta:brand
            -> 2 sections removed, ZERO tone reassignments (both were `base` in the tail)

dental360   before  hero:base  services:tint  rating:tint  gallery:dark  beforeafter:base  contact:base  cta:brand
            after   hero:base  services:tint  gallery:tint               contact:dark  cta:brand
            -> gallery dark->tint, contact base->dark

iddental    before  hero:base  services:tint  rating:tint  gallery:dark  beforeafter:base  insurance:base  contact:base  faq:base  cta:brand
            after   hero:base  services:tint  gallery:tint               insurance:dark  contact:base  faq:base  cta:brand
            -> gallery dark->tint, insurance base->dark
```

Verified: on the sections that survive, the ONLY property that moves is `surfaceTone`. Measured
per-section, dental360 `clinic-practice-gallery` = 1 path (`surfaceTone`), iddental
`clinic-practice-gallery` = 1 path, iddental `clinic-accepted-insurance` = 1 path. No tile, image,
text, element or frame content changes with the tone.

dental360 and iddental are exactly the two fixtures where `clinic-rating-aggregate` was `tint` —
i.e. `us-demo-services`'s cadence partner. Those are the two that were rendering a lone tint
against the dark gallery, and they are the two whose tones move. cameods never had the defect and
correspondingly gets no tone reassignment, which is the evidence that the change is scoped to what
it claimed to fix.

### Test consumers updated, with rationale in the file

- `us-demo/source-compiler.test.ts` — asserted both sections present on outreach-safe; inverted to
  assert absent. What it defended (the demo never fabricates patient evidence) is strengthened, not
  weakened: not emitting the section is stricter than emitting an image-free placeholder. The
  `testimonials` assertion is untouched.
- `us-demo/clinic-multipage.test.ts` — asserted both disclosure strings present on outreach-safe;
  inverted to assert absent from both modes. `provider-placeholder.svg` is still asserted present
  on outreach-safe, and the `doesNotMatch` guard on preview-full is untouched.
- `clinic-master/newbuild.test.ts` — **not modified.** New-build compiles through `demo`, which
  this change does not touch; the test passes unchanged, which is the evidence that new-build
  behaviour was not weakened.

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
