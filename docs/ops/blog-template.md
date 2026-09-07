# The tenant blog article template, and the cover slot

The article page a clinic's readers land on from a search result. Before this change it was six
elements on white — back-link, title, a rule, summary, date, body paragraphs at one size — with no
image, no category, no structural furniture, and roughly 60% of the first viewport empty. It is
the surface that carries eight articles a month, so it is the surface the retainer is judged on.

Two things landed together: the template, and **`content_post_versions.cover_asset_id`**, a column
migration `0049` shipped and which nothing had ever written.

## What the article page renders now

In order, all of it from the stored document — nothing here writes, rewrites or reorders a
character of it:

1. **Reading-progress bar.** 3px, in the practice's accent, at the top of the viewport.
2. **Cover hero**, 21:9 — the stored image when the version has one, a tokenised brand plate when
   it does not.
3. **Kicker** — category chip · date · read time · `Published by <practice>`.
4. **Display title**, accent rule, **standfirst** (the stored summary).
5. **Reading column**: `h2` with a 38×3 accent rule above it, `h3`, paragraphs (the opening one
   larger), **checklists**, numbered lists, tables, and one promoted sentence set in display type.
6. **Key-facts box** — the article's own question set, printed.
7. **Booking CTA**, pointing at a destination the practice already publishes.
8. **Related posts** — this site's latest three, never the current one.
9. The educational/medical notice, unchanged.

### Three rendering rules worth knowing

**The key-facts box is a render of blocks, not a copy of them.** The generation schema
(`contracts.ts`) allows exactly four block types — heading, paragraph, list, table — and has no
FAQ block. A question set therefore arrives as an ordinary run of `h3` ending in `?` followed by a
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

## The cover slot, end to end

### Why it was never wired

`0049` created `cover_asset_id` and then made it unwritable. The only writer of
`content_post_versions` is the `store_content_post_generated` RPC, whose parameter list did not
carry the column, and the `content_post_versions_append_only` trigger (`0049:179`) blocks any
follow-up `UPDATE`. No code path could fill it.

### The path now

```
generateVersionForItem            one attempt, after the article clears its gates
  └─ generateContentPostCover     cover-image.ts — flag + key + not-mock, else declines
       ├─ contentCoverPrompt      brand palette, abstract, no text, no people, no procedures
       ├─ generateGeminiImage     21:9, gemini-2.5-flash-image
       └─ uploadAiAssetDetailed   Storage + ai_generated asset_records row
  └─ storeGenerated → RPC p_cover_asset_id
                              ↓
content_post_versions.cover_asset_id
                              ↓
repository.ts   selects the column, then one in(...) read of asset_records
projectPublishedContentPost     validates, drops anything it cannot vouch for
                              ↓
PublishedContentPost.cover  →  article hero · index card · BlogPosting image · admin queue
```

### Cost guard

| Guard | Value |
|---|---|
| Kill switch | `CONTENT_COVER_IMAGES_ENABLED` — **default off**, only the literal `1` opens it |
| Rate | **one image per stored version**, no retry |
| Mock mode | declines before any network call |
| No key | declines |
| List price | ~$0.039 per image (Nano Banana) — an eight-post month is ~$0.31 per site |

A failed generation costs the picture, never the article: the template paints its tokenised plate,
which is a finished state rather than a degraded one.

The flag is read in `cover-image.ts` rather than added to `lib/env.ts`, which `CLAUDE.md` assigns
to the architect. Behaviour is identical; the switch simply lives beside the only feature that
reads it.

### Deployment ordering — read this before turning the flag on

**Migration `0067` must be applied first.** It drops the 12-parameter
`store_content_post_generated` and recreates it with `p_cover_asset_id uuid default null`, then
re-grants to `service_role`. (A defaulted 13th parameter alongside the old 12-parameter function
would make every existing 12-argument call ambiguous, so replace-in-place is not available.) The
new function also verifies the asset is an `ai_generated` image **owned by the same client** — the
foreign key alone would accept another tenant's picture, and a cover is a public surface on the
customer's own domain.

The client only sends `p_cover_asset_id` when a cover actually exists. So with the flag off — the
default — the RPC payload is byte-identical to the pre-cover call and an unmigrated database keeps
working. Turning the flag on without `0067` fails loudly on the RPC rather than silently
discarding an image the run has already paid for.

### What a generated cover may depict

Nothing. `post-cover.ts` states the rule this inherits: a cover may not depict a service the clinic
has not declared, because an implant photo on a practice that does not place implants is a false
claim made in pictures. A *generated* image cannot be checked against a declaration at all, so the
only safe subject is no subject — colour, light and geometry from the practice's own brand tokens.
The prompt refuses, in its own text, people, faces, hands, teeth, instruments, clinical rooms,
logos and lettering, and asks for a non-representational plate. A test asserts those refusals are
still present.

Nothing reads the article's title, summary, tags or body — same rule `post-cover.ts` enforces, and
it also stops a site's covers converging on whatever that month's topics happened to be.

## Structured data

Two `application/ld+json` documents on an article page, on the hosted route and in the static
export alike:

- **`BlogPosting`** — unchanged, plus `image` when the version stored a cover.
- **`FAQPage`** — emitted only when `articleKeyFacts()` finds a question run, i.e. only when the
  page also *prints* those questions. A question set a reader cannot see would be exactly the
  hidden structured data this product argues against.

It is a second script rather than a `@graph`, so every existing consumer branching on
`jsonLd['@type'] === 'BlogPosting'` is untouched. `buildDocumentShell` grew an `additionalJsonLd`
array so the exported bundle carries both.

## Tests

`src/lib/content-fulfillment/__tests__/blog-template.test.ts` — 26 tests, no network:

| Group | Covers |
|---|---|
| T1 | every block type renders; the stored document is printed verbatim and once; the kicker claims only what the pipeline supports |
| T2 | the key-facts box renders the question run, replaces it in the body, and matches the FAQPage markup |
| T3 | related posts exclude the current article and cap at three |
| T4 | cover fallback when null, cover rendered with its raster size when present, JSON-LD image, and a mismatched or unsafe asset dropped |
| T5 | progress rides the shared runtime, starts at zero, and disappears with the site's motion switch |
| T6 | the CTA reuses a real destination, refuses anchors, and renders nothing when there is none |
| T7 | the spend guard is closed by default and the prompt still refuses text, people and procedures |

Fixtures drive real slots through `claim → generate → approve` on the mock repository, so a shape
the repository would reject cannot reach an assertion.

One pre-existing invariant in `blog-design.test.ts` was tightened rather than relaxed: it counted
the bare substring `data-m`, which the distinct `data-m-progress` hook also matches. It now counts
the quoted attribute `'data-m'` and additionally asserts that any `data-m-progress` sits on an
element already spreading `revealProps` — the runtime mutates both before hydration, so both need
the `suppressHydrationWarning` that spread supplies.
