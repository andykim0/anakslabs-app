/**
 * [SERIES$] The performance report's charts, for the dashboard.
 *
 * The email cannot use SVG (Gmail strips it, Outlook renders through Word) and builds its
 * charts out of coloured table cells. The dashboard is a browser and has no such excuse,
 * so these are real inline SVG — but they follow the same two rules the email does:
 *
 *  - EVERY CHART IS REDUNDANT. Each one prints its numbers as text beside or beneath the
 *    drawing, and each carries a visually-hidden table of the same figures, so a screen
 *    reader gets the data rather than a description of a picture.
 *  - NO CHART LIBRARY. Every drawing here is arithmetic over a fixed `viewBox`, which
 *    keeps recharts/d3/visx out of `package.json` and out of the bundle, and pins CLS at
 *    zero: the panels are sized before the SVG paints.
 *
 * Colours come from the app's `ob-*` theme tokens (`globals.css`). The multi-step ramps
 * below are the one exception — a composition chart needs five distinguishable steps and
 * the token set holds three, so the intermediate stops are stated here and are the same
 * values the email uses, so a customer reading both sees one chart, not two.
 */
import type {
  ReportAiAnswersSection,
  ReportPublishedPost,
  ReportSeriesMonth,
  ReportSourceComposition,
  ReportWeeklyBucket,
} from '@/lib/reporting/types';

/** Darkest first, applied in source display order. Mirrors the email exactly. */
const SOURCE_RAMP = ['#0037A0', '#2D63F0', '#4D7CFF', '#8FA9EE', '#C3CEE8'] as const;
const WEEK_SERIES = [
  { key: 'calls', label: 'Calls', color: '#0037A0' },
  { key: 'directions', label: 'Directions', color: '#2D63F0' },
  { key: 'inquiries', label: 'Inquiries', color: '#8FA9EE' },
] as const;

function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

