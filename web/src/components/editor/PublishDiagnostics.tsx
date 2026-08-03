'use client';

/**
 * [G4] 발행 전 진단 요약 — SEO/AEO/GEO 점수 + 개선 항목을 고객 언어 코칭으로.
 * "홈페이지 최적화 AI"의 정체성 최전선: 점수 자랑이 아니라 "이거 채우면 검색 노출이 좋아져요".
 * 점수는 발행을 차단하지 않는다(기존 정책). 하드 blocker만 발행 불가.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { fetchPreflight, type ScanIssueGuidance } from './api';
import { cn } from '@/components/dashboard/ui';

export type FixAnchor = ScanIssueGuidance['anchor'];

const PILLAR_LABEL: Record<string, string> = { seo: "Search (SEO)", aeo: "AI Answer (AEO)", geo: "AI Citations (GEO)" };
const PASS_THRESHOLD = 70;

function ScoreDot({ label, score }: { label: string; score: number }) {
  const tone = score >= PASS_THRESHOLD ? 'text-emerald-700' : score >= 40 ? 'text-[#174DDA]' : 'text-red-600';
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
  onGateChange,
}: {
  siteId: string;
  /** 개선 항목의 딥링크 앵커로 이동(에디터 포커스/사업자정보 등) */
  onFix: (anchor: FixAnchor) => void;
  /** 자동 하드 게이트가 모두 통과했을 때만 true. 진단 실패·로딩도 fail-closed. */
  onGateChange: (ready: boolean) => void;
}) {
  const { data, isPending, isFetching, isError } = useQuery({
    queryKey: ['preflight', siteId],
    queryFn: () => fetchPreflight(siteId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    onGateChange(!isPending && !isFetching && !isError && data?.ok === true);
  }, [data?.ok, isError, isFetching, isPending, onGateChange]);

  if (isPending || isFetching) {
    return <div className="h-40 animate-pulse rounded-lg bg-white" />;
  }
  if (isError || !data) {
    return (
      <p className="rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] px-3.5 py-3 text-xs text-[#5F6B7C]">
        Publishing is unavailable because the diagnostic check could not complete. Please try again.
      </p>
    );
  }

  const { scan, improvement } = data;
  const passed = data.ok && scan.scores.total >= PASS_THRESHOLD;
  // 고객이 조치할 수 있는(자동 처리 아닌) 항목만, 감점 큰 순(preflightScan 정렬) 상위 노출
  const actionable = scan.issues.filter((i) => i.guidance && i.guidance.anchor !== 'system').slice(0, 5);
  const autoCount = scan.issues.filter((i) => i.guidance?.anchor === 'system').length;

  return (
    <div className="space-y-4">
      {!data.ok ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <AlertTriangle className="h-4 w-4" />
            There are some items that must be corrected before publishing.
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-red-700/90">
            {data.blockers.map((blocker) => <li key={blocker}>· {blocker}</li>)}
          </ul>
        </div>
      ) : null}
      {/* [I4] 개선 모드 — 진단에서 찾은 문제를 이렇게 고쳤어요 (실제 사라진 이슈만) */}
      {improvement && improvement.resolved.length > 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <Sparkles className="h-4 w-4" />
            Resolved {improvement.resolved.length} of {improvement.resolved.length + improvement.remaining.length} diagnostic issues
          </p>
          <p className="mt-1 text-xs text-[#5F6B7C]">
            Diagnostic score <span className="tabular-nums text-[#344054]">{improvement.beforeTotal}</span> →{' '}
            <span className="tabular-nums text-emerald-700">{improvement.afterTotal}</span>.
            {improvement.remaining.length > 0 ? ` ${improvement.remaining.length} items remain.` : " No issues remain."}
          </p>
        </div>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-[#0B1736]">Search impression score</p>
          <span className={cn('text-xs font-medium', passed ? 'text-emerald-700' : 'text-[#174DDA]')}>
            {scan.scores.total} points · grade {scan.grade}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <ScoreDot label="Search (SEO)" score={scan.scores.seo} />
          <ScoreDot label="AI Answer (AEO)" score={scan.scores.aeo} />
          <ScoreDot label="AI Citations (GEO)" score={scan.scores.geo} />
        </div>
      </div>

      {!data.ok ? (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs leading-5 text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Correct the blocking items above and run the diagnostic check again before publishing.
        </p>
      ) : passed ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          The site passed the publishing checks.
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-[#9DB7EB] bg-[#EDF4FF]/50 px-3.5 py-2.5 text-xs leading-5 text-[#174DDA]">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          The site can be published now. The optional items below may improve how clearly search and AI systems read it.
        </p>
      )}

      {data.ok && data.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
          <p className="text-xs font-semibold text-amber-800">Optional items to review</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-5 text-amber-800/90">
            {data.warnings.map((warning) => <li key={warning}>· {warning}</li>)}
          </ul>
        </div>
      ) : null}

      {actionable.length > 0 ? (
        <ul className="space-y-2">
          {actionable.map((iss) => (
            <li
              key={iss.code}
              className="rounded-lg border border-[#DCE4F0] bg-[#F8FBFF] p-3"
              data-input-to-perfect={iss.guidance?.presentation === 'input-to-perfect' ? iss.code : undefined}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[#0B1736]">
                    {iss.guidance?.presentation === 'input-to-perfect' ? (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#174DDA]" />
                    )}
                    {iss.guidance!.title}
                    {iss.guidance?.presentation === 'input-to-perfect' ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] text-emerald-700">
                        Full score if you enter
                      </span>
                    ) : null}
                    <span className="rounded bg-[#E8EDF5] px-1.5 py-0.5 text-[9px] text-[#5F6B7C]">
                      {PILLAR_LABEL[iss.pillar]}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-[#5F6B7C]">{iss.guidance!.action}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-emerald-700">→ {iss.guidance!.effect}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onFix(iss.guidance!.anchor)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#CAD5E5] px-2.5 py-1 text-[11px] text-[#344054] transition-colors hover:border-[#174DDA] hover:text-[#174DDA]"
                >
                  fill <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {autoCount > 0 ? (
        <p className="text-[11px] text-[#667085]">
          besides {autoCount}Branches (representative address, structured information, etc.) are automatically processed upon issuance.
        </p>
      ) : null}
    </div>
  );
}
