# Expected golden diff — `fix/brentwood-presend`

Written and committed BEFORE `dental-golden.json` is regenerated, per the arithmetic rule in
`src/lib/us-demo/dental-golden.test.ts`. Any golden movement **not** on this list is a stop —
including one that could be explained afterwards. A stated mover that does not move is equally a
stop.

Measured on the real issuance path (`prepareUsMedicalPreview`), not a harness: every number below
came from compiling the fixture and diffing against the committed golden, and from an
element-by-element capture of all seven committed corpora plus the Brentwood artifact, both render
modes.

Baseline before this branch: **2642 tests, 2642 pass, 0 fail.**
With the code change, the three new/retargeted consumers, and the golden not yet regenerated:
**2715 tests, 2711 pass, 4 fail** — the 4 golden entries below and nothing else.

---

## Permitted movement

| entry | movement |
|---|---|
| cameods outreach-safe | **none — byte-identical, same sha256** |
| cameods preview-full | **none — byte-identical, same sha256** |
| dental360 outreach-safe | `pages[4].sections[1].elements` 19 → 18 (the `Opening Hours` footer label); `sourceReport` totalBlocks 111 → 110, usedBlocks 108 → 107 |
| dental360 preview-full | the same two |
| iddental outreach-safe | **config byte-identical**; `sourceReport` totalBlocks 577 → 565 only |
| iddental preview-full | the same one |

cameods moving by zero bytes is not incidental. It publishes no footer-column heading that reaches
a block, has no `provider_bio`, no association mark and no trailing chrome in any prose block — so
it exercises none of the three changes, and its silence is the evidence that each change is scoped
to what it claims.

iddental is the second control, and a sharper one: twelve blocks leave its extraction and **not one
byte of its compiled config moves**, because all twelve are footer chrome that never placed. The
counter moves; the page does not.

Verified **unchanged on all four moving entries** (asserted field by field, not eyeballed):
`deliverable`, `deliveryBlockers`, every `jsonLd` node, the whole `theme` object, the whole `meta`
object, the page slug list, the section id list of every page, and every `surfaceTone`. On iddental
every text and image element is identical in content and order; on dental360 exactly one text
element is absent and nothing else differs.

---

## Change 1 — the provider slot shows the doctor, or nothing

**Root cause, two independent faults.**

`ClinicMasterExperience`'s `outreach-safe` variant carried no `providerPhotos` field at all
(`src/lib/clinic-master/live-contract.ts:50`), `outreachSafeExperienceFromArtifact` built none
(`src/lib/us-demo/full-preview.ts:2119`), and `providerLayoutImage` guarded only `preview-full`
against substituting a placeholder (`src/lib/clinic-master/compiler.ts:104`). So **every**
outreach-safe compile with a provider bio rendered `/clinic/provider-placeholder.svg` — 11 slots
across 4 of the 8 corpora — with `DEMO_DISCLOSURES.providerImageAlt` as its alt text: *"Portrait
placeholder — replace with the doctor's approved photo"*, an instruction to our operator, announced
by a screen reader to the prospect.

Second, and the one the packet asked about: the candidate set was `image.page.url === bio.sourceUrl`
— **crawl-page membership**. Brentwood's only `provider_bio` is `structured.description` on
`/about/`, whose single eligible image is `13575800_1327592913934828_482243595075617930_o.webp`, a
Facebook asset id with empty alt that `sourceImageIsProvider` accepts because the PAGE title says
"Dentist". `Dr.-Neda-Naim.jpg` (on `/`) and `Dr.-Neda-Naim-1.jpg` (on `/meet-our-doctor/`) were
never candidates. **Not** a token mismatch — both match every provider predicate. **Not** the
dimension gate — both clear `clinicPhotoGate`. **Not** a reservation — nothing held them. They were
simply on other pages, and `/meet-our-doctor/` is not a `PROVIDER_PATH_RE` match, so no bio is
extracted there either.

**Fix.** `providerPhotoProjections` (`full-preview.ts:1236`) is now shared by both prospect-facing
modes, and its ladder is ordered by strength of evidence: (1) a filename person-portrait on the
bio's own page, (2) a filename person-portrait anywhere on the site — the D1 predicate
`heroImageIsProviderPortrait`, measured at 16 of 113 with zero false positives, (3) the page-scoped
`sourceImageIsProvider`, (4) any eligible image on the page. Candidates are *claimed* rather than
indexed, so no face is shown twice. The photo is reserved in both modes
(`full-preview.ts:1518`). Where nothing qualifies, both modes omit the image; `demo` and `live`
keep the frame, and its alt is now `'Doctor portrait coming soon'`.

