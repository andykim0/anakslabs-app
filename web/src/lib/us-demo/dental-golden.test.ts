import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  captureDentalGolden,
  firstDifference,
  readDentalGolden,
} from '../../../scripts/capture-clinic-golden';

/**
 * THE GATE ON WIDENING THE ENGINE PAST DENTAL.
 *
 * `scripts/fixtures/clinic-golden/dental-golden.json` pins every dental fixture to exact bytes:
 * the whole SiteConfig, the JSON-LD of every page, the delivery verdict and the source counters.
 *
 * A failure here is not a flaky snapshot. It means a dental practice we have already sent a link
 * to would now receive a different site. Do not regenerate the golden to make this pass —
 * diagnose the reported path.
 *
 * ARITHMETIC, NOT JUDGEMENT. Regeneration is legitimate only when the movement was enumerated
 * against a written expectation BEFORE the regen, and matched it exactly. "The diff looked
 * reasonable" is not the standard: state which fixtures and render modes may move and why, then
 * verify that every other entry keeps its sha256 byte for byte. Any entry that moves outside the
 * stated set — or a stated mover that does not move — is a stop, not a smaller diff to accept.
 *
 * CAPTURE 1 — pristine main, before specialty was a parameter. The baseline this file was built
 * to defend.
 *
 * CAPTURE 2 — the ingestion-guard narrowing (US_MEDICAL_DEMO_AD_RULES). The guard had been
 * hard-dropping source blocks for terms the downstream policy treats as legitimate, so the demo
 * sent to a clinic was missing that clinic's own sentences. Stated expectation before regen:
 * cameods only, both render modes; dental360 and iddental byte-identical, same sha256. Found
 * exactly that. cameods released 5 blocks (1 board-certified bio, 4 causal "leading to"), of
 * which 3 placed: usedBlocks 147 -> 150, excludedBlocks 10 -> 5, and the extra content crossed
 * the FAQ threshold so the home page gained an `faq` section. Legitimate because the movement is
 * copy the practice itself published being restored to its own demo, and because the two
 * fixtures with no occurrence of any affected term did not move by a single byte — which is the
 * evidence that the change is scoped to what it claimed to touch.
 *
 * CAPTURE 3 — the heading/body boundary. `sourceHeadingBodyPairs` paired a heading with the tail
 * of any longer run that merely contained it, so a heading nested in a page title or in a longer
 * heading shipped that run's leftover as a service card. The fix filters WHICH OCCURRENCE may be
 * paired; the boundary set that ends a body is untouched.
 *
 * Stated expectation before regen: ALL SIX entries move, because every one of the three fixtures
 * loses at least one block and the render mode does not change extraction. Enumerated per fixture,
 * from the block census over all eight corpora:
 *
 *   cameods    192 -> 184 blocks. 8 lost, 0 gained, every one a nav-menu dump on a
 *              /periodontics/ or /endodontic-treatment/ page ("LANAP® Periodontal Treatment Dental
 *              Implants Endodontic Procedures Cracked Teeth…"). These won the pairing only because
 *              the boundary-aligned occurrence was contaminated; with the contaminated one gone
 *              the menu is rejected as a body in its own right.
 *   dental360  110 -> 107 blocks. 5 lost, 2 gained. Four are the "Services Include…" tail of
 *              "Our <X> Dentistry Services Include" — the exact defect — and the fifth,
 *              "for Teens & Adults We offer a full range of solutions…", is replaced by the
 *              orthodontics page's own paragraph. The second gain is a provider_bio from
 *              /about-us/, which the widened provider-path predicate now reads.
 *   iddental   565 -> 567 blocks. 2 lost, 10 gained. The lost pair is the one-character fragment
 *              "s" (from "Implant-Supported Bridge" matched inside "…Bridges") and the over-long
 *              glued body under it; the gains are that page's own paragraph and its seven benefit
 *              list items, plus Dr. Nam's biography composed from /about/dr-nam.
 *
 * Found exactly that: 6 of 6 moved, each fixture's block delta matched the number above, and no
 * text left any fixture that was not on this list. Legitimate because every removal is a menu or
 * a sentence fragment the practice never wrote as a sentence, and every addition is that
 * practice's own prose from its own page.
 *
 * CAPTURE 4 — the five defects a second real issuance found (Kings Park, Forefront). Four of the
 * five are invisible to this corpus by construction: no fixture prints a foreign practice's file,
 * an education mark, a repeated ZIP or an SEO geo qualifier in its <title>. The two that reach
 * dental are the phone DISPLAY contract and two rules about what a section may claim.
 *
 * Stated expectation before regen, per fixture and per path — anything else is a stop:
 *
 *   cameods    ONE path, both modes: `$.config.pages[9].showInNav: undefined -> false`. Its
 *              nav printed "Scaling and Root Planing" and "Scaling And Root Planing", two
 *              destinations a reader cannot tell apart, because the label resolver's last resort
 *              was `?? page.title` — which hands back the string that already collided. The page
 *              is untouched; it leaves the bar. `publicContact.phone` does NOT move: cameods
 *              already publishes "(630) 425-4488", which is what the display rule produces.
 *   dental360  Loses its About PAGE (`$.config.pages: length 10 -> 9`) and, with it, the stock
 *              asset that page's hero was holding (`$.config.assetRefs`). `/about-us/` publishes
 *              one candidate biography — "Learn about Dental 360 USA & our commitment to
 *              providing high-quality dental care." — which names no clinician, and the page
 *              contributes no `provider_name`, so it is no longer a `provider_bio` and there is
 *              no provider section for the About page to exist for. The sentence is not lost: it
 *              is now an `introduction` (census provider_bio 1 -> 0, introduction 0 -> 1). Phone
 *              "+1 773-588-8200" -> "(773) 588-8200".
 *   iddental   ONE path, both modes: `$.config.publicContact.phone: "2133521080" ->
 *              "(213) 352-1080"`. Nothing else: it has no provider section to lose, no nav
 *              collision, and its `phone` SOURCE BLOCK still reads "2133521080".
 *
 * No fixture may change `deliverable` or gain a delivery blocker, and no fixture may lose a
 * photograph: the new image rules match 2 files in this corpus and both are on Kings Park.
 *
 * Found exactly that: 6 of 6 moved, every reported path was on this list, and no path that is not
 * on it moved. Legitimate because each movement is a claim the demo was making that its source
 * does not support — a nav entry that repeats another, a doctor section with no doctor in it, and
 * ten digits where a phone number belongs.
 *
 * CAPTURE 5 — the publish blockers. Every config in this corpus was refused by `checkPublish`:
 * 22 blockers on a delivered cameods or iddental page, 19 on dental360, in both render modes.
 * Two defects, both at the compiler.
 *
 *   (a) `#clinic-sticky-booking` is not a section id and never was — the sticky bar is an
 *       `<aside>` with no `id` — so every treatment page's "Book Appointment" did nothing in the
 *       browser. It now points at `/contact`. It stays an internal path because P3 forbids this
 *       compiler from emitting an active connector and because booking is not ours to activate
 *       before the operator connects the practice's system.
 *   (b) A hero carrying a `clinicHeroLayout` emitted `overlayColor` for a scrim the renderer
 *       never paints (the copy sits on an opaque plate). The gate read the colour, assumed
 *       `overlayOpacity ?? 0.45`, and scored a wash that does not exist at 3.92 against a 4.5
 *       floor. The colour is no longer emitted there. Zero rendered pixels move.
 *
 * Stated expectation before regen — ALL SIX entries move, and nothing outside this list:
 *
 *   cameods    12 `overlayColor` removals (one per hero with a layout decision), 10 procedure
 *              CTA hrefs `#clinic-sticky-booking` -> `/contact`. 22 paths, both modes.
 *   dental360  9 `overlayColor` removals, 7 procedure CTA hrefs, and ONE more: its home CTA
 *              also moves, `#clinic-home-faq` -> `/contact`. dental360 publishes no FAQ, so
 *              `buildClinicFaqSection` returned nothing and that band had been pointing at a
 *              section its own page did not contain. 17 paths, both modes.
 *   iddental   11 `overlayColor` removals — 11, not 12, because the `invisalign` hero is the one
 *              stock hero in the corpus and its 0.82 scrim is really painted, so it keeps its
 *              overlay — 10 procedure CTA hrefs, and 2 text colours on that stock hero moving to
 *              the ink token (`#4253FF` and `#5A6270` -> `#111318`) so the copy clears AA on the
 *              scrim it actually sits on. `overlayOpacity` stays 0.82: the colour swap was
 *              enough, and nothing raises a scrim that already passes. 23 paths, both modes.
 *
 * No fixture may change its page count, its section count, `deliverable`, `deliveryBlockers`,
 * `sourceReport` or any JSON-LD node.
 *
 * Found exactly that: 6 of 6 moved, every reported path was on this list, no path that is not on
 * it moved, and the four non-config surfaces were byte-identical in all six entries. Legitimate
 * because every movement removes something that was already false — a button that navigated
 * nowhere, and a scrim that was described in the config but drawn on no screen.
 */
