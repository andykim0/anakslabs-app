import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { REPORTING_RETENTION_MONTHS, reportingRetentionCutoff } from '@/lib/reporting/retention';
import { cutoffMonthFromIso } from '@/lib/reporting/repository-core';
import { MockCitationCheckRepository } from '../repository-mock';
import {
  assertCitationProbeInput,
  citationCutoffRunMonth,
  normalizeCitationQuestionText,
  type InsertCitationProbeInput,
} from '../repository-core';
import { CITATION_ANSWER_EXCERPT_MAX } from '../types';

function repository() {
  resetMockStore();
  return new MockCitationCheckRepository(getMockStore(), () => '2026-08-02T00:00:00.000Z');
}

function probeInput(overrides: Partial<InsertCitationProbeInput> = {}): InsertCitationProbeInput {
  return {
    siteId: HWARODAM_SITE_ID,
    questionId: 'q1',
    engine: 'openai',
    runMonth: '2026-08-01',
    status: 'ok',
    named: true,
    linked: false,
    answerExcerpt: 'An answer.',
    sources: [{ url: 'https://example.test/a', host: 'example.test' }],
    model: 'gpt-5.5',
    ...overrides,
  };
}

describe('[CITE$] citation storage', () => {
  test('questions are insert-if-absent per (site, question)', async () => {
    const repo = repository();
    const first = await repo.addQuestions({
      siteId: HWARODAM_SITE_ID,
      questions: [
        { question: 'Which clinic near here is open?', source: 'generated' },
        { question: 'Which clinic near here has parking?', source: 'seeded' },
      ],
    });
    assert.equal(first.length, 2);

    const again = await repo.addQuestions({
      siteId: HWARODAM_SITE_ID,
      questions: [
        { question: 'Which clinic near here is open?', source: 'manual' },
        { question: 'Which clinic near here takes walk-ins?', source: 'generated' },
      ],
    });
    assert.equal(again.length, 3, 'the duplicate was not stored twice');
    assert.equal(again[0].source, 'generated', 'the first write wins');
    assert.deepEqual(
      again.map((question) => question.source),
      ['generated', 'seeded', 'generated'],
    );
  });

  test('the (site, question, engine, month) tuple is the idempotency key', async () => {
    const repo = repository();
    assert.deepEqual(await repo.insertProbe(probeInput()), { created: true });
    assert.deepEqual(await repo.insertProbe(probeInput()), { created: false });
    assert.deepEqual(
      await repo.insertProbe(probeInput({ answerExcerpt: 'a different answer' })),
      { created: false },
      'the row content does not change the identity',
    );
    assert.deepEqual(await repo.insertProbe(probeInput({ engine: 'anthropic' })), { created: true });
    assert.deepEqual(await repo.insertProbe(probeInput({ runMonth: '2026-09-01' })), { created: true });
    assert.deepEqual(await repo.insertProbe(probeInput({ questionId: 'q2' })), { created: true });

    assert.equal((await repo.listProbes({ siteId: HWARODAM_SITE_ID, runMonth: '2026-08-01' })).length, 3);
    assert.equal(await repo.countProbesForMonth('2026-08-01'), 3);
    assert.equal(await repo.countProbesForMonth('2026-09-01'), 1);
  });

  test('the monthly count spans every site, because the budget is shared', async () => {
    const repo = repository();
    const store = getMockStore();
    const other = { ...store.sites.get(HWARODAM_SITE_ID)!, id: 'site-other' };
    store.sites.set(other.id, other);
    await repo.insertProbe(probeInput());
    await repo.insertProbe(probeInput({ siteId: 'site-other' }));
    assert.equal(await repo.countProbesForMonth('2026-08-01'), 2);
  });

  test('a row that never got an answer cannot claim a verdict', () => {
    assert.throws(
      () => assertCitationProbeInput(probeInput({ status: 'error', named: true })),
      /named or linked/u,
    );
    assert.throws(
      () => assertCitationProbeInput(probeInput({ status: 'skipped', linked: true })),
      /named or linked/u,
    );
    assert.doesNotThrow(
      () => assertCitationProbeInput(probeInput({ status: 'skipped', named: false, linked: false })),
    );
  });

  test('validation rejects an unstable error code, an oversized excerpt, and a bad month', () => {
    assert.throws(
      () => assertCitationProbeInput(probeInput({ errorCode: 'Error: key sk-abc leaked' })),
      /stable non-PII code/u,
    );
    assert.doesNotThrow(() => assertCitationProbeInput(probeInput({ errorCode: 'HTTP_429' })));
    assert.throws(
      () => assertCitationProbeInput(probeInput({
        answerExcerpt: 'x'.repeat(CITATION_ANSWER_EXCERPT_MAX + 1),
      })),
      /too long/u,
    );
    assert.throws(() => assertCitationProbeInput(probeInput({ runMonth: '2026-08-15' })), /YYYY-MM-01/u);
    assert.throws(
      () => assertCitationProbeInput(probeInput({ engine: 'google' as never })),
      /engine is not supported/u,
    );
  });

  test('question text is trimmed, collapsed, and length-bounded', () => {
    assert.equal(normalizeCitationQuestionText('  Which   clinic\nis open? '), 'Which clinic is open?');
    assert.throws(() => normalizeCitationQuestionText('   '), /1-300/u);
    assert.throws(() => normalizeCitationQuestionText('x'.repeat(301)), /1-300/u);
  });
});