Effect, per corpus (both modes unless noted):

| fixture | before | after |
|---|---|---|
| cameods, dental360, enamel, iddental | no provider bio — no slot either way | unchanged |
| apa | 5 placeholder slots (outreach-safe); 2 wrong photos (preview-full) | 5 published headshots: `Meet-Dr.-Apa-Lower-Image-1.jpg`, `Dr.Tarek_-2.png`, `Doctor-website-template-IG-2.jpg`, `Dr.-Nick-Headshot.png` |
| larkfield-derm | 2 placeholders (outreach-safe); correct photo already (preview-full) | `dr-priya-raman.jpg`, both modes |
| northbank-ortho | 2 placeholders (outreach-safe); correct photo already (preview-full) | `dr-alina-reyes.jpg`, both modes |
| **brentwood** | 2 placeholders (outreach-safe); the Facebook webp (preview-full) | **`Dr.-Neda-Naim.jpg`, both modes, home and about** |

Reserving the portrait displaces one image through each ordered pool that used to contain it —
larkfield-derm and northbank-ortho each show a single-step cascade, and apa a five-step one. Every
filename involved is present before and after except two: apa's `apa-aesthetic-andi-jean-miro.png`
and `LA_Charlie-v2.png`, the two wrong picks, which were only ever reachable through the provider
slot and match no topic pool. **Zero golden movement** — no dental fixture has a provider bio.

## Change 2 — an initialism wearing a file extension is still an initialism

`ACRONYM_ALT_RE` (`src/lib/us-demo/source-images.ts:64`) is anchored and upper-case-only by design.
Brentwood's CSU Northridge crest arrives as `CSUNS.svg-1.png` with alt `"CSUNS.svg"`, and the four
residue characters defeat the rule twice: they add lower case and they push the string past the
six-character ceiling. `sourceImageIsAssociationMark` now strips a trailing image extension from a
closed list before the acronym test (`source-images.ts:78`).

Measured across **all 709 projected images** of the seven corpora plus Brentwood, the strip rejects
**exactly one**: `CSUNS.svg-1.png`. Per corpus — apa 0/338, cameods 0/36, dental360 0/31, enamel
0/22, iddental 0/46, larkfield-derm 0/23, northbank-ortho 0/22, brentwood 1/191.

On the vocabulary question: `university` and `crest` were both measured against all eight corpora
and **neither matches a single image**, including the CSUNS tile itself — its url and alt contain
neither word, so the vocabulary was never the route to this fix. `seal` was already present and
also matches nothing. `university` is added anyway, as the completion of an existing enumeration of
issuing bodies that already held `college`, `institute`, `academy` and `society`; it loses zero real
photographs because it matches zero images at all. `crest` is **not** added — it names a device
rather than a body, and `seal` already occupies that register.

**Zero golden movement**: no dental fixture publishes an extension-bearing alt.

## Change 3 — body copy stops at the practice's last sentence

Two shapes, one root cause: the crawl keeps no HTML, so a footer column heading and a section
heading arrive identically — an entry in `page.headings` with a run of page text under it.

**3a, the pair.** `sourceHeadingBodyPairs` already discarded `GENERIC_HEADING_RE` headings ("Home",
"About", "Services", "Contact", "Menu"). "Meet Us" and "Hours" are the same class and were missing.
`sourceHeadingIsChromeSectionLabel` (`src/lib/us-demo/source-noise.ts:112`) adds the labels that
only ever head a link list; `Location`, `Address` and `Resources` were measured and deliberately
left out. The filter drops the label as a PAIR and **not** as a BOUNDARY
(`source-extraction.ts:302`) — `allHeadingStarts` is still computed from the unfiltered list,
because removing the label from that set would extend the preceding body straight through the
chrome it used to stop at, making the contamination worse.

**3b, the tail.** `sourceProseWithoutTrailingChrome` (`source-noise.ts:192`) cuts a prose block at
the last real sentence boundary before either a schedule row (weekday + separator + clock/closed —
all three required) or a trailing keyword run, and drops the block when nothing but chrome is left.
It is applied in `pageBlocks`'s `add()` to the six prose kinds only
(`source-extraction.ts:436`, `:479`) — titles and labels are excluded because they have a menu's
shape by nature. Extraction is upstream of the whole compile, so this runs before the medical-ad
screen by construction: blocks → `compileUsMedicalDemo` → `enforceGeneratedMedicalConfig` in
`prepareUsMedicalPreview`.

