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
import { fetchTarget, normalizeScanUrl, probeResource, probeResourceWithRetry } from './fetch-target';
import { extractVisibleText } from './document';
import { createRuleRunState, runRules, type RuleContext } from './rules';
import { buildScores } from './score';
import { probeDeclaredSitemap } from './sitemap';
import { evaluateDecayScore } from './decay';
import { probeSocialLinks } from './social-probe';
import { socialLinkUrls } from './social-links';

export { ScanError } from './ssrf';
export { normalizeScanUrl } from './fetch-target';

export type ScanCore = Omit<ScanResult, 'id' | 'createdAt' | 'clientId'>;

export async function runScan(rawUrl: string): Promise<ScanCore> {
  const normalized = normalizeScanUrl(rawUrl);
  const target = await fetchTarget(normalized);
  const origin = target.finalUrl.origin;

  // robots의 Sitemap 지시자를 먼저 읽어 맞춤 경로를 확인한다. 지시자가 없을 때만 기본 경로 폴백.
  const robots = await probeResourceWithRetry(origin, '/robots.txt');
  const sitemap = await probeDeclaredSitemap(origin, robots, probeResource);

  const root = parse(target.html);
  const observedAt = new Date().toISOString();
  const socialLinks = await probeSocialLinks(socialLinkUrls(root, target.finalUrl));
  const ctx: RuleContext = {
    root,
    rawHtml: target.html,
    visibleText: extractVisibleText(root),
    url: target.finalUrl,
    status: target.status,
    contentType: target.contentType,
    xRobotsTag: target.xRobotsTag,
    truncated: target.truncated,
    ttfbMs: target.ttfbMs,
    robots,
    sitemap,
    observedAt,
    lastModified: target.lastModified,
    socialLinks,
  };

  const runState = createRuleRunState();
  const seo = runRules(SEO_RULES, ctx, runState);
  const aeo = runRules(AEO_RULES, ctx, runState);
  const geo = runRules(GEO_RULES, ctx, runState);

  const issues: ScanIssue[] = [...seo.issues, ...aeo.issues, ...geo.issues];
  const { scores, grade } = buildScores({ seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted });
  const decay = evaluateDecayScore(ctx);

  return { url: target.finalUrl.toString(), scores, grade, issues, decay };
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
    ...pick(GEO_RULES, ['geo_no_text', 'geo_business_info', 'geo_oai_search_blocked']),
  ];
  // seo: 10+10+8+8+6=42→58 / aeo: 20+15+15+10=60→40 / geo: 20+15+10=45→55... 데모 값은 고정 명시
  return {
    url,
    scores: { seo: 41, aeo: 30, geo: 31, total: 34 },
    grade: 'F',
    issues,
  };
}
