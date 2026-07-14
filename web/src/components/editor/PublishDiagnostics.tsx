'use client';

/**
 * [G4] 발행 전 진단 요약 — SEO/AEO/GEO 점수 + 개선 항목을 고객 언어 코칭으로.
 * "홈페이지 최적화 AI"의 정체성 최전선: 점수 자랑이 아니라 "이거 채우면 검색 노출이 좋아져요".
 * 점수는 발행을 차단하지 않는다(기존 정책). 하드 blocker만 발행 불가.
 */
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { fetchPreflight, type ScanIssueGuidance } from './api';
import { cn } from '@/components/dashboard/ui';

export type FixAnchor = ScanIssueGuidance['anchor'];

const PILLAR_LABEL: Record<string, string> = { seo: '검색(SEO)', aeo: 'AI 답변(AEO)', geo: 'AI 인용(GEO)' };
const PASS_THRESHOLD = 70;

function ScoreDot({ label, score }: { label: string; score: number }) {
  const tone = score >= PASS_THRESHOLD ? 'text-emerald-400' : score >= 40 ? 'text-[#174DDA]' : 'text-red-400';
  return (
    <div className="flex flex-col items-center rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] px-3 py-2.5">
      <span className={cn('text-xl font-semibold tabular-nums', tone)}>{score}</span>
      <span className="mt-0.5 text-[10px] text-[#667085]">{label}</span>
    </div>
  );
}

export function PublishDiagnostics({
  siteId,
  onFix,
}: {
  siteId: string;
  /** 개선 항목의 딥링크 앵커로 이동(에디터 포커스/사업자정보 등) */
  onFix: (anchor: FixAnchor) => void;
}) {
  const { data, isPending, isError } = useQuery({
    queryKey: ['preflight', siteId],
    queryFn: () => fetchPreflight(siteId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (isPending) {
    return <div className="h-40 animate-pulse rounded-lg bg-white" />;
  }
  if (isError || !data) {
    return (
      <p className="rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] px-3.5 py-3 text-xs text-[#5F6B7C]">
        진단을 불러오지 못했어요. 그대로 발행하거나 잠시 후 다시 시도해 주세요.
      </p>
    );
  }

  const { scan, improvement } = data;
  const passed = scan.scores.total >= PASS_THRESHOLD;
  // 고객이 조치할 수 있는(자동 처리 아닌) 항목만, 감점 큰 순(preflightScan 정렬) 상위 노출
  const actionable = scan.issues.filter((i) => i.guidance && i.guidance.anchor !== 'system').slice(0, 5);
  const autoCount = scan.issues.filter((i) => i.guidance?.anchor === 'system').length;

  return (
    <div className="space-y-4">
      {/* [I4] 개선 모드 — 진단에서 찾은 문제를 이렇게 고쳤어요 (실제 사라진 이슈만) */}
      {improvement && improvement.resolved.length > 0 ? (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/25 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
            <Sparkles className="h-4 w-4" />
            진단에서 찾은 문제 {improvement.resolved.length + improvement.remaining.length}개 중 {improvement.resolved.length}개를 고쳤어요
          </p>
          <p className="mt-1 text-xs text-[#5F6B7C]">
            진단 점수 <span className="tabular-nums text-[#344054]">{improvement.beforeTotal}</span> → 지금{' '}
            <span className="tabular-nums text-emerald-400">{improvement.afterTotal}</span>점.
            {improvement.remaining.length > 0 ? ` 남은 ${improvement.remaining.length}개는 아래에서 채우면 더 올라가요.` : ' 남은 문제도 거의 없어요.'}
          </p>
        </div>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0B1736]">검색 노출 점수</p>
          <span className={cn('text-xs font-medium', passed ? 'text-emerald-400' : 'text-[#174DDA]')}>
            {scan.scores.total}점 · {scan.grade}등급
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ScoreDot label="검색(SEO)" score={scan.scores.seo} />
          <ScoreDot label="AI 답변(AEO)" score={scan.scores.aeo} />
          <ScoreDot label="AI 인용(GEO)" score={scan.scores.geo} />
        </div>
      </div>

      {passed ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-3.5 py-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          검색 노출 준비가 잘 됐어요. 바로 발행해도 좋아요.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-[#9DB7EB] bg-[#EDF4FF]/50 px-3.5 py-2.5 text-xs leading-5 text-[#174DDA]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          아래 몇 가지만 채우면 네이버·구글·AI 검색 노출이 눈에 띄게 좋아져요. 지금 발행해도 되고, 먼저 보완해도 돼요.
        </p>
      )}

      {actionable.length > 0 ? (
        <ul className="space-y-2">
          {actionable.map((iss) => (
            <li key={iss.code} className="rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[#0B1736]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#174DDA]" />
                    {iss.guidance!.title}
                    <span className="rounded bg-[#E8EDF5] px-1.5 py-0.5 text-[9px] text-[#5F6B7C]">
                      {PILLAR_LABEL[iss.pillar]}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[#5F6B7C]">{iss.guidance!.action}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-emerald-400/80">→ {iss.guidance!.effect}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onFix(iss.guidance!.anchor)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#CAD5E5] px-2.5 py-1 text-[11px] text-[#344054] transition-colors hover:border-[#174DDA] hover:text-[#174DDA]"
                >
                  채우기 <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {autoCount > 0 ? (
        <p className="text-[11px] text-[#667085]">
          그 밖에 {autoCount}가지(대표 주소·구조화 정보 등)는 발행 시 자동으로 처리돼요.
        </p>
      ) : null}
    </div>
  );
}
