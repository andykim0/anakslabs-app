import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  MAX_SEEDED_QUESTIONS,
  buildCitationQuestionCandidates,
  citationCategoryNoun,
  citationQuestionKey,
  citationQuestionPrompt,
  deriveCitationQuestions,
  fallbackCitationQuestions,
  isDiscoveryShapedQuestion,
  normalizeCitationQuestion,
  parseGeneratedCitationQuestions,
  seededCitationQuestion,
  type CitationQuestionSubject,
} from '../questions-core';

const SUBJECT: CitationQuestionSubject = {
  name: 'Specimen Dental',
  region: 'Lincoln Park',
  industry: 'medical',
  locale: 'en-US',
};

describe('[CITE$] discovery-shaped question derivation', () => {
  test('a question addressed to the business is rejected — the engine has no subject to name', () => {
    for (const rejected of [
      'What are your hours?',
      'what are your parking options?',
      'Do you take walk-ins?',
      'Are you open on Sunday?',
      'Where can I park at your office?',
    ]) {
      assert.equal(isDiscoveryShapedQuestion(rejected), false, rejected);
    }
  });

  test('a third-person local query with the place and the need is accepted', () => {
    for (const accepted of [
      'Which dentist near Lincoln Park can see me today?',
      'Who is the best-reviewed clinic in Lincoln Park?',
      'Which clinic in Lincoln Park is open on weekends?',
    ]) {
      assert.equal(isDiscoveryShapedQuestion(accepted), true, accepted);
    }
  });

  test('the second-person guard is anchored, so the same words mid-sentence are fine', () => {
    assert.equal(
      isDiscoveryShapedQuestion('For someone new here, do you know which clinic takes walk-ins?'),
      true,
    );
  });

  test('length and punctuation rules reject unusable candidates', () => {
    assert.equal(isDiscoveryShapedQuestion('Dentist?'), false, 'too short');
    assert.equal(isDiscoveryShapedQuestion(`Which clinic ${'x'.repeat(250)}?`), false, 'too long');
    assert.equal(isDiscoveryShapedQuestion('Which clinic near Lincoln Park is open.'), false, 'not a question');
  });

  test('normalization strips bullets, numbering, and wrapping quotes a model adds', () => {
    assert.equal(normalizeCitationQuestion('1. Which clinic is open?'), 'Which clinic is open?');
    assert.equal(normalizeCitationQuestion('- Which clinic is open?'), 'Which clinic is open?');
    assert.equal(normalizeCitationQuestion('• Which clinic is open?'), 'Which clinic is open?');
    assert.equal(normalizeCitationQuestion('"Which clinic is open?"'), 'Which clinic is open?');
    assert.equal(normalizeCitationQuestion('  Which   clinic\nis open?  '), 'Which clinic is open?');
  });

  test('derivation dedupes case- and punctuation-insensitively, keeps input order, and caps', () => {
    const kept = deriveCitationQuestions(
      [
        'Which clinic in Lincoln Park is open late?',
        'WHICH CLINIC IN LINCOLN PARK IS OPEN LATE?',
        '  Which clinic in Lincoln Park is open late?  ',
        'What are your hours?',
        'Who is the best clinic in Lincoln Park?',
        'Which clinic in Lincoln Park takes new patients?',
      ],
      2,
    );
    assert.deepEqual(kept, [
      'Which clinic in Lincoln Park is open late?',
      'Who is the best clinic in Lincoln Park?',
    ]);
  });

  test('a cap of zero or a negative cap yields nothing rather than everything', () => {
    const candidates = fallbackCitationQuestions(SUBJECT);
    assert.deepEqual(deriveCitationQuestions(candidates, 0), []);
    assert.deepEqual(deriveCitationQuestions(candidates, -3), []);
    assert.equal(deriveCitationQuestions(candidates, 8).length, 8);
  });

  test('the dedupe key ignores case and punctuation but not word order', () => {
    assert.equal(
      citationQuestionKey('Which clinic is open?'),
      citationQuestionKey('  which  CLINIC, is open? '),
    );
    assert.notEqual(
      citationQuestionKey('Which clinic is open?'),
      citationQuestionKey('Is which clinic open?'),
    );
  });

  test('the canned set is deterministic, discovery-shaped, and never names the business', () => {
    const first = fallbackCitationQuestions(SUBJECT);
    assert.deepEqual(first, fallbackCitationQuestions(SUBJECT));
    assert.equal(first.length, 8);
    for (const question of first) {
      assert.equal(isDiscoveryShapedQuestion(question), true, question);
      assert.ok(question.includes('Lincoln Park'), question);
      assert.ok(!question.includes('Specimen Dental'), question);
    }
  });

  test('a site with no region still gets usable questions', () => {
    const questions = fallbackCitationQuestions({ ...SUBJECT, region: '' });
    assert.equal(questions.length, 8);
    for (const question of questions) {
      assert.equal(isDiscoveryShapedQuestion(question), true, question);
      assert.ok(question.includes('nearby'), question);
    }
  });

  test('category nouns cover the stored taxonomy and fall back rather than throw', () => {
    assert.equal(citationCategoryNoun('medical'), 'clinic');
    assert.equal(citationCategoryNoun('veterinary'), 'veterinarian');
    assert.equal(citationCategoryNoun('cafe'), 'cafe');
    assert.equal(citationCategoryNoun('interior'), 'interior designer');
    assert.equal(citationCategoryNoun('a-taxonomy-that-does-not-exist'), 'business');
    assert.equal(citationCategoryNoun(undefined), 'business');
  });

  test('a survey FAQ contributes only its topic, rewritten into a third-person query', () => {
    const seeded = seededCitationQuestion('What are your parking options?', SUBJECT);
    assert.equal(seeded, 'Which clinic in Lincoln Park has parking on site?');
    assert.equal(isDiscoveryShapedQuestion(seeded ?? ''), true);
    // The seed text itself is second person and must never survive into the question.
    assert.ok(!seeded?.toLowerCase().startsWith('what are your'));
  });

  test('topic seeds map to their own question and unknown topics are dropped', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['Do you have parking?', 'has parking on site?'],
      ['What are your opening hours?', 'is open late or on weekends?'],
      ['Which insurance do you accept?', 'is affordable and explains pricing up front?'],
      ['How do I make a reservation?', 'can book an appointment quickly?'],
      ['Is the office wheelchair accessible?', 'is wheelchair accessible?'],
      ['Are pets allowed?', 'is pet friendly?'],
      ['Is there wifi?', 'is a good place to sit and work?'],
      ['Do you have a kids area?', 'is good for families with young children?'],
      ['What is the address and directions?', 'is closest to public transit?'],
      ['Do you speak English?', 'has multilingual staff?'],
    ];
    for (const [seed, ending] of cases) {
      const question = seededCitationQuestion(seed, SUBJECT);
      assert.ok(question?.endsWith(ending), `${seed} -> ${question}`);
    }
    assert.equal(seededCitationQuestion('What is your favourite colour?', SUBJECT), null);
  });

  test('the generation prompt forbids the two shapes that make a probe unmeasurable', () => {
    const prompt = citationQuestionPrompt(SUBJECT, 8, ['parking', 'hours']);
    assert.match(prompt, /Third person/u);
    assert.match(prompt, /Never address a business directly/u);
    // Naming the business would let an engine echo it back and fake a NAMED verdict.
    assert.match(prompt, /Never mention "Specimen Dental"/u);
    assert.match(prompt, /Lincoln Park/u);
    assert.match(prompt, /parking, hours/u);
  });

  test('generated output is split per line and tolerates numbering', () => {
    assert.deepEqual(
      parseGeneratedCitationQuestions('1. Which clinic is open?\n\n2. Who is nearby?\n'),
      ['Which clinic is open?', 'Who is nearby?'],
    );
  });
});

