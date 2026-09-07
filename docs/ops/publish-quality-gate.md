# The publish quality gate, and why the compiler owns every fix

A customer-approved page has to be publishable. Until this change none of them were: every US
clinic demo in the fixture corpus was refused by `checkPublish` — **22 blockers** on a delivered
iddental or cameods page, in both render modes, **19** on dental360, **2** on the seeded Summit
Dental site. The operator route inherited the refusal correctly (`409 PUBLISH_QUALITY_BLOCKED`),
which is the right behaviour and the wrong outcome: an approved page nobody can publish.

## What the gate checks, and where each rule lives

`publishSiteWithAudits` (`web/src/lib/publish/publish-site-service.ts`) composes the quality step
in exactly one shape, and anything that wants the same answer must use the same one:

```ts
const scan = preflightScan(config, { tier, siteUrl, … });          // renders every page
checkPublish(config, tier, { scan: {…}, artifact: scan.publishAudit });
```

Both halves matter. `checkPublish` alone sees only the config-level rules; the link, layout and
static-document rules arrive through `artifact`, produced by `auditPublishArtifacts`
(`web/src/lib/publish/artifact-audit.ts`) from the rendered HTML of every page. A bare
`checkPublish(config, tier)` will report a clean page that publish then refuses.

Two rules produced every blocker in this corpus:

| Rule | Where | What it asks |
| --- | --- | --- |
| `broken_internal_link` | `artifact-audit.ts` `auditLinks` | For `href="#id"`, does a section with that id exist **on the page carrying the button**? Hashes resolve against `visibleSections(page)`, never site-wide. |
| `[Q1]` scrim AA | `preflight.ts`, via `scrimPassesAA` (`lib/design/scrim.ts`) | If a section background image has an `overlayColor`, does every text element clear 4.5:1 against the worst background the overlay could be hiding? Opacity defaults to `?? 0.45` when the config omits it. |

`IMAGE_SCRIM_AA_TARGET` (5.2) is **not** this floor. It is the authoring target inside
`resolveAdaptiveImageScrim`, which these paths never call. The gate's floor is AA, 4.5.

## Why the compiler owns the fix

The gate is the product we sell — a diagnostic that tells a clinic what is wrong with their site.
Relaxing it to let our own output through would be selling a ruler we bend for ourselves. So no
threshold moved, no rule was skipped, and `preflight.ts` / `artifact-audit.ts` are untouched by
this change. Every fix is at the emission site.

**Both defects turned out to be the config lying about the page** — in opposite directions.

### 1. A button that went nowhere (10 blockers per practice)

Every treatment page's "Book Appointment" pointed at `#clinic-sticky-booking`. That is not a
section id and never was: the sticky bar is an `<aside data-clinic-sticky-booking="1">` with no
`id` at all (`ClinicStickyBooking.tsx`), and on a preview it renders deactivated behind "Booking
activates when you connect your system." The button did nothing in a browser. These were **true
positives** — the gate found a real dead link.

It now points at `/contact`. Two more direct destinations are ruled out by contracts this compiler
does not get to overrule:

- **the crawled booking URL** — booking is not ours to activate until the operator connects the
  practice's system. `clinic-multipage.test.ts` pins that the crawled `us_booking` URL appears as
  no `href` anywhere in a rendered preview.
- **`tel:`** — the P3 rule (`p3-preview.test.ts`) requires every button this compiler emits to be
  an internal destination, `/` or `#` only. The phone belongs to the sticky bar, which reaches it
  through the verified source projection rather than a config button.

When a practice publishes no contact page there is nothing honest to link to, and no CTA section
is emitted at all. A missing card beats a dead button.

The same rule now covers the home CTA, which pointed at `#clinic-home-faq` whether or not the FAQ
section existed. dental360 is a practice that publishes no FAQ, and its home page was shipping
exactly that dead anchor.

### 2. A scrim that was never painted (12 blockers per practice)

The `Introduction` heroes were scored against a wash that does not exist. `buildClinicHeroSection`
emitted `overlayColor` (= `palette.background`, `#FFFFFF`) on every hero, and deliberately omitted
`overlayOpacity` when the hero carries a `clinicHeroLayout`. The gate fires its scrim rule on
`if (img.overlayColor)`, assumed `overlayOpacity ?? 0.45`, measured **3.92 against a 4.5 floor**,
and refused the page — while `ClinicHeroLayout` emits no overlay element at all and puts the copy
on an opaque `[data-clinic-hero-plate]`.

