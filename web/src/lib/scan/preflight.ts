/**
 * [quality-system] 발행 전 자가 진단 — 생성물(SiteConfig)을 렌더한 HTML에 자사 SEO/AEO/GEO 규칙을
 * 그대로 적용한다. runScan은 라이브 URL을 fetch하지만 발행 전엔 URL이 없으므로, 여기서는
 * 렌더 HTML로 동일 규칙을 실행한다(같은 규칙 사전·점수 로직 재사용). 비차단 — 점수는 checkPublish로 전달.
 * (robots/sitemap/llms.txt는 테넌트 서빙이 자동 생성하므로 발행 후 존재 → true 가정)
 */
import 'server-only';
import { parse } from 'node-html-parser';
import type { SiteConfig } from '@/lib/types/site';
import type { ScanIssue } from '@/lib/data/types';
import { renderStaticDocument } from '@/lib/export/render-static';
import { runRules, type RuleContext } from './rules';
import { SEO_RULES } from './checks/seo';
import { AEO_RULES } from './checks/aeo';
import { GEO_RULES } from './checks/geo';
import { buildScores } from './score';
import type { ScanCore } from './index';

export function preflightScan(config: SiteConfig, opts?: { siteUrl?: string }): ScanCore {
  // [F1] 전 페이지 순회 — 각 페이지를 렌더·규칙 적용 후 축별 '최악 페이지'의 차감을 채택(thin 서브페이지도
  //      발행 게이트에 반영) + 이슈는 code 기준 합집합. 단일 페이지 사이트는 홈 1장 = 기존과 동일(무회귀).
  // [S-batch] siteUrl(발행 라우트가 site.domain 전달)로 서빙 레이어(canonical·JSON-LD)까지 포함해
  //      실서빙과 같은 문서를 채점(정직한 채점). 미전달 시 preview.local 기준 — 레이어는 동일하게 방출.
  const siteUrl = (opts?.siteUrl ?? 'https://preview.anakslabs.local').replace(/\/+$/, '');
  const worst = { seo: 0, aeo: 0, geo: 0 };
  const issues: ScanIssue[] = [];
  const seenCodes = new Set<string>();

  for (const page of config.pages) {
    const html = renderStaticDocument({ config, pageSlug: page.slug, siteUrl });
    const root = parse(html);
    const clone = parse(root.toString());
    for (const el of clone.querySelectorAll('script, style, noscript, template')) el.remove();
    const visibleText = clone.text.replace(/\s+/g, ' ').trim();

    const ctx: RuleContext = {
      root,
      rawHtml: html,
      visibleText,
      url: new URL(page.slug === '' ? siteUrl : `${siteUrl}/${page.slug}`),
      ttfbMs: 0,
      robotsTxtOk: true,
      sitemapOk: true,
      llmsTxtOk: true,
    };

    const seo = runRules(SEO_RULES, ctx);
    const aeo = runRules(AEO_RULES, ctx);
    const geo = runRules(GEO_RULES, ctx);
    worst.seo = Math.max(worst.seo, seo.deducted);
    worst.aeo = Math.max(worst.aeo, aeo.deducted);
    worst.geo = Math.max(worst.geo, geo.deducted);
    for (const iss of [...seo.issues, ...aeo.issues, ...geo.issues]) {
      if (seenCodes.has(iss.code)) continue;
      seenCodes.add(iss.code);
      issues.push(iss);
    }
  }

  const { scores, grade } = buildScores(worst);
  return { url: siteUrl, scores, grade, issues };
}
