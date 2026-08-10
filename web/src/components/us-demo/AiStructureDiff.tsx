import type { AiSignalState } from '@/lib/scan/ai-visibility';
import type { UsDemoStructureComparison } from '@/lib/us-demo/structure-diff';
import type { UsMedicalOutreachGroup } from '@/lib/scan/profiles';

const GROUPS = [
  'entity',
  'structuredSchema',
  'evidence',
  'answerExtraction',
  'access',
] as const satisfies readonly UsMedicalOutreachGroup[];

const GROUP_LABELS = Object.freeze({
  entity: 'Practice information links',
  structuredSchema: 'Structured practice information',
  evidence: 'Evidence and sources',
  answerExtraction: 'Question-and-answer structure',
  access: 'Search access',
} as const satisfies Record<UsMedicalOutreachGroup, string>);

function stateLabel(state: AiSignalState | 'measured'): string {
  if (state === 'detected' || state === 'measured') return 'Verified';
  if (state === 'not_applicable') return 'Not applicable';
  return 'Not verified';
}

function ScoreCard({
  title,
  summary,
  asLaunched,
  hypothesis = false,
}: {
  title: string;
  summary: UsDemoStructureComparison['source'];
  asLaunched: UsDemoStructureComparison['asLaunched']['source'];
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
            {hypothesis ? 'Publication hypothesis' : 'Current public site'}
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{title}</h3>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-3xl font-black tabular-nums text-slate-950">
            {asLaunched.score}
            <span className="ml-1 text-sm font-semibold text-slate-500">/ 100</span>
          </span>
          <span className="mt-1 block text-[11px] font-semibold text-slate-500">
            as launched · {summary.score} as hosted now
          </span>
        </p>
      </div>
      {(asLaunched.deferredToLaunch.length > 0 || asLaunched.inapplicablePillars.length > 0) && (
        <ul className="mb-5 space-y-1 text-[11px] leading-5 text-slate-500">
          {asLaunched.deferredToLaunch.length > 0 && (
            <li>
              <strong className="font-semibold text-slate-600">Resolved at launch:</strong>
              {' '}
              {asLaunched.deferredToLaunch.length} search-access checks a private preview cannot
              pass — indexing and crawler permissions come with the live domain.
            </li>
          )}
          {asLaunched.inapplicablePillars.map((pillar) => (
            <li key={pillar.group}>
              <strong className="font-semibold text-slate-600">Not applicable:</strong>
              {' '}
              {pillar.group} — this page is neither an article nor a claim page, so its
              {' '}
              {pillar.weight} points are excluded from both columns rather than lost.
            </li>
          ))}
        </ul>
      )}
      <dl className="space-y-3">
        {GROUPS.map((group) => {
          const result = summary.groups[group];
          return (
            <div
              key={group}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-2xl bg-white/75 px-4 py-3"
            >
              <dt className="min-w-0 text-sm font-bold text-slate-800">
                {GROUP_LABELS[group]}
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
        <p className="text-sm font-bold text-cyan-300">
          Comparing machine-readable structure, not visual design
        </p>
        {pageLabel ? (
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Page · {pageLabel}
          </p>
        ) : null}
        <h2
          id="us-demo-structure-title"
          className="mt-3 max-w-3xl text-3xl font-black leading-tight sm:text-5xl"
        >
          Server-rendered HTML structure for search and AI systems
        </h2>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
          The left column reflects the public server-rendered HTML captured at crawl time. The
          right column is a publication hypothesis that structures the same public source text.
          “Not verified” does not mean absent. The headline score is scored as launched: checks a
          private preview cannot pass, and pillars that do not apply to this kind of page, are
          named below each column and excluded from both sides rather than charged to one.
        </p>
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          <ScoreCard
            title="Original structure"
            summary={comparison.source}
            asLaunched={comparison.asLaunched.source}
          />
          <ScoreCard
            title="Restructured hypothesis"
            summary={comparison.publishHypothesis}
            asLaunched={comparison.asLaunched.publishHypothesis}
            hypothesis
          />
        </div>
      </div>
    </section>
  );
}
