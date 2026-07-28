import type { AiSignalState } from '@/lib/scan/ai-visibility';
import {
  US_DEMO_DIFF_GROUP_LABELS,
  type UsDemoStructureComparison,
} from '@/lib/us-demo/structure-diff';
import type { UsMedicalOutreachGroup } from '@/lib/scan/profiles';

const GROUPS = [
  'entity',
  'structuredSchema',
  'evidence',
  'answerExtraction',
  'access',
] as const satisfies readonly UsMedicalOutreachGroup[];

function stateLabel(state: AiSignalState | 'measured'): string {
  if (state === 'detected' || state === 'measured') return '확인됨';
  if (state === 'not_applicable') return '해당 없음';
  return '미확인';
}

function ScoreCard({
  title,
  summary,
  hypothesis = false,
}: {
  title: string;
  summary: UsDemoStructureComparison['source'];
  hypothesis?: boolean;
}) {
  return (
    <section
      data-us-demo-diff-column={hypothesis ? 'publish-hypothesis' : 'source'}
      className={`rounded-3xl border p-5 sm:p-7 ${
        hypothesis
          ? 'border-cyan-300 bg-cyan-50/80'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            {hypothesis ? '발행 가정' : '현재 공개 사이트'}
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
        </div>
        <p className="shrink-0 text-3xl font-black tabular-nums text-slate-950">
          {summary.score}
          <span className="ml-1 text-sm font-semibold text-slate-500">/ 100</span>
        </p>
      </div>
      <dl className="space-y-3">
        {GROUPS.map((group) => {
          const result = summary.groups[group];
          return (
            <div
              key={group}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-white/75 px-4 py-3"
            >
              <dt className="min-w-0 text-sm font-bold text-slate-800">
                {US_DEMO_DIFF_GROUP_LABELS[group]}
              </dt>
              <dd className="text-right">
                <span className="block text-sm font-black tabular-nums text-slate-950">
                  {result.earned} / {result.weight}
                </span>
                <span className="block text-[11px] font-semibold text-slate-500">
                  {stateLabel(result.state)}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

export function AiStructureDiff({
  comparison,
  pageLabel,
}: {
  comparison: UsDemoStructureComparison;
  pageLabel?: string;
}) {
  return (
    <section
      data-us-demo-structure-diff="1"
      aria-labelledby="us-demo-structure-title"
      className="bg-slate-950 px-4 py-14 text-white sm:px-8 sm:py-20"
    >
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-bold text-cyan-300">디자인이 아니라 읽히는 구조를 비교합니다</p>
        {pageLabel ? (
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Page · {pageLabel}
          </p>
        ) : null}
        <h2
          id="us-demo-structure-title"
          className="mt-3 max-w-3xl text-3xl font-black leading-tight sm:text-5xl"
        >
          {comparison.framing}
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
          왼쪽은 수집 시점의 공개 서버 HTML, 오른쪽은 같은 공개 원문을 구조화한 발행 가정입니다.
          미확인은 없음으로 단정하지 않고, 통계·인용이 없는 항목은 해당 없음으로 두어 가점을 주지 않습니다.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <ScoreCard title="원본 구조" summary={comparison.source} />
          <ScoreCard
            title="재구성한 구조"
            summary={comparison.publishHypothesis}
            hypothesis
          />
        </div>
      </div>
    </section>
  );
}
