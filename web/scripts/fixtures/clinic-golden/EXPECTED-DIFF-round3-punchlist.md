# Expected golden diff — `fix/round3-punchlist`

Written and committed BEFORE `dental-golden.json` is regenerated, per the arithmetic rule in
`src/lib/us-demo/dental-golden.test.ts`. Any golden movement **not** on this list is a stop —
including one that could be explained afterwards. A stated mover that does not move is equally a
stop.

Every number below was produced by compiling the fixture through `prepareUsMedicalPreview` (the
real issuance entry point) and enumerating **every** differing JSON path against the committed
golden — not the first difference, all of them.

Baseline on `main` (bd76372): **2500 tests, 2500 pass, 0 fail.**
With the code change and the golden not yet regenerated: **2500 tests, 2494 pass, 6 fail** — the 6
failures are exactly the 6 golden entries below and nothing else.
(Three other recorded contracts moved and were updated in the same commit as the code that moved
them, so they are not in that count: `clinic-route.test.ts` and the shared-image-gate test, whose
header assertion is inverted by item 5; `us-published-actions.test.ts`, whose whole-document
sha256 moves with the new CSS; `non-dental-corpus.test.ts`, whose recorded DEFECT is half closed
by item 2; and `clinic-multipage.test.ts`, whose verbatim-source invariant gains the one bounded
exception item 6 requires. Each is explained at its own site.)

---

## Permitted movement

| entry | differing paths | what moved |
|---|---:|---|
| cameods outreach-safe | 121 | 2 navLabel + 2 nav JSON-LD names + 1 services section (5 card bodies dropped) |
| cameods preview-full | 121 | identical to its outreach-safe entry |
| dental360 outreach-safe | 62 | 2 navLabel + 2 nav JSON-LD names + 1 services section (1 card body shortened) |
| dental360 preview-full | 62 | identical to its outreach-safe entry |
| iddental outreach-safe | 14 | 7 navLabel + 7 nav JSON-LD names. No card movement at all. |
| iddental preview-full | 14 | identical to its outreach-safe entry |

Sections touched, in the whole golden: **`cameods p0/s2`** and **`dental360 p0/s1`** — both the
`us-demo-services` grid on the home page — and nothing else. iddental touches no section.

Verified unchanged, byte for byte, in all six entries: `deliverable`, `deliveryBlockers`,
`sourceReport` (totalBlocks / usedBlocks / excludedBlocks), every page `title`, every page `slug`,
every page `id`, every `meta.*`, every `theme.*` (palette, fonts, tokens), every element `src` and
`alt`, and every JSON-LD node except `SiteNavigationElement.name`.

---

## Change 1 — nav display labels (punchlist item 2)

`resolveClinicNavLabels` in `full-preview.ts` derives the label the header prints for a treatment
page whose category holds more than one page. A single-page category keeps the category label it
already ships and does not enter the rule at all.

`page.title` is not touched. It remains the `<title>`, the H1 and the `WebPage`/`MedicalProcedure`
name. The only JSON-LD that moves is `SiteNavigationElement.name`, which is a list of nav labels —
`jsonld.ts:520` reads `page.navLabel ?? page.title` — so it follows the bar by definition. Each
navLabel change therefore appears exactly twice per entry: once in `config`, once in that node.

**cameods — 2 pages (2 config + 2 JSON-LD paths)**

```
p2 navLabel: "Dental Implants"          -> "Implants"                    (slug dental-implants)
p5 navLabel: "SCALING AND ROOT PLANING" -> "Scaling and Root Planing"    (slug regenerative-procedures)
```

**dental360 — 2 pages (2 config + 2 JSON-LD paths)**

```
p3 navLabel: "Dental Implants" -> "Restorative Dentistry"   (slug restorative-dentistry)
p4 navLabel: "Dental Implants" -> "Implants"                (slug services)
```

**iddental — 7 pages (7 config + 7 JSON-LD paths)**

```
p1 "All-on-4 Dental Implants in Los Angeles" -> "All-on-4 Dental Implants"
p2 "All-on-6 Dental Implants in Los Angeles" -> "All-on-6 Dental Implants"
p5 "Implant Placement"                       -> "Single Tooth"
p6 "Metal & Ceramic Braces in Koreatown"     -> "Braces"
p7 "Invisalign in Los Angeles"               -> "Invisalign"
p8 "Cosmetic Dentistry in Los Angeles"       -> "Cosmetic Dentistry"
p9 "Porcelain Veneers in Los Angeles"        -> "Porcelain Veneers"
```

