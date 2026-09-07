/**
 * [SERIES$] The monthly performance email.
 *
 * Three rules govern every line of markup below, and they are the reason this file looks
 * the way it does rather than like ordinary HTML.
 *
 * 1. NO `<svg>`, NO `<img>`. Gmail (web and both apps) strips `<svg>` outright, and
 *    Outlook on Windows renders through Word, which has never supported it. A raster
 *    chart is worse: images are blocked by default in a large share of clients, so the
 *    chart would simply be missing, and a PNG cannot respond to a client's forced dark
 *    mode. Every chart here is therefore built from coloured table cells, which always
 *    render, need no network request, and invert correctly.
 *
 * 2. EVERY CHART IS REDUNDANT. Each bar prints its number beside or beneath it. A client
 *    that flattens colour, or a reader who cannot distinguish two blues, loses nothing.
 *
 * 3. EVERY TEXT-BEARING CELL CARRIES ITS OWN `background` AND `color`. Apple Mail and
 *    Outlook.com invert light palettes algorithmically; a cell that inherited its ink ends
 *    up dark-on-dark. Saturated `#2d63f0` / `#0037a0` survive inversion, the pale
 *    `#f6f8fc` grounds are the ones that flip, so ink is stated everywhere rather than
 *    inherited. The `<head>` declares `color-scheme` so clients that support a real dark
 *    palette use it instead of guessing.
 *
 * The layout is 640px wide with a 2x2 KPI grid. There is no `<style>` block and therefore
 * nowhere to put a media query, so the layout has to hold at 320px without one.
 */
import {
  v2Metrics,
  type MonthlyPerformanceReport,
  type MonthlyReportEmailMessage,
  type ReportAiAnswerEngine,
  type ReportAiAnswersSection,
  type ReportMetric,
  type ReportPublishedPost,
  type ReportSeriesSection,
  type ReportSourceComposition,
} from './types';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

const NUMBER = new Intl.NumberFormat('en-US');

/**
 * The one width the whole document agrees on. Cited by a test, not just by the markup.
 *
 * It is a MAXIMUM, not a fixed width. A hard `width:640px` overflows a 390px phone
 * horizontally — the 2x2 KPI grid holds at 320px, but only if the card it sits in is
 * allowed to shrink around it. Outlook on Windows ignores `max-width`, so the ghost table
 * below (an `mso` conditional comment, invisible to every other client) pins the width
 * back to 640 there and nowhere else.
 */
export const REPORT_EMAIL_WIDTH_PX = 640;

const MSO_OPEN = `<!--[if mso]><table role="presentation" width="${REPORT_EMAIL_WIDTH_PX}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->`;
const MSO_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->';
/** `width:100%` up to the cap: fills a phone, stops at 640 on a desktop client. */
const CARD_WIDTH_STYLE = `width:100%;max-width:${REPORT_EMAIL_WIDTH_PX}px`;

const INK = '#141a3a';
const GRAY = '#545c70';
const MUTED = '#6a7286';
const FAINT = '#8b93a5';
const CARD = '#f6f8fc';
const PAGE = '#f6f7f9';
const WHITE = '#ffffff';
const BORDER = '#e4e9f2';
const HAIRLINE = '#eef1f7';
const BLUE = '#2d63f0';
const LINK = '#1e4bd1';
const UP = '#0b6e4f';
const DOWN = '#b42318';

/** Oldest to newest. A positional ramp, so the newest month reads as the loudest bar. */
const SPARK_RAMP = ['#c3cee8', '#c3cee8', '#a8bef2', '#7d9df4', '#4d7cff', '#2d63f0'] as const;
/** Composition ramp, darkest first, applied in the source display order. */
const SOURCE_RAMP = ['#0037a0', '#2d63f0', '#4d7cff', '#8fa9ee', '#c3cee8'] as const;
const WEEK_SERIES_COLORS = ['#0037a0', BLUE, '#8fa9ee'] as const;

const SPARK_HEIGHT_PX = 26;
const WEEK_HEIGHT_PX = 88;

/**
 * At 640px minus padding there is room for a question column plus about five engine
 * columns before the marks start wrapping. Extra engines fall back to the summary list.
 */