Rejected, with the evidence: a general "Title Case run looks like a menu" rule over the whole block.
Built, measured against all eight corpora, and rejected — it fired on 40+ of the practices' own
headings ("What to Expect at Your Appointment", "The Real Risk of Veneers Isn't the Procedure
Itself"). Requiring a completed sentence in front of the run separates them. The first version of
the narrowed rule still ate three apa provider biographies whose final sentence the crawl had
truncated with an ellipsis ("He is board-certified by the American Board of Oral Implantology…");
the ellipsis is now sentence punctuation, which is the whole reason the rule is safe.

Block census, per corpus (`prospectPublicSourceBlocks`):

| fixture | blocks | gone | what left |
|---|---|---|---|
| cameods | 192 → 192 | 0 | — |
| larkfield-derm | 66 → 66 | 0 | — |
| apa | 211 → 211 | 2 trimmed | ` LEARN ABOUT THE SMILE MAKEOVER PROCESS`, ` \| What Is the Difference Between Bonding and Veneers` |
| enamel | 178 → 178 | 1 trimmed | ` Serving Central Austin & the 38th St corridor` |
| northbank-ortho | 69 → 69 | 2 trimmed | the footer clinic-name-and-address run, twice |
| dental360 | 111 → 110 | 1 | the `Opening Hours` label ×1 |
| iddental | 577 → 565 | 12 | `Find Us` ×3 and `Privacy Policy` / `Terms of Use` / `Accessibility` ×3 |
| **brentwood** | 559 → 443 | 122 | `Meet Us` ×29, `Hours` ×29, `Meet Our Doctor Meet Our Team Office Tour Testimonials` ×27, `Monday: 8am – 5pm Tuesday: 8am – 5pm` ×27, the 4 contaminated insurance blocks, + 6 sidebar-menu tails trimmed |

**Eleven trims in total across all eight corpora, and every one is chrome**: two CTA lines, one
footer tagline, two footer address runs, six sidebar service menus ending "Get in Touch with Us".
No sentence the practice wrote is shortened.

The weekday probe the cure had to survive is in `outreach-presend.test.ts` and passes: "We are
closed on Sunday.", "Our hygienist sees new patients every Monday and Thursday.", "Appointments run
Monday through Friday at both locations." and "We open Monday 8am for emergencies." are all kept
whole. Only weekday + separator + clock is a schedule.

---

## Test consumers updated, with rationale in the file

- `us-demo/clinic-multipage.test.ts` — asserted the placeholder is present on outreach-safe.
  **Inverted and merged** with the two disclosure assertions beside it: all three demo disclosures
  must now be absent from BOTH modes, which is a strictly stronger claim.
- `us-demo/source-compiler.test.ts` — asserted the provider slot carries an image whose alt matches
  `/placeholder/i`, and that the rendered HTML contains `<img … Portrait placeholder`. Both
  **inverted**: the fixture publishes no portrait, so the slot must be imageless and the HTML must
  contain no placeholder at all. The `Meet the Doctor` heading and the bio remain asserted.

## Tests added

- `us-demo/outreach-presend.test.ts` (73 cases) — all seven corpora × both render modes: no
  placeholder reaches a prospect, and a published portrait fills the slot on the three corpora that
  have one, with no face shown twice per page. Plus 10 acronym-alt probes (including the guards the
  rule already had: `"10"`, `"10.png"`, `"TVs In Treatment Room"`, an empty alt), a per-corpus proof
  that the extension strip rejects nothing but initialisms, 18 chrome-label probes, the 10 trimmer
  probes including the four weekday-survival cases and the truncated-ellipsis biography, a
  per-corpus assertion that no prose block still carries a schedule row, and the boundary contract
  (iddental's `Find Us` must not be swallowed by the heading before it).

## Deliberately NOT in this branch

- **`crest` in the association vocabulary.** Measured at zero matches on all eight corpora; `seal`
  already covers the register. Adding it would be unfalsifiable on the evidence we have.
- **A general Title-Case menu rule.** Measured and rejected; the numbers are in Change 3.
- **The About-page hero on outreach-safe.** It reads `experience.providerPhotos`, so it now
  receives the portrait as a consequence of Change 1 rather than as a separate decision. It is
  listed here because it is visible movement, not because it was designed for.
- **Already-issued previews.** Unaffected. A previously issued preview is a stored `site_config`
  read back from the shared-preview repository; nothing here rewrites stored configs, and the
  compile path only runs when a new preview is prepared.
