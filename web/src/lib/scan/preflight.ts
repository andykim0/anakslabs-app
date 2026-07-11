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

export function preflightScan(config: SiteConfig): ScanCore {
  const html = renderStaticDocument({ config });
  const root = parse(html);
  const clone = parse(root.toString());
  for (const el of clone.querySelectorAll('script, style, noscript, template')) el.remove();
  const visibleText = clone.text.replace(/\s+/g, ' ').trim();

  const ctx: RuleContext = {
    root,
    rawHtml: html,
    visibleText,
    url: new URL('https://preview.anakslabs.local/'),
    ttfbMs: 0,
    robotsTxtOk: true,
    sitemapOk: true,
    llmsTxtOk: true,
  };

  const seo = runRules(SEO_RULES, ctx);
  const aeo = runRules(AEO_RULES, ctx);
  const geo = runRules(GEO_RULES, ctx);
  const issues: ScanIssue[] = [...seo.issues, ...aeo.issues, ...geo.issues];
  const { scores, grade } = buildScores({ seo: seo.deducted, aeo: aeo.deducted, geo: geo.deducted });
  return { url: ctx.url.toString(), scores, grade, issues };
}
