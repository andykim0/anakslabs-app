/**
 * The honesty gate, read in the language the US generator actually writes.
 *
 * `honesty.ts` shipped with a Korean claim lexicon while `generation-tool.ts` instructs the model
 * to produce "source-grounded English clinic website articles". The two English tokens that
 * happened to be in the Korean rules (`no.1`, `top`) and `\d+%` were the whole of the gate on the
 * US product, so "the best implant clinic in Sacramento" or "guaranteed results" published with
 * an empty `sourceRefs` array — the exact class the sourceRef requirement exists to stop.
 *
 * Both directions are pinned here. A gate that fires on everything is as useless as one that
 * fires on nothing: every generation attempt it wrongly rejects costs a retry and then falls back
 * to the fixed safe-catalog checklist, which is a post the customer was not owed.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CONTENT_HONESTY_POLICY_VERSION,
  collectContentPostPublicText,
  textNeedsContentSource,
  validateGeneratedContentPost,
  type GeneratedContentPost,
} from '../honesty';
import { HWARODAM_SITE_CONFIG } from '@/lib/data/mock/hwarodam';
import { normalizeSiteConfig } from '@/lib/types/site';
import { generateContentPostVersion } from '../generation';
import type { ContentSourceSnapshot } from '../contracts';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

function snapshot(): ContentSourceSnapshot {
  return {
    version: 1,
    siteId: SITE_ID,
    clientId: CLIENT_ID,
    capturedAt: '2026-09-05T00:00:00.000Z',
    surveyVersion: 2,
    industryId: 'clinic',
    industryClass: 'medical',
    sources: [
      {
        id: 'fact:hours',
        kind: 'business-fact',
        path: 'survey.contentDepth.facts.openingHours',
        text: 'Office hours are Monday through Thursday, 8:00 a.m. to 5:00 p.m.',
      },
    ],
  };
}

/**
 * Claims that must be refused when they carry no source. Every one of these is a sentence a
 * clinic marketing page really writes, and every one is settleable by evidence.
 */
const NEEDS_SOURCE: ReadonlyArray<readonly [string, string]> = [
  ['superlative: best', 'We are the best dental practice in Sacramento.'],
  ['superlative: safest', 'This is the safest implant technique available.'],
  ['superlative: fastest', 'The fastest route to a straighter smile.'],
  ['superlative: cheapest', 'The cheapest crowns in the county.'],
  ['superlative: finest', 'The finest cosmetic dentistry in the region.'],
  ['superlative: largest', 'The largest orthodontic practice in the state.'],
  ['superlative: leading', 'A leading provider of clear aligners.'],
  ['superlative: award-winning', 'Our award-winning team welcomes new patients.'],
  ['superlative: award winning, spaced', 'An award winning practice since the start.'],
  ['superlative: top-rated', 'A top-rated dental office for families.'],
  ['superlative: world-class', 'World-class care from our surgical team.'],
  ['superlative: state-of-the-art', 'A state-of-the-art operatory suite.'],
  ['ranking: #1', 'The #1 clinic for emergency dentistry.'],
  ['ranking: # 1 spaced', 'Voted # 1 dentist by local readers.'],
  ['exclusivity: the only', 'We are the only practice offering same-day crowns.'],
  ['guarantee: guaranteed', 'Guaranteed results on every aligner case.'],
  ['guarantee: guarantee', 'We guarantee your comfort during the procedure.'],
  ['guarantee: guarantees', 'The treatment guarantees a straighter bite.'],
  ['absolute: painless', 'A painless extraction with modern anesthesia.'],
  ['absolute: pain-free', 'A pain-free visit for anxious patients.'],
  ['absolute: pain free, spaced', 'Pain free dentistry for the whole family.'],
  ['absolute: risk-free', 'A risk-free second opinion on your treatment plan.'],
  ['absolute: cure', 'This procedure will cure your gum disease.'],
  ['absolute: cures', 'A deep cleaning cures periodontal disease.'],
  ['absolute: cured', 'Every patient we treated was cured.'],
  ['absolute: permanent', 'A permanent solution to a missing tooth.'],
  ['absolute: permanently', 'The restoration permanently seals the tooth.'],
  ['absolute: completely safe', 'The sedation we use is completely safe.'],
  ['absolute: no side effects', 'The whitening gel has no side effects.'],
  ['comparative: better than', 'Our implants are better than what other offices place.'],
  ['comparative: safer than', 'This approach is safer than traditional surgery.'],
  ['comparative: more effective than', 'It is more effective than an over-the-counter kit.'],
  ['comparative: times faster', 'Healing is 3 times faster with this protocol.'],
  ['number: dollar amount', 'A consultation is $95.'],
  ['number: dollar with comma', 'A crown is $1,450 before insurance.'],
  ['number: USD prefix', 'Implant placement is USD 2,400.'],
  ['number: percent word', 'Coverage reaches 80 percent for preventive care.'],
  ['number: minutes', 'A cleaning appointment takes 40 minutes.'],
  ['number: hours', 'Recovery observation lasts 2 hours.'],
  ['number: years', 'Dr. Reyes has practiced here for 18 years.'],
  ['number: patients', 'We see 400 patients each month.'],
  ['number: days', 'Sutures are removed after 7 days.'],
  ['number: visits', 'The plan takes 3 visits to complete.'],
  ['number: reviews', 'We have 250 reviews from local families.'],
  ['claim: board-certified', 'Our board-certified periodontist leads the surgical team.'],
  ['claim: certified', 'A certified specialist reviews every case.'],
  ['claim: accredited', 'An accredited facility for outpatient sedation.'],
  ['claim: licensed', 'Every hygienist is licensed in this state.'],
  ['claim: fellowship-trained', 'A fellowship-trained oral surgeon is on staff.'],
  ['claim: patented', 'A patented scanning workflow shortens the visit.'],
  ['claim: testimonial', 'Read the testimonials from our implant patients.'],
  ['claim: success rate', 'Our implant success rate is reported each year.'],
  ['claim: satisfaction rate', 'The clinic tracks its patient satisfaction rate.'],
  ['claim: years of experience', 'Decades of years of experience in restorative care.'],
  ['claim: clinically proven', 'A clinically proven fluoride varnish.'],
  ['claim: FDA-approved', 'We use an FDA-approved whitening system.'],
  ['date: year', 'The practice opened in 2011.'],
];

