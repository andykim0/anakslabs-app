import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test, { describe } from 'node:test';
import {
  enforceGeneratedMedicalConfig,
  generateMedicalSafeCopy,
  screenMedicalSiteConfig,
} from '@/lib/content/medical-ad-enforcement';
import { screenMedicalCopy } from '@/lib/content/medical-ad-policy';
import { screenMedicalContentPost } from '@/lib/content-fulfillment/medical-post-policy';
import type { GeneratedContentPost } from '@/lib/content-fulfillment/honesty';
import type { SiteConfig } from '@/lib/types/site';

/**
 * Every sentence below was screened by the live rules, not by a copy of them: the config goes
 * through `screenMedicalSiteConfig`, the same entry point publish, tenant serving, export, and the
 * demo delivery gate call.
 */

/**
 * The structural side-effect rule is a site-level check on the whole config, independent of any
 * matcher in this file. `RISK_LINE` satisfies it so that a sentence under test is the only thing
 * that can produce a violation — otherwise every fixture mentioning a procedure would fail for an
 * unrelated reason and prove nothing about the matchers.
 */
const RISK_LINE = 'Individual results vary and every procedure carries risk.';

function medicalConfig(...sentences: readonly string[]): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: "'Inter', sans-serif", body: "'Inter', sans-serif" },
      palette: {
        background: '#ffffff',
        surface: '#f6f7f9',
        text: '#111111',
        muted: '#555555',
        primary: '#174dda',
        accent: '#087d70',
      },
    },
    meta: {
      title: 'Fullerton Dental Care',
      description: 'Visit information and available services.',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      industryClass: 'medical',
      industryId: 'clinic',
    },
    pages: [{
      id: 'home',
      title: 'Home',
      slug: '',
      sections: [{
        id: 'hero',
        type: 'hero',
        name: 'Practice information',
        height: 720,
        background: { color: '#ffffff' },
        elements: [...sentences, RISK_LINE].map((sentence, index) => ({
          id: `copy-${index}`,
          kind: 'text' as const,
          frame: { x: 120, y: 120 + index * 140, w: 900, h: 120 },
          z: index + 1,
          text: sentence,
          style: { fontSize: 20, fontFamily: 'body' as const, color: '#111111' },
        })),
      }],
    }],
  };
}

const screen = (sentence: string) => screenMedicalSiteConfig(medicalConfig(sentence));

/** Truthful clinic sentences the screen used to refuse. Each was verified against the live rules. */
const CREDENTIAL_SENTENCES = [
  'Our board-certified periodontist has practiced in Fullerton for 18 years',
  'Dr. Kim is fellowship-trained in implant dentistry',
  'We are an accredited member of the California Dental Association',
] as const;

const NARROWED_SENTENCES = [
  'Plaque is the leading cause of tooth decay',
  'There is no cure for periodontal disease, but it can be managed',
  'We are the only clinic in Fullerton open on Saturdays',
] as const;

describe('the medical screen stops refusing truthful clinic sentences', () => {
  test('none of the six produce a violation', () => {
    for (const sentence of [...CREDENTIAL_SENTENCES, ...NARROWED_SENTENCES]) {
      const result = screen(sentence);
      assert.deepEqual(result.violations, [], sentence);
      assert.equal(result.ok, true, sentence);
    }
  });

  test('credentials are still detected, as advisories', () => {
    // A rule that stopped matching would be a deletion, not a reclassification. This asserts the
    // detection survives the move out of `violations`.
    for (const sentence of CREDENTIAL_SENTENCES) {
      const result = screen(sentence);
      const advisory = result.advisories.find(
        (item) => item.ruleId === 'medical-credential-claim',
      );
      assert.ok(advisory, `${sentence}\n${JSON.stringify(result.advisories, null, 2)}`);
      assert.equal(advisory.category, 'qualification-endorsement');
      assert.ok(advisory.matchedText.length > 0);
      assert.ok(advisory.path.length > 0);
    }
  });

  test('the narrowed rules produce no advisory either — they simply do not match', () => {
    for (const sentence of NARROWED_SENTENCES) {
      assert.deepEqual(screen(sentence).advisories, [], sentence);
    }
  });
});

describe('the claims the screen exists to catch are still caught', () => {
  const CONTROLS = [
    ['We guarantee a completely pain-free experience with no side effects', 'medical-guarantee-safety'],
    ['Immediate, dramatic results after one appointment', 'medical-instant-effect'],
  ] as const;

  test('both controls still block, on the same rules', () => {
    for (const [sentence, ruleId] of CONTROLS) {
      const result = screen(sentence);
      assert.equal(result.ok, false, sentence);
      assert.ok(
        result.blockViolations.some(
          (violation) => violation.kind === 'copy' && violation.ruleId === ruleId,
        ),
        `${sentence}\n${JSON.stringify(result.violations, null, 2)}`,
      );
    }
  });

  /**
   * The adjacent negatives. Each one is a near neighbour of a sentence the screen now lets through,
   * separated only by the distinction the narrowed matcher encodes — a superiority claim rather
   * than an epidemiological fact, an exclusive capability rather than an opening hour, an asserted
   * cure rather than a disclaimed one, an unattributed award rather than a registry credential.
   */
  const ADJACENT = [
    ['We are the leading dental practice in Orange County', 'medical-superlative-absolute', 'block'],
    ['the only clinic in the state that can reverse gum disease', 'medical-superlative-absolute', 'block'],
    ['#1 clinic', 'medical-superlative-absolute', 'block'],
    ['This procedure cures periodontal disease', 'medical-guarantee-safety', 'block'],
    ['we cure gum disease', 'medical-guarantee-safety', 'block'],
    ['Our award-winning cosmetic team', 'medical-endorsement-puffery', 'warn'],
  ] as const;

  test('each adjacent negative keeps its rule, its severity, and its refusal', () => {
    for (const [sentence, ruleId, severity] of ADJACENT) {
      const result = screen(sentence);
      const violation = result.violations.find(
        (item) => item.kind === 'copy' && item.ruleId === ruleId,
      );
      assert.ok(violation, `${sentence}\n${JSON.stringify(result.violations, null, 2)}`);
      assert.equal(violation.severity, severity, sentence);
      // warn still blocks: `ok` is false for both severities until a human-review flow exists.
      assert.equal(result.ok, false, sentence);
    }
  });

  test('normalization still delivers "#1 clinic" to the matcher as "1 clinic"', () => {
    const matched = screenMedicalCopy('#1 clinic').violations
      .find((violation) => violation.ruleId === 'medical-superlative-absolute');
    assert.ok(matched);
    assert.equal(matched.matchedText, '1 clinic');
  });
});

