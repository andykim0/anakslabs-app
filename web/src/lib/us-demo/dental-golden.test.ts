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
