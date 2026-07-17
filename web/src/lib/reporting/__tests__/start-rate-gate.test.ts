import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { REPORT_EMAIL_TIMEOUT_MS } from '../resend-core';
import {
  createReportEmailStartRateGate,
  estimateReportEmailBatchUpperBoundMs,
  REPORT_EMAIL_MAX_STARTS_PER_SECOND,
  REPORT_EMAIL_START_INTERVAL_MS,
  type ReportEmailRateGateTiming,
} from '../start-rate-gate';

function fakeTiming() {
  let now = 0;
  const timing: ReportEmailRateGateTiming = {
    now: () => now,
    sleep: async (ms) => { now += ms; },
  };
  return { timing, now: () => now };
}

describe('RPT2 Resend per-run start-rate gate', () => {
  test('spaces concurrent acquisitions at no more than five starts per second', async () => {
    const clock = fakeTiming();
    const gate = createReportEmailStartRateGate(clock.timing);
    const starts: number[] = [];

    await Promise.all(Array.from({ length: 50 }, async () => {
      await gate.acquire();
      starts.push(clock.now());
    }));

    assert.equal(REPORT_EMAIL_MAX_STARTS_PER_SECOND, 5);
    assert.equal(REPORT_EMAIL_START_INTERVAL_MS, 200);
    assert.deepEqual(
      starts,
      Array.from({ length: 50 }, (_, index) => index * REPORT_EMAIL_START_INTERVAL_MS),
    );
    for (const start of starts) {
      assert.ok(
        starts.filter((candidate) => candidate >= start && candidate < start + 1_000).length
          <= REPORT_EMAIL_MAX_STARTS_PER_SECOND,
        'no rolling one-second interval may start more than five provider requests',
      );
    }
  });

  test('keeps the 50-site launch provider budget well inside maxDuration=60s', async () => {
    const clock = fakeTiming();
    const gate = createReportEmailStartRateGate(clock.timing);
    const starts: number[] = [];
    for (let index = 0; index < 50; index += 1) {
      await gate.acquire();
      starts.push(clock.now());
    }
    const unconstrainedCompletion = starts.at(-1)! + REPORT_EMAIL_TIMEOUT_MS;
    const boundedWorkerCompletion = estimateReportEmailBatchUpperBoundMs({
      count: 50,
      concurrency: 8,
      providerTimeoutMs: REPORT_EMAIL_TIMEOUT_MS,
    });
    assert.equal(starts.at(-1), 9_800);
    assert.equal(unconstrainedCompletion, 14_800);
    assert.equal(boundedWorkerCompletion, 35_200);
    assert.ok(boundedWorkerCompletion < 60_000);
  });
});