const MATRIX_MAX_ENGINES = 5;
/** Longer months are summarised with a "and N more" line rather than a wall of rows. */
const PUBLISHED_ROW_LIMIT = 6;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case "'": return '&#39;';
      case '"': return '&quot;';
      default: return character;
    }
  });
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function monthNameFrom(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`))
    .toUpperCase();
}

function dayLabel(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(parsed)
    .toUpperCase();
}

function comparisonLabel(metric: ReportMetric): string {
  if (metric.previous === 0 && metric.current > 0) return 'Newly measured';
  if (metric.previous === 0) return 'No comparison data';
  if (metric.changePercent === 0) return 'No change from last month';
  if ((metric.changePercent ?? 0) > 0) return `${metric.changePercent}% above last month`;
  return `${Math.abs(metric.changePercent ?? 0)}% below last month`;
}

/**
 * The delta line under a KPI numeral.
 *
 * The arrow is a text glyph, never an image, and the baseline it is measured against is
 * printed next to it — "+19%" alone is a claim, "+19% vs 931" is a number the customer can
 * check against last month's email.
 */
function deltaHtml(metric: ReportMetric): string {
  if (metric.previous === 0) {
    const label = metric.current > 0 ? 'Newly measured' : 'No comparison data';
    return `<p style="margin:4px 0 0;font-size:12.5px;background:${CARD};color:${GRAY}">${label}</p>`;
  }
  const previous = NUMBER.format(metric.previous);
  if (metric.changePercent === 0) {
    return `<p style="margin:4px 0 0;font-size:12.5px;background:${CARD};color:${GRAY}">No change <span style="color:${GRAY}">vs ${previous}</span></p>`;
  }
  const up = (metric.changePercent ?? 0) > 0;
  const color = up ? UP : DOWN;
  const arrow = up ? '&#9650;' : '&#9660;';
  const percent = Math.abs(metric.changePercent ?? 0);
  return `<p style="margin:4px 0 0;font-size:12.5px;font-weight:600;background:${CARD};color:${color}">${arrow} ${percent}% <span style="color:${GRAY};font-weight:400">vs ${previous}</span></p>`;
}

/**
 * A six-cell sparkline made of bottom-aligned table cells.
 *
 * Bars are scaled against the largest point, and any non-zero month gets at least 3px so a
 * quiet month is visibly present rather than indistinguishable from a month with no data.
 * The caption beneath prints the first and last values, which is what makes the picture
 * redundant.
 */
function sparklineHtml(values: readonly number[]): string {
  if (values.length === 0) return '';
  const peak = Math.max(...values, 0);
  const cells = values.map((value, index) => {
    const height = peak > 0 && value > 0
      ? Math.max(3, Math.round((value / peak) * SPARK_HEIGHT_PX))
      : 1;
    const color = value > 0
      ? SPARK_RAMP[Math.min(SPARK_RAMP.length - 1, Math.max(0, SPARK_RAMP.length - values.length + index))]
      : BORDER;
    const gap = index < values.length - 1 ? '<td style="width:5px"></td>' : '';
    return `<td style="width:14px;height:${SPARK_HEIGHT_PX}px;vertical-align:bottom"><div style="height:${height}px;background:${color};border-radius:2px;font-size:1px;line-height:1px">&nbsp;</div></td>${gap}`;
  }).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;border-collapse:collapse"><tr>${cells}</tr></table>`;
}

interface KpiInput {
  label: string;
  metric: ReportMetric;
  /** Oldest-first monthly totals for this KPI, or an empty array when there is no series. */
  points: readonly number[];
  months: readonly string[];
}

function kpiTileHtml(input: KpiInput): string {
  const caption = input.points.length >= 2
    ? `<p style="margin:6px 0 0;font-size:10.5px;letter-spacing:.05em;background:${CARD};color:${MUTED}">${monthNameFrom(input.months[0])} &rarr; ${monthNameFrom(input.months[input.months.length - 1])} &middot; ${NUMBER.format(input.points[0])} to ${NUMBER.format(input.points[input.points.length - 1])}</p>`
    : '';
  return `<td width="50%" style="padding:6px;background:${WHITE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:11px"><tr><td style="padding:14px 15px;background:${CARD};color:${INK}"><p style="margin:0;font-size:11px;letter-spacing:.09em;text-transform:uppercase;background:${CARD};color:${GRAY}">${escapeHtml(input.label)}</p><p style="margin:5px 0 0;font-size:31px;line-height:1.06;font-weight:700;letter-spacing:-.02em;background:${CARD};color:${INK}">${NUMBER.format(input.metric.current)}</p>${deltaHtml(input.metric)}${sparklineHtml(input.points)}${caption}</td></tr></table></td>`;
}

