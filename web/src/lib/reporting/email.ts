import type {
  MonthlyPerformanceReport,
  MonthlyReportEmailMessage,
  ReportMetric,
} from './types';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

const NUMBER = new Intl.NumberFormat('ko-KR');

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
  if (metric.previous === 0 && metric.current > 0) return '신규 집계';
  if (metric.previous === 0) return '비교 데이터 없음';
  if (metric.changePercent === 0) return '전월과 같음';
  if ((metric.changePercent ?? 0) > 0) return `전월 대비 ${metric.changePercent}% 증가`;
  return `전월 대비 ${Math.abs(metric.changePercent ?? 0)}% 감소`;
}

function metricCard(label: string, metric: ReportMetric): string {
  return `<td style="width:25%;padding:10px;vertical-align:top"><div style="border:1px solid #dbe7f5;border-radius:14px;padding:16px;background:#f8fbff"><div style="font-size:13px;color:#52657a">${label}</div><div style="margin-top:8px;font-size:26px;font-weight:750;color:#071a33">${NUMBER.format(metric.current)}</div><div style="margin-top:6px;font-size:11px;color:#65778b">${comparisonLabel(metric)}</div></div></td>`;
}

export function buildMonthlyReportEmail(input: {
  siteName: string;
  dashboardUrl: string;
  report: MonthlyPerformanceReport;
}): MonthlyReportEmailMessage {
  const siteName = input.siteName.trim() || '사이트';
  const safeSiteName = escapeHtml(siteName);
  const dashboardUrl = safeHttpUrl(input.dashboardUrl);
  const monthLabel = input.report.period.month.replace('-', '년 ') + '월';
  const metrics = input.report.metrics;
  const activeSources = input.report.sources.filter((source) => source.count > 0);
  const sourceRows = activeSources.length > 0
    ? activeSources.map((source) => `<tr><td style="padding:7px 0;color:#273c53">${escapeHtml(source.label)}</td><td style="padding:7px 0;text-align:right;color:#071a33;font-weight:650">${NUMBER.format(source.count)}건 · ${source.sharePercent}%</td></tr>`).join('')
    : '<tr><td style="padding:7px 0;color:#65778b">아직 집계된 유입이 없습니다.</td></tr>';
  const dashboardLink = dashboardUrl
    ? `<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1268e8;color:#fff;text-decoration:none;font-weight:700">성과 리포트 자세히 보기</a>`
    : '';
  const comparisonNotice = input.report.hasComparisonData
    ? ''
    : '<div style="margin-top:18px;border:1px solid #dbe7f5;border-radius:12px;padding:13px 15px;color:#52657a;font-size:13px">첫 리포트예요. 이번 달부터 데이터를 모아 다음 리포트에서 전월과 비교해 드립니다.</div>';

  const subject = `[다보임] ${monthLabel} ${siteName} 성과 리포트`;
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f3f7fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif;color:#071a33"><div style="max-width:680px;margin:0 auto;padding:32px 18px"><div style="border-radius:22px;background:#fff;padding:30px;box-shadow:0 12px 36px rgba(20,55,95,.08)"><div style="font-size:13px;font-weight:750;color:#1268e8">${PUBLIC_BRAND_NAMES.brand} 월간 성과 리포트</div><h1 style="margin:10px 0 4px;font-size:25px;line-height:1.35">${safeSiteName}의 ${monthLabel} 성과</h1><p style="margin:0;color:#65778b;font-size:13px">방문 수는 고유 방문자가 아니라 이 사이트에서 수집된 페이지 조회(페이지뷰) 기준입니다.</p>${comparisonNotice}<table role="presentation" style="width:100%;margin:20px -10px 0;border-collapse:separate"><tr>${metricCard('유입(페이지뷰)', metrics.pageviews)}${metricCard('전화', metrics.phoneClicks)}${metricCard('예약', metrics.reservationClicks)}${metricCard('길찾기', metrics.directionsClicks)}</tr></table><div style="margin-top:20px;border-radius:14px;background:#ecf6ff;padding:17px 18px;font-size:16px;font-weight:700;color:#0a477f">${escapeHtml(input.report.insight)}</div><h2 style="margin:26px 0 8px;font-size:17px">유입 출처 구성</h2><table style="width:100%;border-collapse:collapse;font-size:14px">${sourceRows}</table><p style="margin:20px 0 0;color:#52657a;font-size:13px">폼 제출 ${NUMBER.format(metrics.formSubmissions.current)}건 · ${escapeHtml(comparisonLabel(metrics.formSubmissions))}</p><div style="margin-top:26px">${dashboardLink}</div></div><p style="margin:16px 6px 0;color:#7d8c9d;font-size:11px;line-height:1.6">이 리포트는 다보임 사이트에서 수집된 익명 집계 수치만으로 생성됐습니다. 검색 순위나 성과를 보장하지 않습니다.</p></div></body></html>`;

  const sourceText = activeSources.length > 0
    ? activeSources.map((source) => `${source.label} ${NUMBER.format(source.count)}건(${source.sharePercent}%)`).join(', ')
    : '집계 데이터 없음';
  const text = [
    `${siteName}의 ${monthLabel} 성과`,
    '방문 수는 고유 방문자가 아니라 이 사이트에서 수집된 페이지 조회(페이지뷰) 기준입니다.',
    ...(input.report.hasComparisonData
      ? []
      : ['첫 리포트예요. 이번 달부터 데이터를 모아 다음 리포트에서 전월과 비교해 드립니다.']),
    '',
    `유입(페이지뷰): ${NUMBER.format(metrics.pageviews.current)}건 · ${comparisonLabel(metrics.pageviews)}`,
    `전화: ${NUMBER.format(metrics.phoneClicks.current)}건 · ${comparisonLabel(metrics.phoneClicks)}`,
    `예약: ${NUMBER.format(metrics.reservationClicks.current)}건 · ${comparisonLabel(metrics.reservationClicks)}`,
    `길찾기: ${NUMBER.format(metrics.directionsClicks.current)}건 · ${comparisonLabel(metrics.directionsClicks)}`,
    `폼 제출: ${NUMBER.format(metrics.formSubmissions.current)}건 · ${comparisonLabel(metrics.formSubmissions)}`,
    '',
    `한 줄 인사이트: ${input.report.insight}`,
    `유입 출처: ${sourceText}`,
    ...(dashboardUrl ? ['', `자세히 보기: ${dashboardUrl}`] : []),
    '',
    '이 리포트는 익명 집계 수치만으로 생성됐으며 검색 순위나 성과를 보장하지 않습니다.',
  ].join('\n');
  return { subject, html, text };
}