Two of these are worth naming because they are the rule working, not the rule guessing.
`in Koreatown` is **not** stripped — the practice never prints Koreatown in an address and no other
page repeats that tail, so there is no evidence it is a place; the label falls to the page's own
slug instead. `Implant Placement` on `single-tooth` moves only because the `full-mouth` page
already took that exact string; nothing about the page changed.

Known residue, stated rather than hidden: cameods keeps two nav entries that differ only by the
case of one word — `"Scaling and Root Planing"` (slug `regenerative-procedures`) and
`"Scaling And Root Planing"` (slug `scaling-and-root-planing`). They are two source pages about the
same treatment. The ladder exhausts every honest candidate — the page's title, its slug, its
category label are all taken — and the last rung keeps the untouched title so no page silently
loses its nav entry. Merging two source pages of one treatment is a compiler question, not a
labelling one.

## Change 2 — treatment-card body band (punchlist item 6)

`clinicCardBody` in `full-preview.ts` gives the home services grid and the merged-child grid a body
band: a keyword run with no sentence in it is not body copy and is dropped; a body over 320
characters is cut to whole sentences at the boundary nearest 320 and never past 400; a body with no
sentence boundary at all is dropped rather than cut mid-claim; a stub stays a stub.

It runs inside `compileUsMedicalDemo`, which `prepareUsMedicalPreview` calls **before**
`enforceGeneratedMedicalConfig` — so nothing ships unscreened and nothing is cut after screening.

**dental360 `p0/s1` — one body shortened, 62 paths**

```
elements[8].text : 427 chars -> 293 chars   (cut at the sentence ending "...injury or wear.")
section height   : 1527 -> 1435
+ 56 sectionLayout geometry paths (that one frame's h, and the y of what follows it, on all
  three bands) + 2 navLabel + 2 JSON-LD
```

Card bodies on this fixture before -> after: `[240, 202, 427, 107, 156, 165, 136]` ->
`[240, 202, 293, 107, 156, 165, 136]`. Six of seven untouched.

**cameods `p0/s2` — five bodies dropped, 121 paths**

```
elements       : LENGTH 29 -> 24
section height : 3643 -> 1565
sectionLayout.items[1..5].elementIds : LENGTH 3 -> 2
+ 115 sectionLayout geometry paths (the five removed frames and fontSizes, and the y of every
  item after them, on all three bands) + 2 navLabel + 2 JSON-LD
```

Card bodies before -> after: `[485, 812, 1112, 1114, 1114, 1125, 0, 738, 0, 623]` ->
`[344, 0, 0, 0, 0, 0, 0, 227, 0, 285]`.

The five that go to zero are all the same shape — a printed service menu, verbatim from the source
and correctly typed `service_detail`, with no sentence anywhere in it:

```
"Bone Grafting Canine Exposure And Bonding Pre-Prosthetic Surgery Facial Trauma Oral Pathol…"
"LANAP® Periodontal Treatment Dental Implants Endodontic Procedures Cracked Teeth Internal …"
"Periodontal (Gum) Disease LANAP® Periodontal Treatment Dental Implants Endodontic Procedur…"
"Periodontal Maintenance Periodontal (Gum) Disease LANAP® Periodontal Treatment Dental Impl…"
"Scaling and Root Planing Regenerative Procedures Periodontal Maintenance Periodontal (Gum)…"
```

Those five cards keep their heading and their link. `sourceReport.usedBlocks` does **not** move,
because each of those blocks is still cited by the treatment page it belongs to.

**iddental — no card movement.** Its bodies are 125–252 characters and already read as cards, which
is the evidence that 320 is a band around what the corpus already does rather than a new house
style imposed on it.

---

## What is NOT in the golden, stated so its absence is not read as "nothing happened"

Punchlist items 1, 3, 4 and 5 are renderer changes and move no compiled bytes:

- **item 1** (gallery crop) — CSS in `ClinicFlowSection`; new gate `clinic-gallery-crop.test.ts`.
- **item 3** (mobile hero band) — CSS in `ClinicHeroLayout`, inside its existing 900px breakpoint.
- **item 4** (licensed-imagery caption) — the disclosure element is still compiled into the hero
  exactly as before, byte for byte; only where the renderer puts it changed.
- **item 5** (header wordmark) — the brand-logo element is still compiled, still selected by the
  same rule, still in `assetRefs`; only the header stopped drawing it.

Their evidence is a real issued preview measured in a browser, recorded in the branch report, plus
the new suite tests named above.
