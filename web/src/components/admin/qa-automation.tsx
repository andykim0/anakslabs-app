'use client';

/**
 * [§2] QA 자동화 임계치 모니터링 — 유형별 승인률/표본수 + 자동 전환 토글.
 * 규칙: 최근 50건 중 표본 ≥ minSamples && 승인률 ≥ threshold → "자동화 가능" 표시.
 * 전환은 관리자가 명시 토글(자동 활성화 금지). video는 자동화 제외.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EditType } from '@/lib/types/domain';
import { getQaStats, setQaRule, type QaRuleDto, type QaStatDto } from './api';
import { EDIT_TYPE_LABELS } from './format';
import { Card, ErrorBlock, LoadingBlock } from './ui';

const ORDER: EditType[] = ['text', 'image', 'structure', 'video'];

function Row({
  rule,
  stat,
  onToggle,
  pending,
}: {
  rule: QaRuleDto;
  stat: QaStatDto | undefined;
  onToggle: (enabled: boolean) => void;
  pending: boolean;
}) {
  const sampleSize = stat?.sampleSize ?? 0;
  const rate = stat?.approvalRate ?? 0;
  const automatable = rule.editType !== 'video';
  const meetsThreshold = sampleSize >= rule.minSamples && rate >= rule.approvalThreshold;

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 py-4 last:border-0">
      <div className="w-24 shrink-0">
        <p className="text-sm font-medium text-slate-800">{EDIT_TYPE_LABELS[rule.editType]}</p>
        {!automatable ? <p className="text-[11px] text-slate-400">자동화 제외</p> : null}
      </div>

      <div className="flex-1 min-w-40">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-slate-500">승인률 (최근 {sampleSize}건)</span>
          <span className="text-sm font-semibold tabular-nums text-slate-800">{Math.round(rate * 100)}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${meetsThreshold ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: `${Math.max(rate * 100, rate > 0 ? 3 : 0)}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          임계 {Math.round(rule.approvalThreshold * 100)}% · 최소 표본 {rule.minSamples}건
        </p>
      </div>

      <div className="w-28 shrink-0 text-center">
        {!automatable ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">사람 QA 고정</span>
        ) : meetsThreshold ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">자동화 가능</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">표본/승인률 부족</span>
        )}
      </div>

      <div className="w-24 shrink-0 text-right">
        {automatable ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onToggle(!rule.enabled)}
            aria-pressed={rule.enabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              rule.enabled ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                rule.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        ) : (
          <span className="text-[11px] text-slate-300">—</span>
        )}
      </div>
    </div>
  );
}

export function QaAutomation() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['qa-stats'], queryFn: getQaStats });

  const mutation = useMutation({
    mutationFn: ({ editType, enabled }: { editType: EditType; enabled: boolean }) => setQaRule(editType, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-stats'] });
      queryClient.invalidateQueries({ queryKey: ['qa-queue'] });
    },
  });

  return (
    <Card className="mb-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">QA 자동화 임계치</h2>
        <span className="text-[11px] text-slate-400">ON 시 무수정 자동 승인 · 표본 감사 유지</span>
      </div>
      <p className="mb-3 text-xs leading-5 text-slate-500">
        유형별 승인률이 임계를 넘으면 자동 승인으로 전환할 수 있습니다. 전환은 관리자가 직접 토글하며,
        자동 승인 건도 일부는 표본 감사됩니다. 영상은 항상 사람 QA를 유지합니다.
      </p>

      {isPending ? (
        <LoadingBlock label="QA 통계 불러오는 중…" />
      ) : isError ? (
        <ErrorBlock message="QA 통계를 불러오지 못했습니다." onRetry={() => refetch()} />
      ) : (
        <div>
          {ORDER.map((t) => {
            const rule = data.rules.find((r) => r.editType === t);
            if (!rule) return null;
            const stat = data.stats.find((s) => s.editType === t);
            return (
              <Row
                key={t}
                rule={rule}
                stat={stat}
                pending={mutation.isPending && mutation.variables?.editType === t}
                onToggle={(enabled) => mutation.mutate({ editType: t, enabled })}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
