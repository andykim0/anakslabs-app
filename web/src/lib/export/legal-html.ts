/**
 * [§5·§6] Export용 법적 요소 HTML 생성 — route 전용(react-dom/server.edge).
 * 정적 번들에 사업자정보 푸터 + privacy.html / terms.html을 동일 문구로 포함한다.
 */
import 'server-only';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { LegalFooter } from '@/components/site-renderer';
import type { LegalDocument } from '@/lib/legal/templates';
import type { BusinessInfo, SiteTheme } from '@/lib/types/site';

const EXPORT_PRIVACY_HREF = 'privacy.html';
const EXPORT_TERMS_HREF = 'terms.html';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** index.html </body> 직전에 붙일 사업자정보 푸터 (링크는 privacy.html/terms.html) */
export function renderLegalFooterHtml(info: BusinessInfo, theme: SiteTheme): string {
  return renderToStaticMarkup(
    createElement(LegalFooter, {
      info,
      theme,
      privacyHref: EXPORT_PRIVACY_HREF,
      termsHref: EXPORT_TERMS_HREF,
    }),
  );
}

/** 법무 문서(개인정보처리방침/이용약관) → 독립 HTML 페이지 */
export function renderLegalDocHtml(
  doc: LegalDocument,
  theme: SiteTheme,
  info: BusinessInfo,
  siteTitle: string,
): string {
  const footer = renderLegalFooterHtml(info, theme);
  const sections = doc.sections
    .map(
      (s) =>
        `<section style="margin-bottom:24px"><h2 style="font-size:16px;font-weight:600;margin:0 0 8px">${escapeHtml(
          s.heading,
        )}</h2>${s.body
          .map(
            (p) =>
              `<p style="font-size:14px;line-height:1.75;opacity:.9;margin:0 0 6px">${escapeHtml(p)}</p>`,
          )
          .join('')}</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.title)} · ${escapeHtml(siteTitle)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100dvh}</style>
</head>
<body style="background:${theme.palette.background};color:${theme.palette.text};font-family:${theme.fonts.body.replace(/"/g, '&quot;')}">
<main style="max-width:760px;margin:0 auto;padding:56px 24px 40px">
<a href="index.html" style="color:${theme.palette.muted};font-size:13px;text-decoration:none">← 홈으로</a>
<h1 style="font-family:${theme.fonts.heading.replace(/"/g, '&quot;')};font-size:30px;font-weight:700;margin:18px 0 6px">${escapeHtml(doc.title)}</h1>
<p style="color:${theme.palette.muted};font-size:12px;margin-bottom:28px">${escapeHtml(doc.updatedNote)}</p>
${sections}
</main>
${footer}
</body>
</html>
`;
}