/**
 * A credential is the clinic's own factual assertion, which it is responsible for under the terms
 * of service, on every surface — not only on the generated site. These four call sites consulted
 * the same screen and therefore all change together. That is intended; each test below records the
 * new behaviour so a future revert has to argue with a named expectation.
 */
describe('making credentials non-blocking changes four downstream surfaces', () => {
  test('publish preflight no longer lists a credential as a blocker', () => {
    // preflight pushes every entry of `violations` into blockers regardless of severity, so an
    // empty `violations` is exactly what keeps a credential out of the publish gate.
    const result = screen(CREDENTIAL_SENTENCES[0]);
    assert.deepEqual(result.violations, []);
    assert.equal(result.blockViolations.length, 0);
    assert.equal(result.warnViolations.length, 0);
  });

  test('a customer edit request carrying a credential is accepted', () => {
    // The route's gate, pinned to the route source so this cannot drift into testing a copy of it.
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/edit-requests/route.ts'),
      'utf8',
    );
    assert.match(route, /screenMedicalCopy\(requestedContent, \{ scope: 'body' \}\)/u);
    assert.match(route, /if \(customerCopy\.violations\.length\)/u);

    // 422 MEDICAL_AD_COPY_BLOCKED fires on a non-empty `violations`; a credential no longer is one.
    assert.deepEqual(
      screenMedicalCopy(CREDENTIAL_SENTENCES[1], { scope: 'body' }).violations,
      [],
    );
    assert.ok(
      screenMedicalCopy('We guarantee a cure', { scope: 'body' }).violations.length > 0,
      'a real guarantee must still be refused',
    );
  });

  test('a blog post carrying a credential is publishable', () => {
    const post = (title: string): GeneratedContentPost => ({
      slug: 'meet-the-team',
      title,
      titleSourceRefs: [],
      summary: 'Who provides care here and how to book a first visit.',
      summarySourceRefs: [],
      tags: ['team'],
      document: {
        version: 1,
        blocks: [{ type: 'paragraph', text: RISK_LINE, sourceRefs: [] }],
      },
    });
    const config = medicalConfig();

    const credential = screenMedicalContentPost({
      post: post('Our board-certified periodontist'),
      config,
      clinicFlagValue: '1',
    });
    assert.deepEqual(credential.violations, []);
    assert.equal(credential.ok, true);

    const guaranteed = screenMedicalContentPost({
      post: post('A treatment guaranteed to cure'),
      config,
      clinicFlagValue: '1',
    });
    assert.equal(guaranteed.ok, false);
    assert.ok(guaranteed.blockViolations.some(
      (violation) => violation.ruleId === 'medical-guarantee-safety',
    ));
  });

  test('the generated-config fallback no longer swaps credential copy for safe copy', () => {
    // Both sentences in one config so the fallback path actually runs: the guarantee forces the
    // rewrite, and the credential must survive it verbatim rather than becoming SAFE_COPY.
    const enforced = enforceGeneratedMedicalConfig(medicalConfig(
      CREDENTIAL_SENTENCES[0],
      'We guarantee a cure with no side effects',
    ));
    assert.equal(enforced.usedFallback, true);
    const serialized = JSON.stringify(enforced.config);
    assert.ok(serialized.includes(CREDENTIAL_SENTENCES[0]), 'credential copy was rewritten');
    assert.doesNotMatch(serialized, /guarantee a cure/iu);

    // And with no other violation present, the config is returned untouched.
    const untouched = enforceGeneratedMedicalConfig(medicalConfig(CREDENTIAL_SENTENCES[2]));
    assert.equal(untouched.usedFallback, false);
    assert.ok(JSON.stringify(untouched.config).includes(CREDENTIAL_SENTENCES[2]));
  });

  test('AI copy generation no longer retries on a credential', async () => {
    const prompts: string[] = [];
    const credential = await generateMedicalSafeCopy({
      industryClass: 'medical',
      prompt: 'Introduce the provider',
      scope: 'body',
      generate: async (prompt) => {
        prompts.push(prompt);
        return CREDENTIAL_SENTENCES[1];
      },
    });
    assert.equal(prompts.length, 1, 'a credential should not trigger the constrained retry');
    assert.equal(credential.resolution, 'original');
    assert.equal(credential.text, CREDENTIAL_SENTENCES[1]);

    const retried: string[] = [];
    const guaranteed = await generateMedicalSafeCopy({
      industryClass: 'medical',
      prompt: 'Introduce the treatment',
      scope: 'body',
      generate: async (prompt) => {
        retried.push(prompt);
        return 'We guarantee a cure';
      },
    });
    assert.equal(retried.length, 2, 'a real guarantee must still be retried once');
    assert.equal(guaranteed.resolution, 'catalog-fallback');
  });
});