// ---------- traffic sources ----------

function sourcesHtml(sources: readonly ReportSourceComposition[], totalViews: number): string {
  const active = sources.filter((source) => source.count > 0);
  const heading = `<h2 style="margin:0;font-size:16px;font-weight:700;background:${WHITE};color:${INK}">Traffic sources</h2>`;
  if (active.length === 0) {
    return `${heading}<p style="margin:5px 0 0;font-size:12.5px;background:${WHITE};color:${GRAY}">No traffic has been measured yet.</p>`;
  }
  const colorOf = (index: number) => SOURCE_RAMP[Math.min(index, SOURCE_RAMP.length - 1)];
  // The share allocation is largest-remainder over the DISPLAYED sources, so these widths
  // total exactly 100 and the bar can never leave a gap at its right edge.
  const segments = active.map((source, index) =>
    `<td width="${source.sharePercent}%" style="height:22px;background:${colorOf(index)};font-size:1px;line-height:1px">&nbsp;</td>`).join('');
  const rows = active.map((source, index) => {
    const last = index === active.length - 1;
    const edge = last ? '' : `border-bottom:1px solid ${HAIRLINE};`;
    const emphasis = source.source === 'ai' ? 'font-weight:600;' : '';
    return `<tr><td style="padding:7px 0;${edge}background:${WHITE};color:${INK}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:11px;height:11px;background:${colorOf(index)};border-radius:3px;font-size:1px;line-height:1px">&nbsp;</td><td style="padding-left:10px;background:${WHITE};color:${INK};${emphasis}">${escapeHtml(source.label)}</td></tr></table></td><td align="right" style="padding:7px 0;${edge}font-weight:600;background:${WHITE};color:${INK}">${NUMBER.format(source.count)} <span style="color:${GRAY};font-weight:400">&middot; ${source.sharePercent}%</span></td></tr>`;
  }).join('');
  return `${heading}<p style="margin:5px 0 0;font-size:12.5px;background:${WHITE};color:${GRAY}">${NUMBER.format(totalViews)} page views, by where the visitor came from.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:13px;border-collapse:collapse;border-radius:6px;overflow:hidden"><tr>${segments}</tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-size:13.5px;background:${WHITE};color:${INK}">${rows}</table>`;
}

// ---------- weekly bars ----------

/**
 * Calls / directions / inquiries, by ISO week of the report month.
 *
 * Every week prints its three values underneath, in the legend's order, so the grouped
 * bars are decoration over a printed table rather than the only carrier of the numbers.
 */
