import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { screenMedicalCopy } from '@/lib/content/medical-ad-policy';
import { screenUsMedicalDemoCopy } from './us-medical-ad-guard';

/**
 * THE INGESTION GUARD, TERM BY TERM.
 *
 * This guard runs at compile (`source-compiler.ts`) and hard-drops a source block. That is the
 * most destructive disposition in the pipeline: the sentence never reaches the demo, so nobody
 * downstream can advise on it, approve it, or even see that it existed. It therefore has to be
 * narrow, and "narrow" is only meaningful if the boundary is pinned by example.
 *
 * Each case below is a real or realistic clinic sentence. `block` means the block is deleted at
 * ingestion; `review` means it needs an explicit Andy approval; `pass` means it enters the demo
 * and any further judgement belongs to the downstream screen (`medical-ad-policy.ts`).
 *
 * NOTE ON SCOPE. Some claims a clinic can publish are NOT this guard's job — "Immediate, dramatic
 * results after one appointment" is caught downstream by `medical-instant-effect`, and never
 * matched here in any version of this file. Asserting it against this guard would be asserting a
 * rule that does not live here, so it is deliberately absent.
 */
const CASES: ReadonlyArray<readonly [string, 'block' | 'review' | 'pass']> = [
  /**
   * `leading` is a superiority claim only when it leads back to the practice. The complement list
   * mirrors the downstream narrowing (`medical-ad-policy.ts`) and extends it with the specialty
   * nouns a real corpus actually uses — cameods publishes "As a leading periodontists", which the
   * downstream list alone would miss.
   */
  ['a leading provider of advanced dental care', 'block'],
  ['As a leading periodontists, our team has successfully managed hundreds of cases.', 'block'],
  ['leading dental practice', 'block'],
  /**
   * The causal sense. These are statements about a disease, not about who treats it, and cameods
   * publishes five such blocks — every one of them was being deleted before the narrowing.
   */
  ['Swollen gums pull away from your teeth, leading to the formation of periodontal pockets.', 'pass'],
  ['Excess gum tissue can trap food and bacteria, leading to decay and gum problems.', 'pass'],
  ['This recession exposes tooth roots, leading to increased sensitivity.', 'pass'],
  ['Ignoring these symptoms allows gum disease to worsen, leading to significant oral health challenges.', 'pass'],
  ['bacteria can quickly repopulate, leading to further infection', 'pass'],
  ['plaque is the leading cause of tooth decay', 'pass'],
  /** `only` needs a capability complement: exclusive capability is a claim, availability is a fact. */
  ['We are the only clinic that can reverse gum disease', 'block'],
  ['the only clinic in Fullerton open on Saturdays', 'pass'],
  /** An asserted cure blocks; a disclaimer about the absence of one is the opposite of the claim. */
  ['we cure gum disease', 'block'],
  ['Neither is cured by a single prescription', 'block'],
  ['There is no cure for periodontal disease', 'pass'],
  /** Unchanged blockers. */
  ['We guarantee a completely pain-free experience with no side effects', 'block'],
  ['Award-Winning Service', 'block'],
  ['Harvard-trained implant surgeon', 'block'],
  /**
   * The four released credential terms. A credential is a checkable fact the practice is
   * contractually responsible for, and the downstream screen records it as an advisory the
   * operator reads before sending. Deleting the sentence here suppressed a true statement the
   * clinic is entitled to make — and stripped every doctor bio out of its own demo.
   */
  ['Our board-certified endodontists are ready to help.', 'pass'],
  ['Our certified specialist team', 'pass'],
  ['an accredited facility', 'pass'],
  ['Every surgeon at Northbank is fellowship trained', 'pass'],
  /** Outcome claims still need a human, and still are not auto-rewritten. */
  ['Our success rate is reported as 92%.', 'review'],
];

describe('the US demo ingestion guard drops only what a demo must not reproduce', () => {
  for (const [text, expected] of CASES) {
    test(`${expected}: ${text}`, () => {
      const { violations, ok } = screenUsMedicalDemoCopy(text);
      const blocked = violations.some((violation) => violation.severity === 'block');
      const actual = blocked ? 'block' : violations.length > 0 ? 'review' : 'pass';
      assert.equal(
        actual,
        expected,
        `${JSON.stringify(text)} -> ${violations.map((v) => `${v.category}:${v.matchedText}`).join(', ') || 'no violations'}`,
      );
      assert.equal(ok, violations.length === 0);
    });
  }

  /**
   * The single-term boundary, stated on its own.
   *
   * `clinic-multipage.test.ts` asserts that manual approval cannot resurrect a blocked heading,
   * using the fixture heading "Harvard-trained board-certified implant team". That test still
   * passes unchanged after this narrowing — but only because `Harvard` blocks the combined
   * heading, which means it can no longer tell anyone what `board-certified` does on its own.
   * This is that missing half: the credential term alone survives, the unattributed-prestige term
   * still drops, and the combined heading drops on the second term rather than the first.
   */
  test('a credential term survives alone; the same heading with Harvard still drops', () => {
    const standalone = screenUsMedicalDemoCopy('Board-certified implant team');
    assert.deepEqual(standalone.violations, []);
    assert.equal(standalone.ok, true);

    const combined = screenUsMedicalDemoCopy('Harvard-trained board-certified implant team');
    assert.equal(combined.ok, false);
    assert.deepEqual(
      combined.violations.map((violation) => [violation.category, violation.matchedText]),
      [['unverified-credential', 'Harvard-trained']],
      'the block must be attributed to Harvard, not to the released credential term',
    );
  });

  test('the released terms are gone from the credential rule and the kept ones remain', () => {
    // Asserted against the rule source rather than only through samples, so that re-adding a term
    // fails here with the term named instead of somewhere downstream as a missing sentence.
    const rule = screenUsMedicalDemoCopy('Award-Winning').violations[0];
    assert.equal(rule?.category, 'unverified-credential');
    for (const released of ['board-certified', 'certified specialist', 'accredited', 'fellowship-trained']) {
      assert.equal(screenUsMedicalDemoCopy(released).ok, true, released);
    }
    for (const kept of ['award-winning', 'Harvard University', 'harvard medical school']) {
      assert.equal(screenUsMedicalDemoCopy(kept).ok, false, kept);
    }
  });
});

