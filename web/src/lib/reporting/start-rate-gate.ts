/**
 * Resend's default limit is team-wide (all API keys), not a concurrency limit.
 * Space starts by 200ms so one report run uses at most five starts per second,
 * leaving half of the default 10 req/s team budget for other API keys.
 */
export const REPORT_EMAIL_MAX_STARTS_PER_SECOND = 5;
export const REPORT_EMAIL_START_INTERVAL_MS = 200;

export interface ReportEmailRateGateTiming {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface ReportEmailStartRateGate {
  acquire(): Promise<void>;
}

const REAL_TIMING: ReportEmailRateGateTiming = {
  now: () => performance.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function finiteNow(timing: ReportEmailRateGateTiming): number {
  const value = timing.now();
  if (!Number.isFinite(value)) throw new TypeError('Report email rate-gate clock is invalid');
  return value;
}

/**
 * Creates one FIFO start-rate gate for one report run. The promise chain only
 * serializes the instant at which a provider request may start; requests still
 * execute concurrently under the separate worker cap.
 */
export function createReportEmailStartRateGate(
  timing: ReportEmailRateGateTiming = REAL_TIMING,
): ReportEmailStartRateGate {
  let nextStartAt: number | null = null;
  let tail: Promise<void> = Promise.resolve();

  return {
    acquire(): Promise<void> {
      const reservation = tail.then(async () => {
        const observedAt = finiteNow(timing);
        const scheduledAt = Math.max(nextStartAt ?? observedAt, observedAt);
        const delay = scheduledAt - observedAt;
        if (delay > 0) await timing.sleep(delay);
        const startedAt = finiteNow(timing);
        nextStartAt = Math.max(scheduledAt, startedAt) + REPORT_EMAIL_START_INTERVAL_MS;
      });
      // A test seam or timer failure must not permanently poison later slots.
      tail = reservation.catch(() => undefined);
      return reservation;
    },
  };
}

/**
 * Deterministic provider-only upper bound for capacity checks. It combines the
 * production start interval with the worker cap and per-request timeout; DB and
 * report-building work consume the remaining route budget.
 */
export function estimateReportEmailBatchUpperBoundMs(input: {
  count: number;
  concurrency: number;
  providerTimeoutMs: number;
}): number {
  if (!Number.isSafeInteger(input.count) || input.count < 0) {
    throw new TypeError('Report email batch count must be a non-negative integer');
  }
  if (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1) {
    throw new TypeError('Report email concurrency must be a positive integer');
  }
  if (!Number.isSafeInteger(input.providerTimeoutMs) || input.providerTimeoutMs < 1) {
    throw new TypeError('Report email timeout must be a positive integer');
  }
  if (input.count === 0) return 0;

  const workers = Array.from({ length: Math.min(input.count, input.concurrency) }, () => 0);
  let nextStartAt = 0;
  for (let index = 0; index < input.count; index += 1) {
    let workerIndex = 0;
    for (let candidate = 1; candidate < workers.length; candidate += 1) {
      if (workers[candidate] < workers[workerIndex]) workerIndex = candidate;
    }
    const startAt = Math.max(workers[workerIndex], nextStartAt);
    workers[workerIndex] = startAt + input.providerTimeoutMs;
    nextStartAt = startAt + REPORT_EMAIL_START_INTERVAL_MS;
  }
  return Math.max(...workers);
}