/**
 * Ordinary article prose that must pass untouched. The generator writes in this register by
 * design — questions, checklists, and neutral instructions with no factual assertion in them.
 */
const NEEDS_NO_SOURCE: ReadonlyArray<readonly [string, string]> = [
  ['plain question', 'What should you ask before your first appointment?'],
  ['plain instruction', 'Write down the outcome you want before the visit.'],
  ['safe-catalog title', 'What to verify before you decide'],
  ['safe-catalog summary', 'A clear sequence of questions and checks for the decision ahead.'],
  ['safe-catalog list item', 'Write down the most important question.'],
  ['safe-catalog list item, verify', 'Separate the conditions you need to verify before deciding.'],
  ['mock generator summary', 'A practical sequence for preparing questions and comparing the answers you receive.'],
  ['mock generator list item', 'Keep a short record of the answers so you can compare them later.'],
  ['bare comparison verb', 'Compare what each office includes in the quoted price.'],
  ['bare only', 'Only bring the documents the office asked for.'],
  ['anatomical permanent teeth', 'Permanent teeth usually replace baby teeth over several stages.'],
  ['anatomical permanent tooth', 'A permanent tooth needs a different plan than a baby tooth.'],
  ['ordinal step', 'Step one: call the office and describe the symptom.'],
  ['no digit unit', 'Ask how many minutes the appointment usually takes.'],
  ['neutral timing question', 'Ask how long recovery normally lasts for this procedure.'],
  ['neutral cost question', 'Ask what the visit costs and what may be billed separately.'],
  ['neutral credential question', 'Ask who will perform the procedure and what their training is.'],
  ['tag: preparation', 'preparation'],
  ['tag: decision criteria', 'decision criteria'],
  ['tag: first visit', 'first visit'],
];

