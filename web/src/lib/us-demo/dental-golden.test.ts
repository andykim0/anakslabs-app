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
 * `scripts/fixtures/clinic-golden/dental-golden.json` was captured on pristine main, before
 * specialty was a parameter. Every dental fixture must still compile to exactly those bytes:
 * the whole SiteConfig, the JSON-LD of every page, the delivery verdict and the source counters.
 *
 * A failure here is not a flaky snapshot. It means a dental practice we have already sent a link
 * to would now receive a different site, which is the one outcome the specialty work was not
 * allowed to cause. Do not regenerate the golden to make this pass — diagnose the reported path.
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