function monthShort(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * The data behind a chart, for a screen reader.
 *
 * The SVG beside it is `role="img"` with a title and description, which announces WHAT the
 * chart is; this announces what it SAYS. Both exist because a one-sentence description of
 * six months of numbers is a summary, and a customer checking a figure needs the figure.
 */
function ChartData({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            <th scope="row">{row[0]}</th>
            {row.slice(1).map((cell, index) => <td key={`${row[0]}-${index}`}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A six-month area sparkline.
 *
 * `preserveAspectRatio="none"` lets the 200x34 viewBox stretch to whatever width the tile
 * has, which is what a sparkline wants — it carries shape, not measurable magnitude, and
 * the magnitudes are printed above and below it.
 */
export function KpiSparkline({
  id,
  label,
  months,
  values,
}: {
  id: string;
  label: string;
  months: readonly string[];
  values: readonly number[];
}) {
  if (values.length < 2) return null;
  const peak = Math.max(...values);
  const floor = Math.min(...values);
  // A flat series would divide by zero; give it a mid-height line instead of a spike.
  const span = peak - floor || 1;
  const step = 192 / (values.length - 1);
  const points = values.map((value, index) => {
    const x = (4 + index * step).toFixed(1);
    const y = (31 - ((value - floor) / span) * 28).toFixed(1);
    return `${x},${y}`;
  });
  const line = points.join(' ');
  const last = points[points.length - 1].split(',');
  const range = `${monthShort(months[0])} to ${monthShort(months[months.length - 1])}`;

  return (
    <>
      <svg
        viewBox="0 0 200 34"
        preserveAspectRatio="none"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        className="mt-2 h-[34px] w-full"
      >
        <title id={`${id}-t`}>{`${label}, ${range}`}</title>
        <desc id={`${id}-d`}>
          {`Monthly totals from ${formatCount(values[0])} to ${formatCount(values[values.length - 1])}. The table beside this chart lists every month.`}
        </desc>
        <polygon points={`${line} 196,34 4,34`} fill="#2D63F0" opacity=".10" />
        <polyline
          points={line}
          fill="none"
          stroke="#2D63F0"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last[0]} cy={last[1]} r="3.4" fill="#2D63F0" />
      </svg>
      <ChartData
        caption={`${label} by month`}
        columns={['Month', label]}
        rows={months.map((month, index) => [month, formatCount(values[index] ?? 0)])}
      />
      <p className="mt-1.5 text-[10.5px] tracking-wide text-ob-muted">
        {`${monthShort(months[0]).toUpperCase()} → ${monthShort(months[months.length - 1]).toUpperCase()} · ${formatCount(values[0])} to ${formatCount(values[values.length - 1])}`}
      </p>
    </>
  );
}

/** Grouped bars, one group per ISO week of the report month, three series per group. */
export function WeeklyBars({ id, weeks }: { id: string; weeks: readonly ReportWeeklyBucket[] }) {
  if (weeks.length === 0) return null;
  const peak = Math.max(
    ...weeks.flatMap((week) => [week.calls, week.directions, week.inquiries]),
  );
  if (peak === 0) return null;

  const plotTop = 26;
  const baseline = 150;
  const plotHeight = baseline - plotTop;
  const width = 620;
  const groupWidth = (width - 34) / weeks.length;
  // Four gridlines including the baseline, so the axis labels are round-ish numbers.
  const ticks = [0, 1, 2, 3].map((index) => {
    const value = (peak / 3) * index;
    return { value: Math.round(value), y: baseline - (value / peak) * plotHeight };
  });

  return (
    <>
      <svg
        viewBox={`0 0 ${width} 190`}
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        className="mt-3.5 h-auto w-full"
      >
        <title id={`${id}-t`}>Calls, directions and inquiries by week</title>
        <desc id={`${id}-d`}>
          {`${weeks.length} weeks of the report month. Every value is printed under its week and listed in the table beside this chart.`}
        </desc>
        <g stroke="#EEF1F7" strokeWidth="1">
          {ticks.map((tick) => (
            <line key={tick.y} x1="34" y1={tick.y} x2={width - 8} y2={tick.y} />
          ))}
        </g>
        <g fontSize="9.5" fill="#8B93A5" textAnchor="end">
          {ticks.map((tick) => (
            <text key={`label-${tick.y}`} x="26" y={tick.y + 3}>{tick.value}</text>
          ))}
        </g>
        {weeks.map((week, weekIndex) => {
          const center = 34 + groupWidth * (weekIndex + 0.5);
          const barWidth = Math.min(26, (groupWidth - 16) / 3);
          return (
            <g key={`${week.isoYear}-${week.isoWeek}`}>
              {WEEK_SERIES.map((series, seriesIndex) => {
                const value = week[series.key];
                const height = (value / peak) * plotHeight;
                const x = center + (seriesIndex - 1) * (barWidth + 4) - barWidth / 2;
                return (
                  <rect
                    key={series.key}
                    x={x}
                    y={baseline - height}
                    width={barWidth}
                    height={Math.max(height, value > 0 ? 2 : 0)}
                    rx="3"
                    fill={series.color}
                  />
                );
              })}
              <text x={center} y="168" fontSize="10" fill="#545C70" textAnchor="middle">
                {`WEEK ${weekIndex + 1}`}
              </text>
              <text x={center} y="184" fontSize="9.5" fill="#8B93A5" textAnchor="middle">
                {`${week.calls} · ${week.directions} · ${week.inquiries}`}
              </text>
            </g>
          );
        })}
      </svg>
      <ChartData
        caption="Calls, directions and inquiries by week"
        columns={['Week', 'Dates', 'Calls', 'Directions', 'Inquiries']}
        rows={weeks.map((week, index) => [
          `Week ${index + 1}`,
          `${week.startDate} to ${week.endDate}`,
          formatCount(week.calls),
          formatCount(week.directions),
          formatCount(week.inquiries),
        ])}
      />
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ob-muted">
        {WEEK_SERIES.map((series) => (
          <li key={series.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: series.color }}
              aria-hidden="true"
            />
            {series.label}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Traffic composition as a donut, with the AI share called out in the hole.
 *
 * Arc lengths are taken from the SAME rounded `sharePercent` values printed in the legend
 * — never from the raw counts — so the picture and the numbers cannot disagree. The
 * allocation is largest-remainder over the displayed sources, so those shares total
 * exactly 100 and the ring closes.
 */
export function SourcesDonut({
  id,
  sources,
}: {
  id: string;
  sources: readonly ReportSourceComposition[];
}) {
  const active = sources.filter((source) => source.count > 0);
  if (active.length === 0) return null;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const total = active.reduce((sum, source) => sum + source.count, 0);
  const ai = active.find((source) => source.source === 'ai');

  // Each arc starts where the previous one ended, expressed as a running sum rather than
  // a mutated cursor: a closure that reassigns across a render is exactly what the
  // react-hooks/immutability rule exists to catch.
  const arcs = active.map((source, index) => {
    const length = (source.sharePercent / 100) * circumference;
    const start = active
      .slice(0, index)
      .reduce((sum, earlier) => sum + (earlier.sharePercent / 100) * circumference, 0);
    return {
      key: source.source,
      color: SOURCE_RAMP[Math.min(index, SOURCE_RAMP.length - 1)],
      dash: `${length.toFixed(1)} ${(circumference - length).toFixed(1)}`,
      offset: (-start).toFixed(1),
    };
  });

  return (
    <>
      <svg
        viewBox="0 0 240 240"
        role="img"
        aria-labelledby={`${id}-t ${id}-d`}
        className="mx-auto mt-4 block h-[168px] w-[168px]"
      >
        <title id={`${id}-t`}>Traffic sources</title>
        <desc id={`${id}-d`}>
          {`${formatCount(total)} page views split across ${active.length} sources. Every share is listed beneath this chart.`}
        </desc>
        <g fill="none" strokeWidth="30" transform="rotate(-90 120 120)">
          {arcs.map((arc) => (
            <circle
              key={arc.key}
              cx="120"
              cy="120"
              r={radius}
              stroke={arc.color}
              strokeDasharray={arc.dash}
              strokeDashoffset={arc.offset}
            />
          ))}
        </g>
        <text x="120" y="116" textAnchor="middle" fontSize="32" fontWeight="600" fill="#141A3A">
          {ai ? `${ai.sharePercent}%` : formatCount(total)}
        </text>
        <text x="120" y="136" textAnchor="middle" fontSize="10" fill="#545C70" letterSpacing=".08em">
          {ai ? 'FROM AI' : 'PAGE VIEWS'}
        </text>
      </svg>
      <dl className="mt-4 space-y-2">
        {active.map((source, index) => (
          <div key={source.source} className="flex items-center gap-2.5 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: SOURCE_RAMP[Math.min(index, SOURCE_RAMP.length - 1)] }}
              aria-hidden="true"
            />
            <dt
              className={source.source === 'ai' ? 'flex-1 font-semibold text-ob-ink' : 'flex-1 text-[#475467]'}
            >
              {source.label}
            </dt>
            <dd className="tabular-nums font-medium text-ob-ink">{formatCount(source.count)}</dd>
            <dd className="w-9 text-right tabular-nums text-ob-muted">{source.sharePercent}%</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// ---------- the engine x question matrix ----------

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

function engineName(engine: string): string {
  return ENGINE_DISPLAY_NAMES[engine] ?? engine;
}

type Mark = 'linked' | 'named' | 'absent' | 'offline';

const MARK_STYLE: Record<Mark, { className: string; glyph: string; label: string }> = {
  linked: {
    className: 'border-[#A9DDC4] bg-[#DCF3E7] text-ob-success',
    glyph: 'N+L',
    label: 'named and linked',
  },
  named: {
    className: 'border-[#C4D4F8] bg-[#E6EDFD] text-ob-accent-strong',
    glyph: 'N',
    label: 'named, not linked',
  },
  absent: {
    className: 'border-ob-border bg-[#F4F5F8] text-[#8B93A5]',
    glyph: '—',
    label: 'not named',
  },
  offline: {
    className: 'border-[#EEF1F7] bg-white text-[#8B93A5]',
    glyph: '·',
    label: 'engine not connected',
  },
};

function MarkBadge({ mark }: { mark: Mark }) {
  const style = MARK_STYLE[mark];
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${style.className}`}
    >
      <span aria-hidden="true">{style.glyph}</span>
      <span className="sr-only">{style.label}</span>
    </span>
  );
}

/**
 * [CITE$] Who got named in AI answers, as an engine x question grid.
 *
 * The inaccuracy this replaces: an engine with no API key used to be summarised as
 * "3 asked · Not connected", which claimed three questions had been put to an engine that
 * was never contacted. An unconfigured engine now reports only that it is not connected —
 * in its column, and in the totals row.
 */
export function AnswerMatrix({
  section,
  headingId,
}: {
  section: ReportAiAnswersSection;
  headingId: string;
}) {
  const engines = section.engines;
  const connected = (engine: ReportAiAnswersSection['engines'][number]) =>
    engine.status !== 'not_configured';
  const offline = engines.filter((engine) => !connected(engine));
  const askedTotal = engines.find(connected)?.asked ?? section.questions.length;
  const markFor = (
    engine: ReportAiAnswersSection['engines'][number],
    question: ReportAiAnswersSection['questions'][number],
  ): Mark => {
    if (!connected(engine)) return 'offline';
    if (question.linkedBy.includes(engine.engine)) return 'linked';
    if (question.namedBy.includes(engine.engine)) return 'named';
    return 'absent';
  };

  return (
    <section aria-labelledby={`${headingId}-ai`} className="rounded-xl border border-ob-border p-4">
      <h3 id={`${headingId}-ai`} className="text-sm font-semibold text-[#232C52]">
        Who got named in AI answers
      </h3>
      <p className="mt-1 text-[11px] text-ob-muted">
        We asked each engine your customers&rsquo; key questions through its API.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-xs">
          <thead>
            <tr className="text-ob-muted">
              <th scope="col" className="w-[46%] border-b border-ob-border pb-2 text-left text-[10px] font-normal tracking-widest">
                QUESTION
              </th>
              {engines.map((engine) => (
                <th
                  key={engine.engine}
                  scope="col"
                  className="border-b border-ob-border px-1.5 pb-2 text-center text-[10px] font-normal tracking-widest"
                >
                  {engineName(engine.engine).toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.questions.map((question) => (
              <tr key={question.question} className="border-b border-[#EEF1F7]">
                <th scope="row" className="py-2 pr-3 text-left font-normal leading-snug text-[#475467]">
                  {question.question}
                </th>
                {engines.map((engine) => (
                  <td key={engine.engine} className="px-1.5 py-2 text-center">
                    <MarkBadge mark={markFor(engine, question)} />
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 pr-3 text-left text-xs font-semibold text-ob-ink">
                {`Named · linked, of ${formatCount(askedTotal)} asked`}
              </th>
              {engines.map((engine) => (
                <td
                  key={engine.engine}
                  className={
                    connected(engine)
                      ? 'px-1.5 py-2 text-center font-semibold text-ob-ink'
                      : 'px-1.5 py-2 text-center text-[11px] leading-tight text-[#8B93A5]'
                  }
                >
                  {connected(engine)
                    ? `${formatCount(engine.named)} · ${formatCount(engine.linked)}`
                    : 'Not connected'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-ob-muted">
        {(['linked', 'named', 'absent', 'offline'] as const).map((mark) => (
          <li key={mark} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true"><MarkBadge mark={mark} /></span>
            {MARK_STYLE[mark].label}
          </li>
        ))}
      </ul>
      {offline.length > 0 ? (
        <p className="mt-2 text-[11px] text-ob-muted">
          {`${offline.map((engine) => engineName(engine.engine)).join(', ')} ${offline.length === 1 ? 'is' : 'are'} not connected on this site.`}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-5 text-ob-muted">{section.footnote}</p>
    </section>
  );
}

/** "What we published" — the report month's live posts, joined from the content queue. */
export function PublishedList({
  posts,
  headingId,
}: {
  posts: readonly ReportPublishedPost[];
  headingId: string;
}) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby={`${headingId}-posts`} className="rounded-xl border border-ob-border p-4">
      <h3 id={`${headingId}-posts`} className="text-sm font-semibold text-[#232C52]">
        What we published
      </h3>
      <p className="mt-1 text-[11px] text-ob-muted">
        {posts.length === 1 ? '1 post published this month.' : `${formatCount(posts.length)} posts published this month.`}
      </p>
      <ol className="mt-3 space-y-0">
        {posts.map((post) => (
          <li
            key={`${post.ordinal}-${post.title}`}
            className="flex items-baseline gap-2.5 border-b border-[#EEF1F7] py-2 text-xs last:border-b-0"
          >
            <span className="tabular-nums text-[11px] text-[#8B93A5]">
              {String(post.ordinal).padStart(2, '0')}
            </span>
            {post.url ? (
              <a href={post.url} className="flex-1 text-ob-accent-strong hover:underline">
                {post.title}
              </a>
            ) : (
              <span className="flex-1 text-[#475467]">{post.title}</span>
            )}
            {post.publishedAt ? (
              <span className="shrink-0 text-[11px] whitespace-nowrap text-ob-muted">
                {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
                  .format(new Date(post.publishedAt))
                  .toUpperCase()}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export type { ReportSeriesMonth };
