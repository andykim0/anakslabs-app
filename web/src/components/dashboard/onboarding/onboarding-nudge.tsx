'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, SearchCheck, TriangleAlert } from 'lucide-react';
import type { SurveyInput } from '@/lib/types/domain';
import type {
  OnboardingNudgeId,
  OnboardingPreflightDto,
} from '@/lib/onboarding/nudge-contract';
import { preflightOnboarding } from '../api';
import { cn } from '../ui';

const PREFLIGHT_DEBOUNCE_MS = 900;

export interface OnboardingPreflightState {
  result: OnboardingPreflightDto | null;
  loading: boolean;
  error: string | null;
}

export function useOnboardingPreflight(
  survey: SurveyInput,
  enabled: boolean,
): OnboardingPreflightState {
  const [state, setState] = useState<OnboardingPreflightState>({
    result: null,
    loading: false,
    error: null,
  });
  const serialized = useMemo(() => JSON.stringify(survey), [survey]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, loading: true, error: null }));
      void preflightOnboarding(JSON.parse(serialized) as SurveyInput)
        .then((result) => {
          if (active) setState({ result, loading: false, error: null });
        })
        .catch((error: unknown) => {
          if (!active) return;
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error
              ? error.message
              : "I was unable to load my diagnostic scores for a while.",
          }));
        });
    }, PREFLIGHT_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, serialized]);

  return enabled ? state : { result: null, loading: false, error: null };
}

const SCORE_META = [
  { key: 'seo', label: "Search Basics" },
  { key: 'aeo', label: "questions answers" },
  { key: 'geo', label: "AI verification" },
] as const;

export function NudgeMeter({
  result,
  loading,
  error,
  compact = false,
}: {
  result: OnboardingPreflightDto | null;
  loading: boolean;
  error?: string | null;
  compact?: boolean;
}) {
  if (!result && !loading && !error) return null;

  if (compact) {
    return (
      <div
        className="flex min-h-9 items-center gap-2 rounded-full border border-ob-border bg-ob-bg px-3 text-[12px]"
        aria-live="polite"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ob-accent-strong" aria-hidden="true" />
        ) : (
          <SearchCheck className="h-3.5 w-3.5 text-ob-accent-strong" aria-hidden="true" />
        )}
        <span className="font-medium text-ob-ink">Homepage preparation score</span>
        <strong className="tabular-nums text-ob-accent-strong">
          {result ? `${result.scores.total} points` : "Checking"}
        </strong>
      </div>
    );
  }

  return (
    <section
      className="rounded-ob border border-ob-accent-strong/25 bg-ob-accent-soft/45 p-4 sm:p-5"
      aria-labelledby="onboarding-preflight-title"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p id="onboarding-preflight-title" className="text-[15px] font-semibold text-ob-ink">
            Homepage preparation score now
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ob-muted">
            This is the result of briefly creating an actual homepage using the current input and checking it using the same diagnostic criteria.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-ob-accent-strong" aria-hidden="true" /> : null}
          <strong className="text-[26px] tabular-nums text-ob-accent-strong">
            {result ? result.scores.total : '—'}
          </strong>
          <span className="text-[12px] text-ob-muted">/ 100</span>
        </div>
      </div>
      {result ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {SCORE_META.map(({ key, label }) => {
            const score = result.scores[key];
            return (
              <div key={key}>
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-medium text-ob-ink">{label}</span>
                  <span className="tabular-nums text-ob-muted">{score} points</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ob-surface" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-ob-accent-strong transition-[width] duration-300"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? <p className="mt-3 text-[12px] text-ob-danger">{error}</p> : null}
    </section>
  );
}

export function NudgeBadge({
  id,
  result,
  className,
}: {
  id: OnboardingNudgeId;
  result: OnboardingPreflightDto | null;
  className?: string;
}) {
  const nudge = result?.nudges.find((item) => item.id === id);
  if (!nudge) return null;
  const complete = nudge.state === 'complete';
  const Icon = complete ? CheckCircle2 : TriangleAlert;

  return (
    <div
      className={cn(
        'mt-2 rounded-ob border px-3 py-2 text-[12px] leading-relaxed',
        complete
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-amber-200 bg-amber-50 text-amber-900',
        className,
      )}
      data-nudge-id={id}
    >
      <p className="flex items-start gap-1.5 font-semibold">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{nudge.badge}</span>
      </p>
      <p className="mt-1 pl-5">{nudge.message}</p>
    </div>
  );
}
