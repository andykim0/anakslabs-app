/**
 * Topic derivation: the part that replaces a typed sentence per slot.
 *
 * Pure functions only. What is pinned here is the three properties the batch depends on — the
 * pool prefers material the customer actually gave, the month is deterministic, and a subject the
 * site already published is pushed to the back rather than written twice.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import {
  CONTENT_TOPIC_MAX_LENGTH,
  contentTopicIsAlreadyCovered,
  contentTopicPool,
  contentTopicTokens,
  liveContentPurpose,
  selectMonthlyContentTopics,
} from '../topic-pool-core';

const SITE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function survey(
  overrides: Partial<Pick<SurveyInput, 'contentDepth' | 'contentItems' | 'highlights'>> = {},
): Pick<SurveyInput, 'contentDepth' | 'contentItems' | 'highlights'> {
  return {
    contentDepth: {
      version: 2,
      facts: [
        { key: 'insurance', value: 'We accept Delta Dental PPO and Cigna DPPO.', source: 'customer' },
        { key: 'openingHours', value: 'Monday to Thursday, 8am to 5pm.', source: 'customer' },
      ],
      faqAnswers: [
        { questionId: 'documents', answer: 'Bring a photo ID and your insurance card.' },
      ],
      imports: [],
    },
    contentItems: [{ name: 'Clear aligner consultation' }],
    highlights: ['Same-week emergency appointments'],
    ...overrides,
  } as Pick<SurveyInput, 'contentDepth' | 'contentItems' | 'highlights'>;
}

describe('the pool is derived from the site, then from its industry', () => {
  test('a clinic with a survey gets survey-backed subjects first', () => {
    const pool = contentTopicPool({
      industry: 'Dental practice',
      purposeId: 'booking_service',
      survey: survey(),
    });
    assert.ok(pool.length >= 8, `a month needs eight distinct subjects, got ${pool.length}`);
    const leadingSources = pool.slice(0, 4).map((candidate) => candidate.source);
    assert.ok(
      leadingSources.every((source) => source.startsWith('survey-')),
      `survey material must lead the pool: ${leadingSources.join(', ')}`,
    );
    assert.ok(
      pool.some((candidate) => candidate.source.startsWith('industry-')),
      'the industry catalogue fills the month out behind the survey material',
    );
  });

  test('the industry tier does not repeat one stem eight times', () => {
    const pool = contentTopicPool({ industry: 'Dental practice', survey: survey() });
    const stems = pool.slice(0, 8).map((candidate) =>
      candidate.topic.toLowerCase().split(/[\s,:]+/u).slice(0, 3).join(' '));
    assert.ok(
      new Set(stems).size >= 6,
      `a month of near-identical titles is not content: ${stems.join(' | ')}`,
    );
  });

  test('a site with no survey at all still gets a month of industry subjects', () => {
    const pool = contentTopicPool({ industry: 'Dental practice' });
    assert.ok(pool.length >= 8, `got ${pool.length}`);
    assert.ok(pool.every((candidate) => candidate.source.startsWith('industry-')));
  });

  test('the industry actually changes the subjects', () => {
    const clinic = contentTopicPool({ industry: 'Dental practice' }).map((c) => c.topic);
    const salon = contentTopicPool({ industry: 'Hair salon' }).map((c) => c.topic);
    assert.notDeepEqual(clinic, salon);
    assert.ok(salon.some((topic) => /aftercare|service take/iu.test(topic)));
  });

  test('every topic fits the length the generation endpoint accepts', () => {
    for (const industry of ['Dental practice', 'Cafe', 'Law office', 'Pottery workshop']) {
      for (const candidate of contentTopicPool({ industry, survey: survey() })) {
        assert.ok(candidate.topic.length >= 2, candidate.topic);
        assert.ok(candidate.topic.length <= CONTENT_TOPIC_MAX_LENGTH, candidate.topic);
      }
    }
  });

  test('a very long customer offering is truncated rather than rejected downstream', () => {
    const pool = contentTopicPool({
      industry: 'Dental practice',
      survey: survey({ contentItems: [{ name: 'x'.repeat(400) }] }),
    });
    assert.ok(pool.every((candidate) => candidate.topic.length <= CONTENT_TOPIC_MAX_LENGTH));
  });

  test('the same subject arriving from two sources appears once', () => {
    const pool = contentTopicPool({ industry: 'Dental practice', survey: survey() });
    const keys = pool.map((candidate) =>
      [...contentTopicTokens(candidate.topic)].sort().join(' '));
    assert.equal(new Set(keys).size, keys.length);
  });

  test('a retired purpose id does not throw the derivation', () => {
    assert.equal(liveContentPurpose('ecommerce'), 'local_store');
    assert.equal(liveContentPurpose(undefined), 'local_store');
    assert.equal(liveContentPurpose('portfolio'), 'portfolio');
    assert.doesNotThrow(() =>
      contentTopicPool({ industry: 'Retail shop', purposeId: 'ecommerce' }));
  });
});

describe('a month of topics is deterministic and does not repeat itself', () => {
  const pool = contentTopicPool({ industry: 'Dental practice', survey: survey() });

  test('the same site, month and history produce the same assignment twice', () => {
    const input = { pool, usedTitles: [], siteId: SITE_ID, periodMonth: '2026-09-01', count: 8 };
    assert.deepEqual(
      selectMonthlyContentTopics(input).map((entry) => entry.candidate.id),
      selectMonthlyContentTopics(input).map((entry) => entry.candidate.id),
    );
  });

  test('eight slots in one month get eight different subjects', () => {
    const selection = selectMonthlyContentTopics({
      pool,
      usedTitles: [],
      siteId: SITE_ID,
      periodMonth: '2026-09-01',
      count: 8,
    });
    assert.equal(selection.length, 8);
    assert.deepEqual(selection.map((entry) => entry.ordinal), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(new Set(selection.map((entry) => entry.candidate.id)).size, 8);
    assert.ok(selection.every((entry) => entry.repeated === false));
  });

  test('a different month starts somewhere else in the pool', () => {
    const months = ['2026-09-01', '2026-10-01', '2026-11-01'].map((periodMonth) =>
      selectMonthlyContentTopics({
        pool, usedTitles: [], siteId: SITE_ID, periodMonth, count: 8,
      })[0]!.candidate.id);
    assert.ok(new Set(months).size > 1, `every month opened on the same subject: ${months}`);
  });

  test('two sites in the same month do not open on the same subject', () => {
    const first = selectMonthlyContentTopics({
      pool, usedTitles: [], siteId: SITE_ID, periodMonth: '2026-09-01', count: 8,
    })[0]!.candidate.id;
    const second = selectMonthlyContentTopics({
      pool,
      usedTitles: [],
      siteId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      periodMonth: '2026-09-01',
      count: 8,
    })[0]!.candidate.id;
    assert.notEqual(first, second);
  });

  test('a subject the site already published moves to the back', () => {
    const target = pool[0]!;
    const selection = selectMonthlyContentTopics({
      pool,
      usedTitles: [target.topic],
      siteId: SITE_ID,
      periodMonth: '2026-09-01',
      count: 3,
    });
    assert.ok(
      selection.every((entry) => entry.candidate.id !== target.id),
      'a covered subject must not be written again while fresh ones remain',
    );
  });

  test('an exhausted pool still fills the month, and says that it wrapped', () => {
    const selection = selectMonthlyContentTopics({
      pool: pool.slice(0, 2),
      usedTitles: pool.slice(0, 2).map((candidate) => candidate.topic),
      siteId: SITE_ID,
      periodMonth: '2026-09-01',
      count: 4,
    });
    assert.equal(selection.length, 4, 'a short month is worse than a repeated subject');
    assert.ok(selection.every((entry) => entry.repeated));
  });

  test('an empty pool selects nothing rather than inventing a subject', () => {
    assert.deepEqual(
      selectMonthlyContentTopics({
        pool: [], usedTitles: [], siteId: SITE_ID, periodMonth: '2026-09-01', count: 8,
      }),
      [],
    );
  });
});

describe('the used-subject heuristic', () => {
  test('an exact title is covered', () => {
    assert.equal(
      contentTopicIsAlreadyCovered('What should I bring?', ['What should I bring?']),
      true,
    );
  });

  test('a title that says everything the topic says is covered', () => {
    assert.equal(
      contentTopicIsAlreadyCovered(
        'How to verify insurance coverage',
        ['A guide on how to verify your insurance coverage before the visit'],
      ),
      true,
    );
  });

  test('a different subject on the same site is not covered', () => {
    assert.equal(
      contentTopicIsAlreadyCovered(
        'What to know about parking before your visit',
        ['How to verify insurance coverage before the visit'],
      ),
      false,
    );
  });

  test('an empty history covers nothing', () => {
    assert.equal(contentTopicIsAlreadyCovered('Any subject at all', []), false);
  });

  test('function words alone never make two subjects look the same', () => {
    assert.equal(
      contentTopicIsAlreadyCovered('What are your hours?', ['What should I bring?']),
      false,
    );
  });
});