describe('dental output is byte-identical across the specialty parameterisation', () => {
  const golden = readDentalGolden();
  const captured = captureDentalGolden();

  test('the golden covers every fixture and render mode', () => {
    assert.equal(golden.length, 6);
    assert.equal(captured.length, golden.length);
    assert.deepEqual(
      captured.map((entry) => `${entry.fixture}:${entry.renderMode}`),
      golden.map((entry) => `${entry.fixture}:${entry.renderMode}`),
    );
  });

  for (const [index, expected] of golden.entries()) {
    test(`${expected.fixture} ${expected.renderMode} compiles to the recorded bytes`, () => {
      const actual = captured[index];
      // Reported before the hash, because the hash alone cannot tell anyone what moved.
      assert.equal(
        firstDifference(expected, actual),
        null,
        `dental output changed at the path above for ${expected.fixture} ${expected.renderMode}`,
      );
      assert.equal(actual.sha256, expected.sha256);
    });
  }

  /**
   * The dental JSON-LD identity, pinned separately from the whole-config hash. Site 4 of the
   * specialty work edits exactly this node, so it gets an assertion that names the vocabulary
   * rather than only a checksum that would change for any reason at all.
   */
  test('dental still declares itself a Dentist', () => {
    for (const entry of captured) {
      const home = entry.jsonLd[''] as Array<Record<string, unknown>> | undefined;
      const identity = home?.find((node) => String(node['@id'] ?? '').endsWith('#identity'));
      assert.deepEqual(
        identity?.['@type'],
        ['Dentist', 'MedicalClinic', 'LocalBusiness'],
        `${entry.fixture} ${entry.renderMode}`,
      );
      assert.equal(
        'medicalSpecialty' in (identity ?? {}),
        false,
        `${entry.fixture}: dental must not gain a medicalSpecialty property`,
      );
    }
  });
});
