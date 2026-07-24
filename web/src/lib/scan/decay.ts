import { DECAY_SCORE_DISCLOSURE, type DecayScoreResult, type DecaySignal } from './decay-contract';
import { ALL_SCAN_RULES } from './rule-registry';
import type { RuleContext, ScanRule } from './rules';

function failed(rule: ScanRule, ctx: RuleContext): boolean {
  try {
    return rule.failed(ctx);
  } catch {
    return false;
  }
}

export function evaluateDecayScore(ctx: RuleContext): DecayScoreResult {
  const signals: DecaySignal[] = ALL_SCAN_RULES
    .filter((rule) => rule.decaySlot && rule.decayWeight && failed(rule, ctx))
    .map((rule) => ({
      code: rule.code,
      slot: rule.decaySlot!,
      weight: rule.decayWeight!,
      label: rule.label,
      detail: rule.detail,
    }));
  const slotDeductions = new Map<string, number>();
  for (const signal of signals) {
    slotDeductions.set(
      signal.slot,
      Math.max(slotDeductions.get(signal.slot) ?? 0, signal.weight),
    );
  }
  const deducted = [...slotDeductions.values()].reduce((sum, value) => sum + value, 0);
  return {
    score: Math.max(0, 100 - deducted),
    signals,
    observedAt: ctx.observedAt ?? new Date(0).toISOString(),
    disclosure: DECAY_SCORE_DISCLOSURE,
  };
}

export function aggregateDecayScores(
  results: readonly DecayScoreResult[],
  observedAt: string,
): DecayScoreResult {
  const signalsByCode = new Map<string, DecaySignal>();
  for (const result of results) {
    for (const signal of result.signals) {
      const current = signalsByCode.get(signal.code);
      if (!current || signal.weight > current.weight) signalsByCode.set(signal.code, signal);
    }
  }
  const signals = [...signalsByCode.values()];
  const slotDeductions = new Map<string, number>();
  for (const signal of signals) {
    slotDeductions.set(signal.slot, Math.max(slotDeductions.get(signal.slot) ?? 0, signal.weight));
  }
  return {
    score: Math.max(0, 100 - [...slotDeductions.values()].reduce((sum, value) => sum + value, 0)),
    signals,
    observedAt,
    disclosure: DECAY_SCORE_DISCLOSURE,
  };
}
