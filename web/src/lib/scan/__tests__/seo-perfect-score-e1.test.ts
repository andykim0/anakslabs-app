import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SemanticOutline } from '@/components/site-renderer/SemanticOutline';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { contentMarkupLength, extractVisibleText } from '@/lib/scan/document';
import { ALL_SCAN_RULES } from '@/lib/scan/rule-registry';
import type { RuleContext } from '@/lib/scan/rules';
import { emptySiteConfig } from '@/lib/types/site';

function context(html: string): RuleContext {
  const root = parse(html);
  return {
    root,
    rawHtml: html,
    visibleText: extractVisibleText(root),
    url: new URL('https://external.example/'),
    status: 200,
    contentType: 'text/html; charset=utf-8',
    xRobotsTag: '',
    truncated: false,
    ttfbMs: 100,
    robots: {
      url: 'https://external.example/robots.txt',
      status: 200,
      ok: true,
      body: 'User-agent: *\nAllow: /\nSitemap: https://external.example/sitemap.xml',
      contentType: 'text/plain',
      truncated: false,
    },
    sitemap: {
      url: 'https://external.example/sitemap.xml',
      status: 200,
      ok: true,
      body: '<urlset><url><loc>https://external.example/</loc></url></urlset>',
      contentType: 'application/xml',
      truncated: false,
    },
  };
}

function aeoFailed(code: string, ctx: RuleContext): boolean {
  const rule = AEO_RULES.find((candidate) => candidate.code === code);
  assert.ok(rule);
  return rule.failed(ctx);
}

describe('SEO100 E1 — 일반 HTML에도 동일한 본문 판정', () => {
  test('헤더·푸터의 FAQ·메뉴 문구는 main의 질문·목록 필요성을 발화하지 않는다', () => {
    const ctx = context(`
      <html lang="ko"><head><title>외부형 회사</title></head><body>
        <header><nav><a href="/menu">메뉴</a><a href="/faq">FAQ</a></nav></header>
        <main><h1>외부형 회사</h1><section><h2>소개</h2>
          <p>이 문서는 별도 렌더러 표식이 없는 일반 서버 HTML입니다.</p>
        </section></main>
        <footer><a href="/faq">자주 묻는 질문</a></footer>
      </body></html>
    `);
    assert.equal(aeoFailed('aeo_question_headings', ctx), false);
    assert.equal(aeoFailed('aeo_lists_tables', ctx), false);
  });

  test('본문비율 분모는 script·style·표현 속성을 모두 제외한다', () => {
    const plain = parse('<html><head></head><body><main><p>같은 본문입니다.</p></main></body></html>');
    const decorated = parse(`
      <html><head><style>${'.card{color:red}'.repeat(200)}</style></head><body>
        <main class="motion-stage" style="transform:translate3d(0,0,0)" data-motion-progress="0.5">
          <p class="copy" style="letter-spacing:1px" data-runtime-id="copy">같은 본문입니다.</p>
          <script>${'window.runtime=true;'.repeat(200)}</script>
        </main>
      </body></html>
    `);
    assert.equal(contentMarkupLength(decorated), contentMarkupLength(plain));
  });

  test('규칙마다 system·shared·customer 소유권이 정의 인접 단일 필드로 존재한다', () => {
    assert.ok(ALL_SCAN_RULES.length > 0);
    assert.deepEqual(
      [...new Set(ALL_SCAN_RULES.map((rule) => rule.ownership))].sort(),
      ['customer', 'shared', 'system'],
    );
    assert.equal(new Set(ALL_SCAN_RULES.map((rule) => rule.code)).size, ALL_SCAN_RULES.length);
  });
});

test('FAQ 티저의 숨은 개요도 질문 h3와 답 p를 한 쌍으로 방출한다', () => {
  const config = emptySiteConfig('숨은 개요');
  config.pages[0].sections = [{
    id: 'sec-home-faq-teaser',
    type: 'custom',
    name: '자주 묻는 질문 미리보기',
    height: 600,
    background: { color: '#ffffff' },
    elements: [
      {
        id: 'faq-title',
        kind: 'text',
        frame: { x: 0, y: 0, w: 100, h: 30 },
        z: 1,
        text: '자주 묻는 질문',
        style: { fontSize: 20 },
      },
      {
        id: 'faq-question',
        kind: 'text',
        frame: { x: 0, y: 50, w: 100, h: 30 },
        z: 1,
        text: '예약할 수 있나요?',
        style: { fontSize: 18 },
      },
      {
        id: 'faq-answer',
        kind: 'text',
        frame: { x: 0, y: 90, w: 100, h: 30 },
        z: 1,
        text: '전화로 일정을 확인할 수 있습니다.',
        style: { fontSize: 16 },
      },
    ],
  }];
  const root = parse(renderToStaticMarkup(createElement(SemanticOutline, { config })));
  assert.equal(root.querySelector('h3')?.text, '예약할 수 있나요?');
  assert.equal(root.querySelector('h3 + p')?.text, '전화로 일정을 확인할 수 있습니다.');
});