function weeklyHtml(series: ReportSeriesSection | undefined): string {
  const weeks = series?.weeks ?? [];
  if (weeks.length === 0) return '';
  const peak = Math.max(
    ...weeks.map((week) => Math.max(week.calls, week.directions, week.inquiries)),
    0,
  );
  if (peak === 0) return '';
  const width = `${Math.floor(100 / weeks.length)}%`;
  const columns = weeks.map((week, index) => {
    const values = [week.calls, week.directions, week.inquiries];
    const bars = values.map((value, series_index) => {
      const height = value > 0 ? Math.max(3, Math.round((value / peak) * WEEK_HEIGHT_PX)) : 1;
      const color = value > 0 ? WEEK_SERIES_COLORS[series_index] : BORDER;
      const gap = series_index < values.length - 1 ? '<td style="width:4px"></td>' : '';
      return `<td style="width:17px;height:${WEEK_HEIGHT_PX}px;vertical-align:bottom"><div style="height:${height}px;background:${color};border-radius:3px 3px 0 0;font-size:1px;line-height:1px">&nbsp;</div></td>${gap}`;
    }).join('');
    // `top`, not `bottom`: the bars are already bottom-aligned inside their own
    // fixed-height cells, and bottom-aligning the COLUMN would lift the label of any week
    // whose printed values wrapped to a second line above its neighbours'.
    return `<td width="${width}" align="center" style="vertical-align:top;padding:0 4px;background:${WHITE}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${bars}</tr></table><p style="margin:7px 0 0;font-size:10.5px;letter-spacing:.06em;background:${WHITE};color:${GRAY}">WEEK ${index + 1}</p><p style="margin:2px 0 0;font-size:11px;background:${WHITE};color:${MUTED}">${values.map((value) => NUMBER.format(value)).join(' &middot; ')}</p></td>`;
  }).join('');
  const legend = ['Calls', 'Directions', 'Inquiries'].map((label, index) =>
    `<span style="color:${WEEK_SERIES_COLORS[index]};font-weight:700">&#9632;</span> ${label}`).join(' &nbsp; ');
  return `<h2 style="margin:0;font-size:16px;font-weight:700;background:${WHITE};color:${INK}">When they got in touch</h2><p style="margin:5px 0 0;font-size:12.5px;background:${WHITE};color:${GRAY}">Calls, directions and inquiries, by week.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr>${columns}</tr></table><p style="margin:12px 0 0;font-size:11.5px;background:${WHITE};color:${GRAY}">${legend}</p>`;
}

// ---------- AI answers ----------

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  openai: 'ChatGPT',
  anthropic: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

function engineName(engine: string): string {
  return ENGINE_DISPLAY_NAMES[engine] ?? engine;
}

/** An engine with no API key was never asked anything, so it has no counts to state. */
function connected(engine: ReportAiAnswerEngine): boolean {
  return engine.status !== 'not_configured';
}

function markHtml(kind: 'linked' | 'named' | 'absent' | 'offline'): string {
  const style = 'display:inline-block;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:700';
  switch (kind) {
    case 'linked':
      return `<span style="${style};background:#dcf3e7;color:${UP};border:1px solid #a9ddc4">N+L</span>`;
    case 'named':
      return `<span style="${style};background:#e6edfd;color:${LINK};border:1px solid #c4d4f8">N</span>`;
    case 'absent':
      return `<span style="${style};background:#f4f5f8;color:${FAINT};border:1px solid ${BORDER}">&mdash;</span>`;
    default:
      return `<span style="${style};background:${WHITE};color:${FAINT};border:1px solid ${HAIRLINE}">&middot;</span>`;
  }
}

function markFor(
  engine: ReportAiAnswerEngine,
  namedBy: readonly string[],
  linkedBy: readonly string[],
): 'linked' | 'named' | 'absent' | 'offline' {
  if (!connected(engine)) return 'offline';
  if (linkedBy.includes(engine.engine)) return 'linked';
  if (namedBy.includes(engine.engine)) return 'named';
  return 'absent';
}

/**
 * [CITE$] "Who got named in AI answers", pivoted into an engine x question matrix.
 *
 * This needs no new data: `namedBy` / `linkedBy` already hold engine slugs and used to
 * render as a list of sentences.
 *
 * The inaccuracy this replaces: the old engine row printed `${asked} asked` for EVERY
 * engine, including ones with no API key — so a site with no Gemini key read "3 asked ·
 * Not connected", claiming three questions had been put to an engine that was never
 * contacted. An unconfigured engine now states only that it is not connected, in the
 * matrix cells and in the totals row alike.
 */
