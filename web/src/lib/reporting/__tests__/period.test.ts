import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { previousMonthRangesInTimeZone } from '../period';

describe('US monthly report calendar periods', () => {
  test('resolves both Los Angeles November boundaries across the DST offset change', () => {
    const periods = previousMonthRangesInTimeZone(
      'America/Los_Angeles',
      new Date('2026-12-15T12:00:00.000Z'),
    );
    assert.deepEqual(periods.report, {
      month: '2026-11',
      startDate: '2026-11-01',
      endExclusiveDate: '2026-12-01',
      startIso: '2026-11-01T07:00:00.000Z',
      endExclusiveIso: '2026-12-01T08:00:00.000Z',
    });
    assert.deepEqual(periods.comparison, {
      month: '2026-10',
      startDate: '2026-10-01',
      endExclusiveDate: '2026-11-01',
      startIso: '2026-10-01T07:00:00.000Z',
      endExclusiveIso: '2026-11-01T07:00:00.000Z',
    });
  });

  test('resolves both Los Angeles March boundaries across the DST offset change', () => {
    const periods = previousMonthRangesInTimeZone(
      'America/Los_Angeles',
      new Date('2026-04-15T12:00:00.000Z'),
    );
    assert.deepEqual(periods.report, {
      month: '2026-03',
      startDate: '2026-03-01',
      endExclusiveDate: '2026-04-01',
      startIso: '2026-03-01T08:00:00.000Z',
      endExclusiveIso: '2026-04-01T07:00:00.000Z',
    });
  });

  test('keeps Phoenix month boundaries on MST without a DST shift', () => {
    const periods = previousMonthRangesInTimeZone(
      'America/Phoenix',
      new Date('2026-12-15T12:00:00.000Z'),
    );
    assert.equal(periods.report.startIso, '2026-11-01T07:00:00.000Z');
    assert.equal(periods.report.endExclusiveIso, '2026-12-01T07:00:00.000Z');
  });

  test('keeps Honolulu month boundaries on HST without a DST shift', () => {
    const periods = previousMonthRangesInTimeZone(
      'Pacific/Honolulu',
      new Date('2026-04-15T12:00:00.000Z'),
    );
    assert.equal(periods.report.startIso, '2026-03-01T10:00:00.000Z');
    assert.equal(periods.report.endExclusiveIso, '2026-04-01T10:00:00.000Z');
  });

  test('relies on daily idempotent retries rather than inventing a due predicate', () => {
    assert.equal(
      previousMonthRangesInTimeZone(
        'America/Los_Angeles',
        new Date('2026-08-01T00:15:00.000Z'),
      ).report.month,
      '2026-06',
    );
    assert.equal(
      previousMonthRangesInTimeZone(
        'America/Los_Angeles',
        new Date('2026-08-02T00:15:00.000Z'),
      ).report.month,
      '2026-07',
    );
  });
});
