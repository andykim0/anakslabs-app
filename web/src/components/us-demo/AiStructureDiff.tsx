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

/**
 * Why a pillar can carry no applicable check. Shown in place of a zero, because a pillar that
 * cannot apply to this kind of page is not a failure and scoring it as one made the rebuild look
 * worse than the site it rebuilt.
 */
const NOT_APPLICABLE_REASONS = Object.freeze({
  evidence: 'This page is neither an article nor a claims page, so authorship, dates and claim '
    + 'sourcing have nothing to measure.',
  entity: 'No practice identity was published on this page.',
  structuredSchema: 'No structured data block was published on this page.',
  answerExtraction: 'This page publishes no question-and-answer structure.',
  access: 'Search access is set by the live domain, not by this draft.',
} as const satisfies Record<UsMedicalOutreachGroup, string>);

/** What each check reads, and where a third party can confirm it independently. */
const CHECK_NOTES: Readonly<Record<string, { reads: string; verifyWith?: string }>> = Object.freeze({
  'entity.identity-node': { reads: 'A single identity node the page as a whole points at.', verifyWith: 'Schema.org validator' },
  'entity.name-url': { reads: 'Practice name and canonical address agree with that node.', verifyWith: 'Schema.org validator' },
  'entity.visible-schema-match': { reads: 'The structured name also appears in readable text.' },
  'entity.local-details': { reads: 'Address and contact detail published as LocalBusiness fields.', verifyWith: 'Google Rich Results Test' },
  'entity.visible-us-nap': { reads: 'Name, address and phone readable without opening a map.' },
  'entity.channel-same-as': { reads: 'Official channels declared as sameAs links.', verifyWith: 'Schema.org validator' },
  'schema.present': { reads: 'A JSON-LD block is served with the HTML.', verifyWith: 'Google Rich Results Test' },
  'schema.valid': { reads: 'That block parses without error.', verifyWith: 'Schema.org validator' },
  'schema.useful-type': { reads: 'It declares a type a search engine acts on.', verifyWith: 'Schema.org validator' },
  'schema.medical-clinic': { reads: 'The type is a medical clinic rather than a generic business.', verifyWith: 'Schema.org validator' },
  'evidence.same-block-source': { reads: 'Every claim sits with the source it came from.' },
  'evidence.author': { reads: 'Authorship is attributed.' },
  'evidence.date': { reads: 'A publication or revision date is attached.' },
  'answer.heading-order': { reads: 'Headings descend one level at a time.' },
  'answer.question-boundaries': { reads: 'Questions are marked as headings, not buried in prose.' },
  'answer.main-landmark': { reads: 'A main landmark separates content from navigation.' },
  'answer.semantic-structure': { reads: 'Sections use semantic elements rather than plain divs.' },
  'answer.structured-list': { reads: 'Lists and tables are marked up as lists and tables.' },
  'access.indexable': { reads: 'The page is not excluded from indexing.' },
  'access.googlebot': { reads: 'Googlebot is allowed.' },
  'access.bingbot': { reads: 'Bingbot is allowed.' },
  'access.openai-search': { reads: 'OpenAI search crawler is allowed.' },
  'access.perplexity': { reads: 'Perplexity crawler is allowed.' },
  'access.snippet': { reads: 'Snippets are not restricted.' },
  'access.lang-declared': { reads: 'A page language is declared.' },
  'access.lang-match': { reads: 'The declared language matches the writing.' },
});

function stateLabel(state: AiSignalState | 'measured'): string {
  if (state === 'detected' || state === 'measured') return 'Verified';
  if (state === 'not_applicable') return 'Not applicable';
  return 'Not verified';
}

function Mark({ state }: { state: AiSignalState }) {
  const verified = state === 'detected';
  const na = state === 'not_applicable';
  return (
    <span
      className={`inline-flex min-w-[7.5rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
        verified
          ? 'bg-emerald-100 text-emerald-800'
          : na
            ? 'bg-slate-100 text-slate-500'
            : 'bg-amber-100 text-amber-800'
      }`}
    >
      {stateLabel(state)}
    </span>
  );
}

export function AiStructureDiff({
  comparison,
  pageLabel,
}: {
  comparison: UsDemoStructureComparison;
  pageLabel?: string;
}) {
  const sourceById = new Map(comparison.source.signals.map((signal) => [signal.id, signal]));
  const deferred = new Set(comparison.asLaunched.publishHypothesis.deferredToLaunch);

  /**
   * Counted, not scored. A single badge invited the reader to compare two numbers whose
   * denominator they could not see; the count names exactly how many checks are in play.
   */
  const comparable = comparison.publishHypothesis.signals.filter((signal) => (
    signal.state !== 'not_applicable'
    && !deferred.has(signal.id)
    && sourceById.get(signal.id)?.state !== 'not_applicable'
  ));
  const demoPasses = comparable.filter((signal) => signal.state === 'detected').length;
  const sourcePasses = comparable
    .filter((signal) => sourceById.get(signal.id)?.state === 'detected').length;

  return (
    <section
      data-us-demo-structure-diff
      className="mt-12 rounded-3xl bg-slate-950 px-5 py-10 text-slate-100 sm:px-8 sm:py-12"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
        Page · {pageLabel ?? 'Home'}
      </p>
      <h2
        id="us-demo-structure-title"
        className="mt-3 max-w-3xl text-3xl font-black leading-tight sm:text-5xl"
      >
        Server-rendered HTML structure for search and AI systems
      </h2>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
        The left column reflects the public server-rendered HTML captured at crawl time. The right
        column is a publication hypothesis that structures the same public source text. Each row is
        one check; checks that cannot apply to this kind of page, and checks a private draft cannot
        pass, are named rather than counted against either column.
      </p>

      <p className="mt-8 text-lg font-bold text-white sm:text-xl">
        {comparable.length} structural checks compared ·{' '}
        <span className="text-slate-300">Current public site passes {sourcePasses}</span>
        {' · '}
        <span className="text-cyan-300">Publication hypothesis passes {demoPasses}</span>
      </p>

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => {
          const rows = comparison.publishHypothesis.signals.filter(
            (signal) => signal.group === group,
          );
          if (rows.length === 0) return null;
          const applicable = rows.filter((signal) => signal.state !== 'not_applicable');
          return (
            <div key={group} data-us-demo-diff-group={group}>
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-400">
                {GROUP_LABELS[group]}
              </h3>
              {applicable.length === 0 ? (
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Not applicable — {NOT_APPLICABLE_REASONS[group]}
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {rows.map((signal) => {
                    const note = CHECK_NOTES[signal.id];
                    const source = sourceById.get(signal.id);
                    return (
                      <li key={signal.id} className="border-t border-slate-800 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">
                            {note?.reads ?? signal.id}
                          </span>
                          {deferred.has(signal.id) && (
                            <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                              Resolved at launch
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span>Current public site</span>
                          <Mark state={source?.state ?? 'not_applicable'} />
                          <span>Publication hypothesis</span>
                          <Mark state={signal.state} />
                          {note?.verifyWith && (
                            <span className="text-slate-500">
                              Independently checkable with the {note.verifyWith}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