function aiAnswersHtml(section: ReportAiAnswersSection | undefined): string {
  if (!section) return '';
  const heading = `<h2 style="margin:0;font-size:16px;font-weight:700;background:${WHITE};color:${INK}">Who got named in AI answers</h2>`;
  const footnote = `<p style="margin:9px 0 0;font-size:11px;line-height:1.6;background:${WHITE};color:${MUTED}">${escapeHtml(section.footnote)}</p>`;
  const offline = section.engines.filter((engine) => !connected(engine));
  const offlineNote = offline.length > 0
    ? ` ${escapeHtml(offline.map((engine) => engineName(engine.engine)).join(', '))} ${offline.length === 1 ? 'is' : 'are'} not connected on this site.`
    : '';

  const engines = section.engines.slice(0, MATRIX_MAX_ENGINES);
  if (engines.length === 0 || section.questions.length === 0) {
    // No questions to pivot on: state each engine's totals, and nothing more for one
    // that was never asked.
    const rows = section.engines.map((engine) => {
      const value = connected(engine)
        ? `${NUMBER.format(engine.asked)} asked &middot; ${NUMBER.format(engine.named)} named &middot; ${NUMBER.format(engine.linked)} linked`
        : 'Not connected';
      const color = connected(engine) ? INK : FAINT;
      return `<tr><td style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};background:${WHITE};color:${INK}">${escapeHtml(engineName(engine.engine))}</td><td align="right" style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};font-weight:600;background:${WHITE};color:${color}">${value}</td></tr>`;
    }).join('');
    return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-size:13px;border-collapse:collapse;background:${WHITE};color:${INK}">${rows}</table>${footnote}`;
  }

  /**
   * Explicit widths, because `table-layout:auto` on a 390px phone hands the mark columns
   * far more room than three characters need and squeezes the question column down to one
   * word per line. 46/54 leaves the question the majority at every width.
   */
  const engineColumnWidth = Math.floor(54 / engines.length);
  const headerCells = engines.map((engine) =>
    // `word-break` matters at 390px with four engines: "PERPLEXITY" is wider than its
    // column, and without it the label spills across the neighbouring header instead of
    // wrapping inside its own cell.
    `<th style="padding:0 4px 8px;font-size:10px;letter-spacing:.06em;font-weight:400;width:${engineColumnWidth}%;word-break:break-word;border-bottom:1px solid ${BORDER};background:${WHITE};color:${GRAY}">${escapeHtml(engineName(engine.engine).toUpperCase())}</th>`).join('');
  const questionRows = section.questions.map((question, index) => {
    const last = index === section.questions.length - 1;
    const edge = last ? '' : `border-bottom:1px solid ${HAIRLINE};`;
    const cells = engines.map((engine) =>
      `<td align="center" style="padding:8px 4px;${edge}background:${WHITE};color:${INK}">${markHtml(markFor(engine, question.namedBy, question.linkedBy))}</td>`).join('');
    return `<tr><td style="padding:8px 4px;${edge}line-height:1.4;background:${WHITE};color:${INK}">${escapeHtml(question.question)}</td>${cells}</tr>`;
  }).join('');
  const totalCells = engines.map((engine) => (
    connected(engine)
      ? `<td align="center" style="padding:8px 4px;font-weight:600;background:${WHITE};color:${INK}">${NUMBER.format(engine.named)} &middot; ${NUMBER.format(engine.linked)}</td>`
      : `<td align="center" style="padding:8px 4px;background:${WHITE};color:${FAINT}">${markHtml('offline')}</td>`
  )).join('');
  const askedTotal = engines.find(connected)?.asked ?? section.questions.length;
  const totalsRow = `<tr><td style="padding:8px 4px;font-weight:600;background:${WHITE};color:${INK}">Named &middot; linked, of ${NUMBER.format(askedTotal)} asked</td>${totalCells}</tr>`;
  const key = `<p style="margin:11px 0 0;font-size:11.5px;line-height:1.6;background:${WHITE};color:${GRAY}"><b style="color:${UP}">N+L</b> named and linked &nbsp;&middot;&nbsp; <b style="color:${LINK}">N</b> named, not linked &nbsp;&middot;&nbsp; <b style="color:${INK}">&mdash;</b> not named.${offlineNote}</p>`;

  /**
   * `table-layout:fixed` is what makes those widths binding. Under the default `auto`
   * layout they are a hint the browser is free to ignore, and on a 390px phone it does:
   * the mark columns take their content width and the question column collapses to about
   * one word per line. Fixed layout honours the declared 46/54 split at every width.
   */
  return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;font-size:12.5px;table-layout:fixed;border-collapse:collapse;background:${WHITE};color:${INK}"><tr><th align="left" style="padding:0 4px 8px;font-size:10px;letter-spacing:.1em;font-weight:400;width:46%;border-bottom:1px solid ${BORDER};background:${WHITE};color:${GRAY}">QUESTION</th>${headerCells}</tr>${questionRows}${totalsRow}</table>${key}${footnote}`;
}

