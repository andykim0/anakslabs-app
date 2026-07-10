/**
 * [v3 Phase 6] runScan — URL 하나를 SEO/AEO/GEO 결정적 규칙으로 진단.
 * LLM 불사용(비로그인 무료 경로 토큰 비용 0), 목표 응답 수 초 내.
 *
 * 파이프라인: 정규화 → SSRF 검증 → fetch(5s/1MB/redirect3, hop 재검증) →
 * node-html-parser 파싱 → 규칙 3축 실행 → 점수/등급.
 */
import 'server-only';
import { parse } from 'node-html-parser';
import type { ScanIssue, ScanResult } from '@/lib/data/types';
import { AEO_RULES } from './checks/aeo';
import { GEO_RULES } from './checks/geo';
import { SEO_RULES } from './checks/seo';
import { fetchTarget, normalizeScanUrl, probeExists } from './fetch-target';
import { runRules, type RuleContext } from './rules';
import { buildScores } from './score';

export { ScanError } from './ssrf';
export { normalizeScanUrl } from './fetch-target';

export type ScanCore = Omit<ScanResult, 'id' | 'createdAt' | 'clientId'>;

/** script/style/noscript 제거 후 보이는 텍스트 */
function extractVisibleText(root: ReturnType<typeof parse>): string {
  const clone = parse(root.toString());
  for (const el of clone.querySelectorAll('script, style, noscript, template')) el.remove();
  return clone.text.replace(/\s+/g, ' ').trim();
}

export async function runScan(rawUrl: string): Promise<ScanCore> {
  const normalized = normalizeScanUrl(rawUrl);
  const target = await fetchTarget(normalized);
  const origin = target.finalUrl.origin;

  // 보조 리소스 존재 확인 (병렬, 실패는 '없음')
  const [robotsTxtOk, sitemapOk, llmsTxtOk] = await Promise.all([
    probeExists(origin, '/robots.txt'),
    probeExists(origin, '/sitemap.xml'),
    probeExists(origin, '/llms.txt'),
  ]);

  const root = parse(target.html);
  const ctx: RuleContext = {
    root,
    rawHtml: target.html,
    visibleText: extractVisibleText(root),
    url: target.finalUrl,
    ttfbMs: target.ttfbMs,
    robotsTxtOk,
    sitemapOk,
    llmsTxtOk,
  };

  const seo = runRules(SEO_RULES, ctx);
  const aeo = runRules(AEO_RULES, ctx);
  const geo = runRules(GEO_RULES, ctx);

  const issues: ScanIssue[] = [...seo.issues, ...aeo.issues, ...geo.issues];
  const { scores, grade } = buildScores({ seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted });

  return { url: target.finalUrl.toString(), scores, grade, issues };
}

/**
 * [MOCK_MODE 데모] demo. 프리픽스 URL 고정 픽스처 — 34점·이슈 12개, 오프라인 데모 보장.
 * 라벨은 실제 규칙 사전에서 가져온다(카피 단일 소스).
 */
export function demoFixture(url: string): ScanCore {
  const pick = (rules: typeof SEO_RULES, codes: string[]): ScanIssue[] =>
    rules
      .filter((r) => codes.includes(r.code))
      .map((r) => ({ code: r.code, severity: r.severity, label: r.label, detail: r.detail, pillar: r.pillar }));

  const issues: ScanIssue[] = [
    ...pick(SEO_RULES, ['seo_meta_description', 'seo_h1', 'seo_og', 'seo_img_alt', 'seo_canonical']),
    ...pick(AEO_RULES, ['aeo_jsonld_missing', 'aeo_question_headings', 'aeo_main_landmark', 'aeo_lists_tables']),
    ...pick(GEO_RULES, ['geo_no_text', 'geo_business_info', 'geo_llms_txt']),
  ];
  // seo: 10+10+8+8+6=42→58 / aeo: 20+15+15+10=60→40 / geo: 20+15+10=45→55... 데모 값은 고정 명시
  return {
    url,
    scores: { seo: 41, aeo: 30, geo: 31, total: 34 },
    grade: 'F',
    issues,
  };
}