describe('the honesty gate reads English claims the way it reads Korean ones', () => {
  test('the policy stamp records that the lexicon changed', () => {
    assert.equal(CONTENT_HONESTY_POLICY_VERSION, 'content-honesty-2026-09-v1');
  });

  for (const [label, text] of NEEDS_SOURCE) {
    test(`needs a source — ${label}`, () => {
      assert.equal(textNeedsContentSource(text), true, text);
    });
  }

  for (const [label, text] of NEEDS_NO_SOURCE) {
    test(`passes without a source — ${label}`, () => {
      assert.equal(textNeedsContentSource(text), false, text);
    });
  }

  test('the case counts stay above the floor this slice promised', () => {
    assert.ok(NEEDS_SOURCE.length >= 30, `positive cases: ${NEEDS_SOURCE.length}`);
    assert.ok(NEEDS_NO_SOURCE.length >= 10, `negative cases: ${NEEDS_NO_SOURCE.length}`);
  });

  test('the Korean rules still fire — this is additive, not a replacement', () => {
    assert.equal(textNeedsContentSource('업계 최고의 시공 실적입니다.'), true);
    assert.equal(textNeedsContentSource('2024년 시공 12건'), true);
    assert.equal(textNeedsContentSource('상담 전에 궁금한 점을 정리해 주세요.'), false);
  });
});

function post(overrides: Partial<GeneratedContentPost> = {}): GeneratedContentPost {
  return {
    slug: 'first-visit',
    title: 'What to bring to your first visit',
    titleSourceRefs: [],
    summary: 'A short checklist you can prepare before the appointment.',
    summarySourceRefs: [],
    tags: ['first visit'],
    document: {
      version: 1,
      blocks: [{ type: 'paragraph', text: 'Ask what the office needs from you in advance.' }],
    },
    ...overrides,
  };
}

describe('an English claim without a sourceRef fails exactly as a Korean one does', () => {
  test('the unsourced English superlative is a missing-source-ref violation', () => {
    const result = validateGeneratedContentPost(
      post({ summary: 'We are the best dental practice in Sacramento.' }),
      snapshot(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) =>
      violation.code === 'missing-source-ref' && violation.path === 'summary'));
  });

  test('the same sentence with a catalog source id passes', () => {
    const result = validateGeneratedContentPost(
      post({
        summary: 'Office hours are Monday through Thursday, 8:00 a.m. to 5:00 p.m.',
        summarySourceRefs: ['fact:hours'],
      }),
      snapshot(),
    );
    assert.equal(result.ok, true, JSON.stringify(result.violations));
    assert.deepEqual(result.usedSourceRefs, ['fact:hours']);
  });

  test('an English claim sourced to an id that is not in the catalog is still refused', () => {
    const result = validateGeneratedContentPost(
      post({
        summary: 'A crown is $1,450 before insurance.',
        summarySourceRefs: ['fact:invented-price'],
      }),
      snapshot(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((violation) => violation.code === 'unknown-source-ref'));
  });

  test('the stamp on a passing result is the new one', () => {
    const result = validateGeneratedContentPost(post(), snapshot());
    assert.equal(result.ok, true, JSON.stringify(result.violations));
    assert.equal(result.policyVersion, 'content-honesty-2026-09-v1');
  });
});

describe('the safe-catalog fallback still clears the widened gate', () => {
  /**
   * The fallback is the last thing standing between a failed generation and no post at all, and
   * it is fixed copy: if a new lexicon rule matched a sentence in it, every failure path would
   * throw instead of degrading. This drives the real fallback rather than a copy of it.
   */
  test('two rejected attempts still produce a valid safe-catalog version', async () => {
    const version = await generateContentPostVersion({
      generator: { async generateText() { throw new Error('provider refused'); } },
      snapshot: snapshot(),
      config: normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG)),
      topic: 'What to check before deciding',
      slug: 'first-visit',
    });
    assert.equal(version.generationMetadata.attempt, 'safe-catalog');
    assert.equal(version.validationEvidence.honesty.ok, true);
    assert.equal(version.policyVersions.honesty, 'content-honesty-2026-09-v1');

    // And no sentence in it trips a rule while carrying no source, which is what would make the
    // fallback itself unpublishable.
    for (const entry of collectContentPostPublicText(version.post)) {
      if (entry.sourceRefs.length > 0) continue;
      assert.equal(
        textNeedsContentSource(entry.text),
        false,
        `${entry.path}: ${entry.text}`,
      );
    }
  });
});
