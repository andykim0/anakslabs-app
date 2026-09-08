# The tenant blog article template, and the chart figure

The article page a clinic's readers land on from a search result. It is the surface that carries
eight articles a month, so it is the surface the retainer is judged on.

**The blog carries no images. That is a product decision, not a gap.** Where the template used to
open on a cover — a generated hero, a rotating stock photograph of a declared service, or a
tokenised brand plate standing in for one — it now opens on type, and an article's one picture is
a **chart it draws from its own sourced numbers**. The reasoning is the same one the rest of this
pipeline runs on: a photograph of a stranger's mouth says nothing about *this* practice and cannot
be checked against anything, whereas a bar carrying a number the honesty gate forced to cite a
source is a claim the practice can stand behind. The chart figures mirror the ones on the Anaks
Labs marketing site's own research articles — same visual language, drawn instead from the
practice's own brand tokens.

## What the article page renders now

In order, all of it from the stored document — nothing here writes, rewrites or reorders a
character of it:

1. **Reading-progress bar.** 3px, in the practice's accent, at the top of the viewport.
2. **Kicker** — category chip · date · read time · `Published by <practice>`.
3. **Display title**, accent rule, **standfirst** (the stored summary).
4. **Reading column**: `h2` with a 38×3 accent rule above it, `h3`, paragraphs (the opening one
   larger), **checklists**, numbered lists, tables, **chart figures**, and one promoted sentence
   set in display type.
5. **Key-facts box** — the article's own question set, printed.
6. **Booking CTA**, pointing at a destination the practice already publishes.
7. **Related posts** — this site's latest three, never the current one.
8. The educational/medical notice, unchanged.

There is no `<img>` element anywhere in the blog output — index, article, or exported bundle — and
a test asserts it on all three.

### Three rendering rules worth knowing

**The key-facts box is a render of blocks, not a copy of them.** The generation schema
(`contracts.ts`) allows exactly five block types — heading, paragraph, list, table, chart — and has
no FAQ block. A question set therefore arrives as an ordinary run of `h3` ending in `?` followed by a
paragraph. `articleKeyFacts()` finds the longest such run (minimum two pairs), the box prints it,
and **the body skips those indices** so nothing appears twice. The same function feeds the
`FAQPage` JSON-LD, so what an assistant can quote and what a reader can see are the same strings
by construction. That is the whole point of the component: the machine-readable layer, made
visible to the person paying for it.

**The highlighted sentence is a promotion, not a pull quote.** There is no pull-quote block type
either. `articleHighlightIndex()` picks one existing paragraph — single sentence, 60–190
characters, past the first block, outside the question run, nearest 40% through the article — and
sets it in display type **in place**. It is printed exactly once. A conventional pull quote repeats
a sentence, and repeating a hedged clinical sentence ("options vary from person to person") as a
standalone display line is how a qualified statement becomes a claim. Selection is deterministic
from the document alone, because the hosted route and the static export must not disagree.

**The kicker says "Published by", not "Reviewed by the practice".** Approval in this product is an
operator action: every `/api/admin/content-queue/*` route is behind `requireAdminOr403`, and
`content_post_versions.created_by_type` is `'system' | 'admin'` with no customer value. The
practice does not review the article before it publishes, so the page does not say it does.

## Reading progress adds no JavaScript

The bar's width is `transform: scaleX(var(--scroll-progress, 0))`. That custom property is already
projected by the shared motion runtime onto any `[data-m-progress]` element
(`lib/motion/runtime.ts`), so the article carries that attribute and the bar inherits the value.
Consequences, all of them free:

- **No JS** → the property never leaves its `0` default → the bar is empty.
- **`prefers-reduced-motion`** → the runtime returns before it drives anything (`runtime.ts:843`)
  → the bar is empty.
- **Motion switched off for the site** → no runtime is injected and the bar is not rendered at all.

There is no second scroll listener anywhere on the page. A test asserts the component emits
exactly one `<script>` and that it is the shared runtime.

Note the shared runtime computes progress as `-top / max(1, height - viewportHeight)`. On an
article shorter than the viewport that ratio is degenerate and the bar snaps 0 → 1. Real articles
are longer; a three-block mock is not.

## The booking CTA never invents a destination

`booking-target.ts` returns, in order: an external HTTPS button the practice published → a `tel:`
button → a contact-shaped page → the phone number already on every page via
`resolvePublicContact`. In-page anchors (`#services`) are excluded outright, because they do not
resolve from `/blog/<slug>`. The label travels with the target — it is copy the practice already
approved on its own site. **When nothing qualifies, no button renders.** That is a supported
outcome, not a gap.

## The chart figure

A `chart` block is a set of measured claims, stored as numbers and drawn at render time. There is
no chart library, no runtime, and no animation — one inline `<svg>` per figure, painted from the
practice's palette.

### The block

