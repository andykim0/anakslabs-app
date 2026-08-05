import {
  v2Metrics,
  type MonthlyPerformanceReport,
  type MonthlyReportEmailMessage,
  type ReportMetric,
} from './types';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

const NUMBER = new Intl.NumberFormat('en-US');

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

function comparisonLabel(metric: ReportMetric): string {
  if (metric.previous === 0 && metric.current > 0) return 'Newly measured';
  if (metric.previous === 0) return 'No comparison data';
  if (metric.changePercent === 0) return 'No change from last month';
  if ((metric.changePercent ?? 0) > 0) return `${metric.changePercent}% above last month`;
  return `${Math.abs(metric.changePercent ?? 0)}% below last month`;
}

function metricCard(label: string, metric: ReportMetric): string {
  return `<td style="width:25%;padding:10px;vertical-align:top"><div style="border:1px solid #dfe1e6;border-radius:14px;padding:16px;background:#f6f7f9"><div style="font-size:13px;color:#545c70">${label}</div><div style="margin-top:8px;font-size:26px;font-weight:750;color:#141a3a">${NUMBER.format(metric.current)}</div><div style="margin-top:6px;font-size:11px;color:#6a7286">${comparisonLabel(metric)}</div></div></td>`;
}

export function buildMonthlyReportEmail(input: {
  siteName: string;
  dashboardUrl: string;
  report: MonthlyPerformanceReport;
}): MonthlyReportEmailMessage {
  const siteName = input.siteName.trim() || 'Website';
  const safeSiteName = escapeHtml(siteName);
  const dashboardUrl = safeHttpUrl(input.dashboardUrl);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${input.report.period.month}-01T00:00:00Z`));
  const metrics = input.report.metrics;
  const connectorMetrics = v2Metrics(input.report);
  const activeSources = input.report.sources.filter((source) => source.count > 0);
  const sourceRows = activeSources.length > 0
    ? activeSources.map((source) => `<tr><td style="padding:7px 0;color:#232c52">${escapeHtml(source.label)}</td><td style="padding:7px 0;text-align:right;color:#141a3a;font-weight:650">${NUMBER.format(source.count)} · ${source.sharePercent}%</td></tr>`).join('')
    : '<tr><td style="padding:7px 0;color:#6a7286">No traffic has been measured yet.</td></tr>';
  const dashboardLink = dashboardUrl
    ? `<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#2d63f0;color:#fff;text-decoration:none;font-weight:700">View the full report</a>`
    : '';
  const comparisonNotice = input.report.hasComparisonData
    ? ''
    : '<div style="margin-top:18px;border:1px solid #dfe1e6;border-radius:12px;padding:13px 15px;color:#545c70;font-size:13px">This is the first report. Starting this month, we will collect data for month-over-month comparisons.</div>';
  const fourthHeadline = connectorMetrics
    ? metricCard('Inquiry actions', connectorMetrics.consultationActions)
    : metricCard('Bookings', metrics.reservationClicks);
  const supportingActions = connectorMetrics
    ? `Chat clicks ${NUMBER.format(connectorMetrics.chatClicks.current)} · Form submissions ${NUMBER.format(metrics.formSubmissions.current)} · Booking clicks ${NUMBER.format(metrics.reservationClicks.current)} · Instagram clicks ${NUMBER.format(connectorMetrics.instagramClicks.current)}`
    : `Form submissions ${NUMBER.format(metrics.formSubmissions.current)} · ${comparisonLabel(metrics.formSubmissions)}`;

  const subject = `[Anaks Labs] ${siteName} — ${monthLabel} performance report`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#141a3a"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="border-radius:22px;background:#fff;padding:30px;box-shadow:0 12px 36px rgba(20,55,95,.08)"><div style="font-size:13px;font-weight:750;color:#1e4bd1">${PUBLIC_BRAND_NAMES.brand} monthly performance report</div><h1 style="margin:10px 0 4px;font-size:25px;line-height:1.35">${safeSiteName} — ${monthLabel}</h1><p style="margin:0;color:#6a7286;font-size:13px">Visits are measured as page views, not unique visitors.</p>${comparisonNotice}<table role="presentation" style="width:100%;margin:20px -10px 0;border-collapse:separate"><tr>${metricCard('Page views', metrics.pageviews)}${metricCard('Calls', metrics.phoneClicks)}${metricCard('Directions', metrics.directionsClicks)}${fourthHeadline}</tr></table><div style="margin-top:20px;border-radius:14px;background:#eaeffe;padding:17px 18px;font-size:16px;font-weight:700;color:#2d63f0">${escapeHtml(input.report.insight)}</div><h2 style="margin:26px 0 8px;font-size:17px">Traffic sources</h2><table style="width:100%;border-collapse:collapse;font-size:14px">${sourceRows}</table><p style="margin:20px 0 0;color:#545c70;font-size:13px">${escapeHtml(supportingActions)}</p><div style="margin-top:26px">${dashboardLink}</div></div><p style="margin:16px 6px 0;color:#6a7286;font-size:11px;line-height:1.6">This report uses only anonymous aggregate measurements collected for the website. It does not guarantee search rankings or business results.</p></div></body></html>`;

  const sourceText = activeSources.length > 0
    ? activeSources.map((source) => `${source.label} ${NUMBER.format(source.count)} (${source.sharePercent}%)`).join(', ')
    : 'No measured traffic';
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
    ...(connectorMetrics
      ? [
          `Inquiry actions: ${NUMBER.format(connectorMetrics.consultationActions.current)} · ${comparisonLabel(connectorMetrics.consultationActions)}`,
          supportingActions,
        ]
      : [
          `Bookings: ${NUMBER.format(metrics.reservationClicks.current)} · ${comparisonLabel(metrics.reservationClicks)}`,
          supportingActions,
        ]),
    '',
    `Insight: ${input.report.insight}`,
    `Traffic sources: ${sourceText}`,
    ...(dashboardUrl ? ['', `View details: ${dashboardUrl}`] : []),
    '',
    'This report uses anonymous aggregate measurements and does not guarantee search rankings or business results.',
  ].join('\n');
  return { subject, html, text };
}
