import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SemanticOutline } from '@/components/site-renderer/SemanticOutline';
import { AEO_RULES } from '@/lib/scan/checks/aeo';
import { GEO_RULES } from '@/lib/scan/checks/geo';
import { extractVisibleText } from '@/lib/scan/document';
import type { RuleContext, ScanRule } from '@/lib/scan/rules';
import {
  SEO100_DOGFOOD_SEEDS,
  seo100ConfigFor,
} from '../../../../scripts/lib/seo100-dogfood-fixtures';

interface DogfoodResult {
  seed: string;
  templateId: string;
  dark: boolean;
  scores: { seo: number; aeo: number; geo: number; total: number };
  issues: string[];
  systemIssues: string[];
}

function runDogfood(): DogfoodResult[] {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      join(process.cwd(), 'scripts/check-seo100-dogfood.ts'),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        TSX_TSCONFIG_PATH: join(process.cwd(), 'scripts/tsconfig.json'),
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout) as DogfoodResult[];
}

function rule(code: string): ScanRule {
  const found = [...AEO_RULES, ...GEO_RULES].find((candidate) => candidate.code === code);
  assert.ok(found, `missing rule: ${code}`);
  return found;
}

function externalContext(html: string): RuleContext {
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

describe('SEO100 E3 — 대표 발행 시드 도그푸딩', () => {
  const matrix = runDogfood();

  test('목적 6종 + 업종 오버라이드 4종 + 다크 DNA 1종을 빠짐없이 실행한다', () => {
    assert.equal(matrix.length, 11);
    assert.deepEqual(
      matrix.map((item) => item.seed),
      SEO100_DOGFOOD_SEEDS.map((seed) => seed.id),
    );
    assert.equal(new Set(matrix.map((item) => item.templateId)).size, 10);
    assert.equal(matrix.filter((item) => item.dark).length, 1);
  });

  for (const item of matrix) {
    test(`${item.seed}: 렌더러 통제 항목과 완성 입력은 SEO·AEO·GEO 100점이다`, () => {
      assert.deepEqual(item.scores, { seo: 100, aeo: 100, geo: 100, total: 100 });
      assert.deepEqual(item.issues, []);
      assert.deepEqual(item.systemIssues, []);
    });
  }

  test('일반 외부형 HTML도 main 범위와 정제된 텍스트 분모 규칙을 똑같이 쓴다', () => {
    const ctx = externalContext(`
      <html lang="ko"><head>
        <title>외부형 서버 문서</title>
        <style>${'.ornament{transform:translate3d(0,0,0)}'.repeat(500)}</style>
      </head><body>
        <header><nav><a href="/menu">메뉴</a><a href="/faq">FAQ</a></nav></header>
        <main class="${'presentation '.repeat(400)}" data-motion="${'x'.repeat(4000)}">
          <h1>외부형 서버 문서</h1>
          <section><h2>소개</h2><p>${'서버가 보낸 본문을 기준으로 같은 판정을 적용합니다. '.repeat(24)}</p></section>
          <script>${'window.decorativeRuntime=true;'.repeat(500)}</script>
        </main>
        <footer><a href="/faq">자주 묻는 질문</a></footer>
      </body></html>
    `);
    assert.equal(rule('aeo_question_headings').failed(ctx), false);
    assert.equal(rule('aeo_lists_tables').failed(ctx), false);
    assert.equal(rule('geo_low_text_ratio').failed(ctx), false);
  });

  test('C2 숨은 FAQ 개요의 의도된 h3+p HTML SHA를 고정한다', () => {
    const config = seo100ConfigFor(SEO100_DOGFOOD_SEEDS[0]);
    const outline = renderToStaticMarkup(createElement(SemanticOutline, { config }));
    const root = parse(outline);
    assert.ok(root.querySelector('h3 + p'));
    // C2 intentional baseline: FAQ 티저도 질문 h3 + 답 p가 된다.
    // SemanticOutline은 화면 밖 접근성 개요라 대표 시드 픽셀은 바뀌지 않는다.
    const hash = createHash('sha256').update(outline).digest('hex');
    assert.equal(hash, 'f1745c33175c1c57a12f3f23bab90edf0dd290351dca25c010f0d8a79fa103fd');
  });

  test('검수 스크립트가 11시드×1440/390과 정확한 Puppeteer 뷰포트·픽셀 diff를 강제한다', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/render-seo100-review.tsx'),
      'utf8',
    );
    assert.match(source, /SEO100_DOGFOOD_SEEDS/);
    assert.match(source, /\{ width: 1440, height: 900 \}/);
    assert.match(source, /\{ width: 390, height: 844 \}/);
    assert.match(source, /viewport\.innerWidth !== width/);
    assert.match(source, /viewport\.clientWidth !== width/);
    assert.match(source, /diffs\.some\(\(diff\) => !diff\.equal\)/);
  });
});