```jsonc
{
  "type": "chart",
  "kind": "bars" | "compare" | "steps",
  "title": "What people ask about most before booking",
  "unit": "%",                       // optional; printed beside every number
  "items": [                         // 2–6, exactly 2 when kind is "compare"
    { "label": "Cost and payment options", "value": 42, "note": "…", "sourceRef": "…" }
  ],
  "caption": "…",                    // optional; printed on the source line
  "sourceRefs": ["business-fact:enquiries"]   // REQUIRED, at least one
}
```

- **`bars`** — horizontal bars on one zero-based scale, values printed. The reference shape.
- **`compare`** — exactly two labelled values set against each other at display size ("with a
  plan / without"), on one shared scale that the figure states.
- **`steps`** — an ordered sequence on a rail, each step carrying a duration or a count.

`value` is a finite non-negative **number**, never a string: a string would let the model write
"roughly half" into a slot a bar is drawn from, and a bar drawn from a hedge is a precision the
sentence never claimed. The hedge goes in `note`, which is printed as text beside the mark.

**At most two charts per article, and the ceiling is a contract, not a prompt.** The generator is
told to emit at most two; zod refuses a third. An article with five figures is a page of
decoration built out of the handful of facts the practice actually gave us.

### Three gates a figure has to clear

**Honesty — every value must cite a source in the snapshot.** `collectContentPostPublicText` walks
chart blocks and emits one entry per value with `alwaysRequiresSource`, exactly as it does for a
table cell. That flag is load-bearing: `MEASURABLE_NUMBER` and its English twin match a number
*and a unit* ("40 minutes", "$1,450"), because that is how a number appears inside a sentence — a
bar labelled `42` with the unit printed once in the figure header matches neither lexicon, so a
chart walked as prose would be asked for no source at all. A per-item `sourceRef` overrides the
figure's `sourceRefs` and is checked on its own, which is what lets one figure carry two bars
drawn from two different populations without letting them share one citation between them.

**`CONTENT_HONESTY_POLICY_VERSION` moved to `content-honesty-2026-09-v2` for this.** Versions
stamped with an older string are dropped by `public-integrity` and refused at approval — the
direction that fails safe. See `content-fulfillment-batch.md`.

**Medical — a charted outcome is blocked even when it is sourced.** Two new rule ids,
`medical-chart-outcome-measure` and `medical-chart-treatment-efficacy`, fire under a new `chart`
copy scope. `MEDICAL_AD_POLICY_VERSION` did **not** move: that stamp is pinned by `z.literal`
against every stored SiteConfig, and rule ids may be added inside an unchanged version.

The scope exists because a figure asserts differently from a sentence. Prose can hedge and stay
honest ("recovery times vary widely"); a bar labelled "recovery" with a number on it has had the
hedge removed by the act of drawing it. So the chart rules are stricter than anything that could
run over body copy without suppressing true statements — "Implant success rate by year" is blocked
as a figure and untouched as a sentence. Sourcing does not rescue it: a practice's own records can
substantiate "94% of our implant patients report full recovery" and it is still an efficacy claim
the FTC wants competent and reliable scientific evidence for. **Chart an operating fact** — cost,
duration, appointment availability, what a visit includes — and describe outcomes in prose that
keeps its qualifications.

**Redundancy — every figure is repeated in text.** Values are printed on the marks; the whole
figure is repeated as a visually-hidden data table; a source line sits underneath naming where the
numbers came from, resolved from the stored snapshot (a publisher with an `https` `sourceUrl`
becomes a link, an unresolvable id contributes nothing rather than printing a raw internal
identifier). A reader who cannot see the bars loses the shape and not one number.

### Two rendering details that are easy to get wrong again

**The SVG type sizes are user units, not screen pixels.** Each figure is one
`<svg viewBox="0 0 560 H">` at `width:100%`, so the browser scales the whole drawing by
`containerWidth / 560` — about 1.06 in the 68ch reading column and about 0.64 on a 390px phone. A
14px label would render at 9px on that phone. The mobile media query restates the same classes at
larger *user unit* values (21 instead of 14, and so on), which cancels the shrink: one SVG, one
geometry, ~15px labels on a desktop and ~13px on a phone. This is the one thing to re-check when
touching the figure CSS.

**The hidden data table is clipped by a wrapper, never by its own class.** A `<table>` treats
`width` as a *minimum* and grows to its own min-content, so the sr-only class worn by the table
itself left a 512px element hanging out of the document. On a phone that made Chrome widen the
layout viewport to 527px and render the entire article at 74% — nothing looked broken, every
measurement was simply wrong. The class now sits on an out-of-flow `<div>` whose `overflow:hidden`
clips the table, and a test asserts the table does not wear it.

### What the generator does with it

The tool schema carries the block and marks `sourceRefs` required — the only block in the union
where it is. The prompt says: emit a chart **only** when the source material already contains the
numbers it would draw, never invent/estimate/round/extrapolate a value, at most two per article.
On the demo site — whose survey answers contain no numbers at all — a real Opus 4.8 call correctly
emitted **no** chart. Given two numeric business facts in the catalog, the same call emitted a
`bars` figure with a per-item `sourceRef` on every value, and both gates accepted it on attempt 1.

The **mock generator emits one `bars` chart per post**, citing the first id in the catalog it was
handed rather than a hard-coded one, so mock mode exercises the whole gate instead of routing
around it. With no catalog it emits no chart — a figure citing nothing is worse than no figure.

## The cover pipeline is dormant, not deleted

`CONTENT_COVER_IMAGES_ENABLED` still exists and is still **off by default**; migration `0067`
still backs `content_post_versions.cover_asset_id`; `generateContentPostCover` still runs when the
flag and a key are both present, and a stored cover still resolves through
`projectPublishedContentPost` onto `PublishedContentPost.cover`.

Nothing public reads it. The hero, the index card image and `BlogPosting.image` are gone, and a
test publishes a post *with* a stored cover and asserts that neither surface nor the structured
data mentions it — advertising an image that appears nowhere on the page is exactly the hidden
structured data this product argues against. The flag and the storage path are the expensive half
and the decision they serve is a product one, so they are kept rather than ripped out.

What *was* deleted is `post-cover.ts`, the stock-photograph rotation that chose an index-card
cover from the practice's declared services, along with `collectRenderTimeAssets`, the export
collector whose only caller it was. Both existed solely to put a picture on this surface.

## Structured data

Two `application/ld+json` documents on an article page, on the hosted route and in the static
export alike:

- **`BlogPosting`** — no `image`, ever. The blog carries none, so there is nothing honest to
  advertise; a stored cover behind the dormant flag does not change that.
- **`FAQPage`** — emitted only when `articleKeyFacts()` finds a question run, i.e. only when the
  page also *prints* those questions. A question set a reader cannot see would be exactly the
  hidden structured data this product argues against.

It is a second script rather than a `@graph`, so every existing consumer branching on
`jsonLd['@type'] === 'BlogPosting'` is untouched. `buildDocumentShell` grew an `additionalJsonLd`
array so the exported bundle carries both.

## Tests

`src/lib/content-fulfillment/__tests__/blog-template.test.ts` — 25 tests, no network:

| Group | Covers |
|---|---|
| T1 | every block type renders; the stored document is printed verbatim and once; the kicker claims only what the pipeline supports |
| T2 | the key-facts box renders the question run, replaces it in the body, and matches the FAQPage markup |
| T3 | related posts exclude the current article and cap at three |
| T4 | no image on any blog surface — hero, index card, `BlogPosting.image` — even when a version stored a cover; the cover projection boundary still drops a mismatched or unsafe asset |
| T5 | progress rides the shared runtime, starts at zero, and disappears with the site's motion switch |
| T6 | the CTA reuses a real destination, refuses anchors, and renders nothing when there is none |
| T7 | the spend guard is closed by default and the prompt still refuses text, people and procedures |

`src/lib/content-fulfillment/__tests__/blog-charts.test.ts` — 37 tests, no network:

| Group | Covers |
|---|---|
| C1 | the three kinds parse; an uncited figure, a three-sided `compare`, a negative or non-finite value, a seventh item and a third chart are all refused |
| C2 | the walker reaches every value with `alwaysRequiresSource`; a sourced figure passes; an invented id, a bad per-item `sourceRef`, an empty `sourceRefs` and raw HTML all fail |
| C3 | both chart rule ids block at `chart` scope and leave the same words alone in `body`; `MEDICAL_AD_POLICY_VERSION` did not move; an operating fact stays chartable |
| C4 | all three kinds draw from brand tokens; `role="img"` + `<title>`/`<desc>`; every value printed and repeated in the hidden table; the source line; no image, no script, no animation; byte-identical across renders |
| C5 | the static export renders both figures, both hidden tables and no image |
| C6 | the tool schema carries the block, the prompt forbids inventing a number, the mock emits one sourced `bars` chart that clears both gates, and emits none when the catalog is empty |
| C7 | axis maxima, value formatting, the `<desc>` text, and source-line resolution including an `http` url that is named but not linked |

Fixtures drive real slots through `claim → generate → approve` on the mock repository, so a shape
the repository would reject cannot reach an assertion. `blog-design.test.ts` lost the four
cover-selection tests, the two exported-cover tests and the two month-rotation tests with
`post-cover.ts`; one new test replaces them, asserting no exported blog page references an image.

One pre-existing invariant in `blog-design.test.ts` was tightened rather than relaxed: it counted
the bare substring `data-m`, which the distinct `data-m-progress` hook also matches. It now counts
the quoted attribute `'data-m'` and additionally asserts that any `data-m-progress` sits on an
element already spreading `revealProps` — the runtime mutates both before hydration, so both need
the `suppressHydrationWarning` that spread supplies.
