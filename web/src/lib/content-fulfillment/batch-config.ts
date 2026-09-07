/**
 * Cost and time guards for the monthly content batch.
 *
 * This deliberately does not live in `lib/env.ts` beside `citationCheckConfig`: CLAUDE.md puts
 * that file under Architect ownership and off-limits to an agent, so the batch keeps its own
 * reader with the same shape and the same fail-safe defaults. Names and defaults are documented
 * in `docs/ops/content-fulfillment-batch.md`.
 *
 * Every generation is a paid Anthropic call (~$0.15 at 6,000 output tokens, `generation-tool.ts`),
 * so the guards mirror the citation-check ones: a kill switch, a per-run ceiling, and a monthly
 * ceiling counted from STORED rows across all sites — a crash-and-retry cannot double spend.
 */
export interface ContentBatchConfig {
  enabled: boolean;
  maxGenerationsPerRun: number;
  maxGenerationsPerMonth: number;
  concurrency: number;
  staleGeneratingMs: number;
}

/**
 * A `generating` row older than this was abandoned by a crashed run or a timed-out request: the
 * generator's own request timeout is 130 s, so twenty minutes is far past any live attempt.
 */
export const CONTENT_BATCH_STALE_GENERATING_MINUTES = 20;

export const CONTENT_BATCH_DEFAULTS = Object.freeze({
  maxGenerationsPerRun: 24,
  maxGenerationsPerMonth: 1_200,
  concurrency: 3,
  staleGeneratingMinutes: CONTENT_BATCH_STALE_GENERATING_MINUTES,
});

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function contentBatchConfig(): ContentBatchConfig {
  return {
    // Default on inside its own ceilings; '0' — and only '0' — is the kill switch.
    enabled: process.env.CONTENT_BATCH_ENABLED !== '0',
    maxGenerationsPerRun: Math.max(0, positiveInt(
      process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_RUN,
      CONTENT_BATCH_DEFAULTS.maxGenerationsPerRun,
    )),
    maxGenerationsPerMonth: Math.max(0, positiveInt(
      process.env.CONTENT_BATCH_MAX_GENERATIONS_PER_MONTH,
      CONTENT_BATCH_DEFAULTS.maxGenerationsPerMonth,
    )),
    concurrency: Math.max(1, positiveInt(
      process.env.CONTENT_BATCH_CONCURRENCY,
      CONTENT_BATCH_DEFAULTS.concurrency,
    )),
    staleGeneratingMs: Math.max(0, positiveInt(
      process.env.CONTENT_BATCH_STALE_GENERATING_MINUTES,
      CONTENT_BATCH_DEFAULTS.staleGeneratingMinutes,
    )) * 60_000,
  };
}