function aiAnswersText(section: ReportAiAnswersSection | undefined): string[] {
  if (!section) return [];
  return [
    '',
    'Who got named in AI answers',
    ...section.engines.map((engine) => (
      connected(engine)
        // The unconfigured branch prints no `asked` count: it was never asked.
        ? `${engineName(engine.engine)}: ${NUMBER.format(engine.asked)} asked, ${NUMBER.format(engine.named)} named, ${NUMBER.format(engine.linked)} linked`
        : `${engineName(engine.engine)}: not connected`
    )),
    ...section.questions.map((question) => {
      const named = question.namedBy.length > 0
        ? `named by ${question.namedBy.map(engineName).join(', ')}`
        : 'not named';
      const linked = question.linkedBy.length > 0
        ? `, linked by ${question.linkedBy.map(engineName).join(', ')}`
        : '';
      return `- ${question.question} (${named}${linked})`;
    }),
    section.footnote,
  ];
}

// ---------- what we published ----------

function publishedHtml(posts: readonly ReportPublishedPost[]): string {
  if (posts.length === 0) return '';
  const shown = posts.slice(0, PUBLISHED_ROW_LIMIT);
  const remainder = posts.length - shown.length;
  const rows = shown.map((post, index) => {
    const last = index === shown.length - 1 && remainder === 0;
    const edge = last ? '' : `border-bottom:1px solid ${HAIRLINE};`;
    const url = post.url ? safeHttpUrl(post.url) : null;
    const title = escapeHtml(post.title);
    const titleHtml = url
      ? `<a href="${escapeHtml(url)}" style="color:${LINK};text-decoration:none">${title}</a>`
      : `<span style="color:${INK}">${title}</span>`;
    const date = post.publishedAt ? dayLabel(post.publishedAt) : '';
    return `<tr><td style="padding:8px 0;${edge}line-height:1.45;background:${WHITE};color:${INK}"><span style="color:${FAINT};font-size:11px">${String(post.ordinal).padStart(2, '0')}</span> &nbsp;${titleHtml}</td><td align="right" style="padding:8px 0;${edge}font-size:11px;white-space:nowrap;background:${WHITE};color:${MUTED}">${escapeHtml(date)}</td></tr>`;
  }).join('');
  const more = remainder > 0
    ? `<tr><td style="padding:8px 0;line-height:1.45;background:${WHITE};color:${MUTED}">and ${NUMBER.format(remainder)} more</td><td align="right" style="padding:8px 0;background:${WHITE};color:${MUTED}">&nbsp;</td></tr>`
    : '';
  const count = posts.length === 1 ? '1 post published this month.' : `${NUMBER.format(posts.length)} posts published this month.`;
  return `<h2 style="margin:0;font-size:16px;font-weight:700;background:${WHITE};color:${INK}">What we published</h2><p style="margin:5px 0 0;font-size:12.5px;background:${WHITE};color:${GRAY}">${count}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;font-size:13px;background:${WHITE};color:${INK}">${rows}${more}</table>`;
}

/** A section wrapper, so a missing section leaves no empty padded row behind. */
function block(html: string, padding: string): string {
  if (!html) return '';
  return `<tr><td style="padding:${padding};background:${WHITE}">${html}</td></tr>`;
}