/**
 * THE `#1` MATCHER, WHICH WAS DEAD IN BOTH REGISTRIES.
 *
 * `#\s*1` sat inside `\b(?:…)\b` in the upstream rule. `\b` is a boundary between a word and a
 * non-word character and `#` is a non-word character, so after a space or at the start of a string
 * there is no boundary for it to satisfy — the alternative could only ever fire when glued to a
 * preceding letter, which is not how anyone writes it. Downstream the shape of the miss was
 * different: punctuation is stripped before matching, so the claim arrives as "1 …", and the
 * matcher there demanded the noun be adjacent to the numeral.
 *
 * The consequence was not theoretical. "#1 Dental Emergency provider in Sacramento Region" passed
 * both screens and rendered as a services-card title on the first outreach preview sent to a real
 * practice. That exact sentence is the first case below and is why this block exists.
 */
describe('the #1 superiority claim is caught at both screens', () => {
  const LIVE_SENTENCE = '#1 Dental Emergency provider in Sacramento Region';
  const upstreamBlocks = (text: string) => screenUsMedicalDemoCopy(text)
    .violations.some((violation) => violation.severity === 'block');
  const downstreamBlocks = (text: string) => screenMedicalCopy(text)
    .violations.some((violation) => violation.ruleId === 'medical-superlative-absolute');

  test('the sentence that reached the live preview drops upstream and flags downstream', () => {
    assert.equal(upstreamBlocks(LIVE_SENTENCE), true);
    assert.equal(downstreamBlocks(LIVE_SENTENCE), true);
    assert.deepEqual(
      screenUsMedicalDemoCopy(LIVE_SENTENCE).violations
        .map((violation) => [violation.category, violation.matchedText]),
      [['comparative-superiority', '#1']],
    );
    assert.equal(
      screenMedicalCopy(LIVE_SENTENCE).violations
        .find((violation) => violation.ruleId === 'medical-superlative-absolute')?.matchedText,
      '1 dental emergency provider',
      'the downstream match must span the word gap, not just the bare numeral',
    );
  });

  for (const text of [
    '#1 clinic in Elk Grove',
    '# 1 dental practice in the region',
    'We are the #1 provider of implants.',
    // Missed downstream before the noun list was aligned with the `leading` matcher in the same rule.
    'Voted #1 Dentist three years running',
  ]) {
    test(`blocked at both screens: ${text}`, () => {
      assert.equal(upstreamBlocks(text), true, 'upstream');
      assert.equal(downstreamBlocks(text), true, 'downstream');
    });
  }

  /**
   * The controls that were already passing and must keep passing. A widened `#1` token is only
   * worth having if it did not also start eating the ordinals: `#` numbers a suite, a tooth, a
   * figure and a chapter far more often than it ranks a practice, and each of these was measured
   * against the new pattern rather than assumed.
   */
  for (const text of [
    'Chapter #10 of our patient guide',
    'See Figure #12 for the healing timeline.',
    'Ora Dentistry, 8788 Elk Grove Blvd Suite #1, Elk Grove CA',
    'Suite #1, Ora Dental Practice, Elk Grove',
    'Our office is in Building #1 next to the pharmacy.',
    'Room #1 is our surgical suite.',
    'Implant #1 was placed in the lower left quadrant.',
    'Step 1: your consultation with the clinic coordinator',
  ]) {
    test(`not a ranking claim: ${text}`, () => {
      assert.equal(upstreamBlocks(text), false, 'upstream');
      assert.equal(downstreamBlocks(text), false, 'downstream');
    });
  }

  test('the pre-existing superiority terms are untouched by the restructure', () => {
    for (const text of [
      'The best dentist in town',
      'Number one choice for implants',
      'A top-rated practice',
      'The leading implant clinic in Sacramento',
      'the only clinic in the county that can reverse gum disease',
    ]) {
      assert.equal(upstreamBlocks(text), true, `upstream: ${text}`);
      assert.equal(downstreamBlocks(text), true, `downstream: ${text}`);
    }
    // `leading` still needs its self-referential noun; the epidemiological use is not a claim.
    assert.equal(upstreamBlocks('Plaque is the leading cause of tooth decay.'), false);
    assert.equal(downstreamBlocks('Plaque is the leading cause of tooth decay.'), false);
    // `only` still needs a capability complement; an operating fact is checkable.
    assert.equal(upstreamBlocks('We are the only clinic in Elk Grove open on Saturdays.'), false);
    assert.equal(downstreamBlocks('We are the only clinic in Elk Grove open on Saturdays.'), false);
  });
});