The fix is to stop emitting `overlayColor` on that path, so the config stops describing a scrim
the renderer does not draw. **Zero rendered pixels change** — measured: the rendered HTML of the
delivered iddental home page is byte-identical before and after.

What was deliberately *not* done: inventing a measured opacity here. Computing a "correct" scrim
would have painted a wash the design does not have, to satisfy a rule about a wash that was not
there. `overlayOpacity` stays `undefined` on this path (pinned by `clinic-hero-layout.test.ts`).

### 3. The one scrim that is real

iddental's `invisalign` page is the corpus's only stock hero: `applyDentalStockToClinicMaster`
replaces the image and paints an overlay for real. Its hero copy included accent-coloured text
(`#4253FF`) that did not clear AA on that overlay. `enforceClinicStockHeroContrast` — the helper
new-build already ran a step later, now shared and applied where the scrim is painted — moves
failing text to the ink token and, only if that still fails, raises the opacity to
`minOverlayOpacityForAA`. No margin constant: the helper already ceils to two decimals.

New-build output does not move. The helper is idempotent, so new-build's own whole-config pass
finds nothing left to change.

### 4. The seeded Summit Dental site

Its hero scrim was authored at `0.62` where the gate's own arithmetic asks for `0.66`
(`#dfe8f0` on `#0d1c2c`, 3.94 against 4.5). A seed defect, fixed in the seed — not in the gate,
and not in `site-templates.ts`, which is shared with non-US customers.

## The re-issue rule

**Nothing recompiles an approved preview.** A shared preview stores the whole `SiteConfig`, and
delivery persists `preview.siteConfig` verbatim. That is the point: the customer approved specific
bytes, and quietly re-running the compiler under an operator would hand them a page they never
said yes to.

The consequence is unavoidable and is now stated rather than discovered:

- a preview issued **after** this change compiles with the fix, so approved == deliverable;
- a preview issued **before** it keeps its bytes, keeps its blockers, and **cannot be published
  until it is re-issued**.

So the console gets a **pre-publish readout** instead of a surprise 409.
`GET /api/admin/clients/[id]/sites/[siteId]/publish-gate` recomputes the verdict from the stored
draft through the same `preflightScan` → `checkPublish` composition, and the delivery panel renders
the blockers with their page and section before the operator ticks a single checkbox. When the
stored config still carries a fingerprint of a defect the compiler no longer emits — a hero with
both `clinicHeroLayout` and `overlayColor`, or a `#fragment` that resolves nowhere on its page —
and the site actually came from a preview, the panel says:

> This preview predates the publish fix; re-issue to publish.

The readout is read-only: it diagnoses, it never repairs, and it never writes. No migration.

## Adding a rule, or debugging a refusal

- Reproduce through the real path. `checkPublish(config, tier)` on its own is not the gate.
- Recompute contrast with `scrimPassesAA` / `minOverlayOpacityForAA`, not by eye:
  `PublishPreflight.blockers` is prose, and only `PublishArtifactBlocker` carries
  `code` / `pageSlug` / `sectionId`.
- Ask whether the config is describing something the renderer actually draws. Twice here it was
  not, and in both cases the honest fix was to stop emitting the claim rather than to satisfy it.

### Known remaining divergence (not a blocker)

On the en-US flow-hero path the config's `overlayOpacity` (`0.78`, or `0.82` for a stock hero) is
not what the browser paints, and the gate's model is a flat overlay while the renderer's is a
gradient. `ClinicFlowSection` turns that number into `--clinic-hero-overlay-opacity` only under
`ko-KR`; on en-US `[data-clinic-flow-hero-media]::after` uses its CSS default and runs
`rgba(255,255,255,.94)` at the left edge → `.72` at 48% → `.12` at the right. So on the left band
where the copy sits the real wash is *heavier* than the 0.82 the gate assumes, and out at the right
it is far lighter. After this change exactly one page in the corpus still takes that path —
iddental's `invisalign` stock hero — and its copy is left-aligned inside the heavier band.

Left alone deliberately: that number is the byte-stable legacy contract shared with the ko-KR
import, so moving it moves Korean output for no gain here. Worth a separate ticket if the flow
hero ever carries right-aligned or full-width copy, because the gate would not catch it.