export function buildMonthlyReportEmail(input: {
  siteName: string;
  dashboardUrl: string;
  report: MonthlyPerformanceReport;
  /**
   * [SERIES$] Joined at send time from the content queue, never stored on the report.
   * Omitted or empty drops the whole "What we published" section.
   */
  publishedPosts?: readonly ReportPublishedPost[];
}): MonthlyReportEmailMessage {
  const siteName = input.siteName.trim() || 'Website';
  const safeSiteName = escapeHtml(siteName);
  const dashboardUrl = safeHttpUrl(input.dashboardUrl);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${input.report.period.month}-01T00:00:00Z`));
  const metrics = input.report.metrics;
  const connectorMetrics = v2Metrics(input.report);
  const aiAnswers = input.report.schemaVersion === 2 ? input.report.aiAnswers : undefined;
  const series = input.report.schemaVersion === 2 ? input.report.series : undefined;
  const publishedPosts = input.publishedPosts ?? [];

  const seriesMonths = series?.months ?? [];
  const monthKeys = seriesMonths.map((point) => point.month);
  // A one-point series is a straight line that says nothing; two is the minimum that can
  // show direction, and it is also the minimum the caption needs to read "X to Y".
  const hasSeries = seriesMonths.length >= 2;
  const pointsOf = (pick: (month: (typeof seriesMonths)[number]) => number): number[] =>
    (hasSeries ? seriesMonths.map(pick) : []);

  const fourthLabel = connectorMetrics ? 'Inquiry actions' : 'Bookings';
  const fourthMetric = connectorMetrics
    ? connectorMetrics.consultationActions
    : metrics.reservationClicks;
  const kpis: KpiInput[] = [
    { label: 'Page views', metric: metrics.pageviews, points: pointsOf((month) => month.pageviews), months: monthKeys },
    { label: 'Calls', metric: metrics.phoneClicks, points: pointsOf((month) => month.calls), months: monthKeys },
    { label: 'Directions', metric: metrics.directionsClicks, points: pointsOf((month) => month.directions), months: monthKeys },
    {
      label: fourthLabel,
      metric: fourthMetric,
      points: connectorMetrics ? pointsOf((month) => month.inquiries) : [],
      months: monthKeys,
    },
  ];

  const totalViews = input.report.sources.reduce((sum, source) => sum + source.count, 0);
  const supportingActions = connectorMetrics
    ? `Chat clicks ${NUMBER.format(connectorMetrics.chatClicks.current)} · Form submissions ${NUMBER.format(metrics.formSubmissions.current)} · Booking clicks ${NUMBER.format(metrics.reservationClicks.current)} · Instagram clicks ${NUMBER.format(connectorMetrics.instagramClicks.current)}`
    : `Form submissions ${NUMBER.format(metrics.formSubmissions.current)} · ${comparisonLabel(metrics.formSubmissions)}`;

  const comparisonNotice = input.report.hasComparisonData
    ? ''
    : `<tr><td style="padding:18px 30px 0;background:${WHITE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CARD};border:1px solid ${BORDER};border-radius:11px"><tr><td style="padding:13px 15px;font-size:13px;line-height:1.55;background:${CARD};color:${GRAY}">This is the first report. Starting this month, we will collect data for month-over-month comparisons.</td></tr></table></td></tr>`;

  const dashboardLink = dashboardUrl
    ? `<tr><td style="padding:26px 30px 30px;background:${WHITE}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${BLUE};border-radius:9px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:13px 24px;font-size:14.5px;font-weight:600;color:${WHITE};text-decoration:none">View the full report</a></td></tr></table></td></tr>`
    : `<tr><td style="padding:0 30px 30px;background:${WHITE}">&nbsp;</td></tr>`;

  const subject = `[Anaks Labs] ${siteName} — ${monthLabel} performance report`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${safeSiteName} &mdash; ${escapeHtml(monthLabel)}</title></head><body style="margin:0;padding:0;background:${PAGE};color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"><div style="background:${PAGE};padding:26px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE}"><tr><td align="center" style="background:${PAGE}">${MSO_OPEN}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CARD_WIDTH_STYLE};background:${WHITE};border-radius:14px;border:1px solid ${BORDER}">`
    + `<tr><td style="padding:28px 30px 0;background:${WHITE}"><p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.04em;background:${WHITE};color:${BLUE}">${PUBLIC_BRAND_NAMES.brand} monthly performance report</p><h1 style="margin:9px 0 0;font-size:26px;line-height:1.18;font-weight:700;letter-spacing:-.02em;background:${WHITE};color:${INK}">${safeSiteName} &mdash; ${escapeHtml(monthLabel)}</h1><p style="margin:8px 0 0;font-size:13.5px;line-height:1.55;background:${WHITE};color:${GRAY}">Visits are measured as page views, not unique visitors.</p></td></tr>`
    + comparisonNotice
    + `<tr><td style="padding:22px 24px 0;background:${WHITE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${kpiTileHtml(kpis[0])}${kpiTileHtml(kpis[1])}</tr><tr>${kpiTileHtml(kpis[2])}${kpiTileHtml(kpis[3])}</tr></table></td></tr>`
    + `<tr><td style="padding:20px 30px 0;background:${WHITE}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e6edfd;border:1px solid #c4d4f8;border-radius:11px"><tr><td style="padding:16px 18px;font-size:16px;line-height:1.42;font-weight:600;background:#e6edfd;color:#173b9e">${escapeHtml(input.report.insight)}</td></tr></table></td></tr>`
    + block(sourcesHtml(input.report.sources, totalViews), '26px 30px 0')
    + `<tr><td style="padding:16px 30px 0;font-size:13px;line-height:1.6;background:${WHITE};color:${GRAY}">${escapeHtml(supportingActions)}</td></tr>`
    + block(weeklyHtml(series), '26px 30px 0')
    + block(aiAnswersHtml(aiAnswers), '26px 30px 0')
    + block(publishedHtml(publishedPosts), '26px 30px 0')
    + dashboardLink
    + `</table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CARD_WIDTH_STYLE};background:${PAGE}"><tr><td style="padding:16px 30px 8px;font-size:11.5px;line-height:1.6;background:${PAGE};color:${MUTED}">This report uses only anonymous aggregate measurements collected for the website. It does not guarantee search rankings or business results.</td></tr></table>${MSO_CLOSE}</td></tr></table></div></body></html>`;

  const activeSources = input.report.sources.filter((source) => source.count > 0);
  const sourceText = activeSources.length > 0
    ? activeSources.map((source) => `${source.label} ${NUMBER.format(source.count)} (${source.sharePercent}%)`).join(', ')
    : 'No measured traffic';
  const seriesText = hasSeries
    ? [
        '',
        `Last ${seriesMonths.length} months (${monthKeys[0]} to ${monthKeys[monthKeys.length - 1]}):`,
        `Page views: ${seriesMonths.map((month) => NUMBER.format(month.pageviews)).join(' → ')}`,
        `Calls: ${seriesMonths.map((month) => NUMBER.format(month.calls)).join(' → ')}`,
        `Directions: ${seriesMonths.map((month) => NUMBER.format(month.directions)).join(' → ')}`,
        ...(connectorMetrics
          ? [`Inquiry actions: ${seriesMonths.map((month) => NUMBER.format(month.inquiries)).join(' → ')}`]
          : []),
      ]
    : [];
  const weeklyText = (series?.weeks.length ?? 0) > 0
    ? [
        '',
        'When they got in touch (calls · directions · inquiries):',
        ...(series?.weeks ?? []).map((week, index) =>
          `Week ${index + 1} (${week.startDate} to ${week.endDate}): ${NUMBER.format(week.calls)} · ${NUMBER.format(week.directions)} · ${NUMBER.format(week.inquiries)}`),
      ]
    : [];
  const publishedText = publishedPosts.length > 0
    ? [
        '',
        'What we published',
        ...publishedPosts.map((post) =>
          `- ${post.title}${post.url ? ` (${post.url})` : ''}`),
      ]
    : [];

  const text = [
    `${siteName} — ${monthLabel} performance`,
    'Visits are measured as page views, not unique visitors.',
    ...(input.report.hasComparisonData
      ? []
      : ['This is the first report. Starting this month, we will collect data for month-over-month comparisons.']),
    '',
    `Page views: ${NUMBER.format(metrics.pageviews.current)} · ${comparisonLabel(metrics.pageviews)}`,
    `Calls: ${NUMBER.format(metrics.phoneClicks.current)} · ${comparisonLabel(metrics.phoneClicks)}`,
    `Directions: ${NUMBER.format(metrics.directionsClicks.current)} · ${comparisonLabel(metrics.directionsClicks)}`,
    `${fourthLabel}: ${NUMBER.format(fourthMetric.current)} · ${comparisonLabel(fourthMetric)}`,
    supportingActions,
    '',
    `Insight: ${input.report.insight}`,
    `Traffic sources: ${sourceText}`,
    ...seriesText,
    ...weeklyText,
    ...aiAnswersText(aiAnswers),
    ...publishedText,
    ...(dashboardUrl ? ['', `View details: ${dashboardUrl}`] : []),
    '',
    'This report uses anonymous aggregate measurements and does not guarantee search rankings or business results.',
  ].join('\n');
  return { subject, html, text };
}