describe('[CITE$] assembling a site question set', () => {
  const generate = (text: string) => async () => text;

  test('seeded questions lead, generated follow, and the canned set fills the rest', async () => {
    const candidates = await buildCitationQuestionCandidates({
      subject: SUBJECT,
      seeds: ['What are your parking options?'],
      maxQuestions: 4,
      generate: generate('Which clinic in Lincoln Park handles emergencies?'),
    });
    assert.equal(candidates.length, 4);
    assert.deepEqual(candidates[0], {
      question: 'Which clinic in Lincoln Park has parking on site?',
      source: 'seeded',
    });
    assert.deepEqual(candidates[1], {
      question: 'Which clinic in Lincoln Park handles emergencies?',
      source: 'generated',
    });
    assert.equal(candidates[2].source, 'generated', 'the canned set fills the tail');
  });

  test('at most three FAQ topics become seeded questions', async () => {
    const candidates = await buildCitationQuestionCandidates({
      subject: SUBJECT,
      seeds: [
        'Do you have parking?',
        'What are your hours?',
        'Which insurance do you accept?',
        'Is the office accessible?',
        'Are pets allowed?',
      ],
      maxQuestions: 8,
      generate: generate(''),
    });
    assert.equal(candidates.filter((c) => c.source === 'seeded').length, MAX_SEEDED_QUESTIONS);
  });

  test('a generation failure falls back to the canned set instead of leaving the site unmeasured', async () => {
    const candidates = await buildCitationQuestionCandidates({
      subject: SUBJECT,
      seeds: [],
      maxQuestions: 8,
      generate: async () => { throw new Error('Claude refused the request'); },
    });
    assert.equal(candidates.length, 8);
    assert.deepEqual(candidates.map((c) => c.question), fallbackCitationQuestions(SUBJECT));
  });

  test('a model that returns unusable shapes contributes nothing rather than garbage', async () => {
    const candidates = await buildCitationQuestionCandidates({
      subject: SUBJECT,
      seeds: [],
      maxQuestions: 3,
      generate: generate([
        'What are your hours?',
        'Do you take walk-ins?',
        'Sure! Here are some questions:',
        '',
      ].join('\n')),
    });
    // Every generated line was second person or not a question; only the canned set survives.
    assert.deepEqual(candidates.map((c) => c.question), fallbackCitationQuestions(SUBJECT).slice(0, 3));
  });

  test('a question the model repeats from the seed set is stored once, keeping the seeded tag', async () => {
    const seededText = 'Which clinic in Lincoln Park has parking on site?';
    const candidates = await buildCitationQuestionCandidates({
      subject: SUBJECT,
      seeds: ['Do you have parking?'],
      maxQuestions: 8,
      generate: generate(seededText),
    });
    assert.equal(candidates.filter((c) => c.question === seededText).length, 1);
    assert.equal(candidates.find((c) => c.question === seededText)?.source, 'seeded');
  });

  test('the assembled set never exceeds the cap and is deterministic without a model', async () => {
    const first = await buildCitationQuestionCandidates({
      subject: SUBJECT, seeds: [], maxQuestions: 5, generate: generate(''),
    });
    const second = await buildCitationQuestionCandidates({
      subject: SUBJECT, seeds: [], maxQuestions: 5, generate: generate(''),
    });
    assert.equal(first.length, 5);
    assert.deepEqual(first, second);
  });
});
