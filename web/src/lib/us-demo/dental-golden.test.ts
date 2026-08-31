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