describe('[CITE$] probes expire with the reports that quote them', () => {
  test('the purge uses the reporting retention cutoff, not a cutoff of its own', () => {
    const cutoff = reportingRetentionCutoff(new Date('2026-08-17T00:00:00.000Z'));
    assert.equal(REPORTING_RETENTION_MONTHS, 24);
    // Same helper, same boundary: a probe can never outlive its report or die first.
    assert.equal(citationCutoffRunMonth(cutoff.reportCutoffIso), `${cutoffMonthFromIso(cutoff.reportCutoffIso)}-01`);
    assert.equal(citationCutoffRunMonth(cutoff.reportCutoffIso), '2024-08-01');
  });

  test('probes older than the window are purged and newer ones are kept', async () => {
    const repo = repository();
    const cutoff = reportingRetentionCutoff(new Date('2026-08-17T00:00:00.000Z'));
    await repo.insertProbe(probeInput({ runMonth: '2024-07-01', questionId: 'old' }));
    await repo.insertProbe(probeInput({ runMonth: '2024-08-01', questionId: 'boundary' }));
    await repo.insertProbe(probeInput({ runMonth: '2026-08-01', questionId: 'recent' }));

    const deleted = await repo.purgeOlderThan(cutoff.reportCutoffIso);
    assert.equal(deleted, 1, 'only the row before the retention month');
    assert.equal((await repo.listProbes({ siteId: HWARODAM_SITE_ID, runMonth: '2024-07-01' })).length, 0);
    assert.equal((await repo.listProbes({ siteId: HWARODAM_SITE_ID, runMonth: '2024-08-01' })).length, 1);
    assert.equal((await repo.listProbes({ siteId: HWARODAM_SITE_ID, runMonth: '2026-08-01' })).length, 1);

    // A purged identity can be written again; the purge clears the uniqueness index too.
    assert.deepEqual(
      await repo.insertProbe(probeInput({ runMonth: '2024-07-01', questionId: 'old' })),
      { created: true },
    );
  });

  test('the reporting retention service purges probes alongside reports and events', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'reporting', 'retention-service.ts'),
      'utf8',
    );
    assert.match(source, /getCitationCheckRepository\(\)\.purgeOlderThan\(cutoff\.reportCutoffIso\)/u);
    assert.match(source, /citationProbes/u);
  });
});

describe('[CITE$] the migration encodes the storage rules the code relies on', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'migrations', '0065_citation_checks.sql'),
    'utf8',
  );

  test('both tables exist with RLS on and owner-scoped reads', () => {
    assert.match(sql, /create table public\.citation_questions/u);
    assert.match(sql, /create table public\.citation_probes/u);
    assert.match(sql, /alter table public\.citation_questions enable row level security/u);
    assert.match(sql, /alter table public\.citation_probes enable row level security/u);
    assert.match(sql, /citation_probes_select_own[\s\S]*s\.client_id = auth\.uid\(\)/u);
  });

  test('writes are service-role only', () => {
    for (const fn of [
      'insert_citation_question',
      'insert_citation_probe',
      'purge_citation_probes',
      'count_citation_probes_for_month',
    ]) {
      assert.match(sql, new RegExp(`revoke execute on function public\\.${fn}`, 'u'), fn);
      assert.match(sql, new RegExp(`grant execute on function public\\.${fn}[\\s\\S]{0,200}to service_role`, 'u'), fn);
    }
    assert.match(sql, /revoke all on table public\.citation_probes from anon, authenticated, service_role/u);
  });

  test('the idempotency key and the month-start constraint are in the schema, not only in TypeScript', () => {
    assert.match(sql, /unique \(site_id, question_id, engine, run_month\)/u);
    assert.match(sql, /unique \(site_id, question\)/u);
    assert.match(sql, /run_month = date_trunc\('month', run_month\)::date/u);
    assert.match(sql, /status = 'ok' or \(named = false and linked = false\)/u);
    assert.match(sql, /length\(answer_excerpt\) <= 600/u);
  });

  test('there is no google engine: Google Search AI answers have no API to probe', () => {
    assert.match(sql, /engine in \('openai', 'anthropic', 'gemini', 'perplexity'\)/u);
    // The engine CHECK is the enforcement point; only the explanatory comment says
    // "google", and it says why the engine is absent.
    const engineCheck = /engine\s+text not null check \(engine in \(([^)]*)\)\)/u.exec(sql);
    assert.ok(engineCheck);
    assert.doesNotMatch(engineCheck[1], /google/u);
    assert.match(sql, /Google Search's AI Overviews \/ AI Mode have no API/u);
  });
});
