import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import MarketingHome from '@/app/(marketing)/page';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('LP2$ F2 무료진단부터 끝까지 이어지는 단일 서사', () => {
  test('후속 여덟 구간은 기존 공용 progress driver 하나를 공유한다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const continuation = read('src/components/marketing/LandingStoryContinuation.tsx');
    assert.match(page, /<LandingCinematicShowcase \/>[\s\S]*<LandingStoryContinuation>/);
    assert.equal((page.match(/data-story-chapter=/g) ?? []).length, 8);
    assert.match(continuation, /data-m-progress/);
    assert.match(continuation, /scaleY\(var\(--story-progress\)\)/);
    assert.doesNotMatch(continuation, /addEventListener|requestAnimationFrame|scrollTo|preventDefault/,
      '랜딩 전용 스크롤 엔진을 새로 만들면 안 됨');
  });

  test('예시 고지는 /cases 행동으로 이어지고 랜딩 자체가 예시임을 명시한다', () => {
    const html = renderToStaticMarkup(createElement(MarketingHome));
    const root = parse(html);
    assert.ok(root.querySelector('a[href="/cases"]')?.textContent.includes('예시 · AI 영상 홈페이지 적용 시'));
    assert.ok(html.includes('지금 보고 계신 이 홈페이지가'));
    assert.ok(html.includes('다보임으로 만든 예시입니다.'));
  });

  test('정적 HTML은 전 구간 카피와 단 하나의 production signature를 보존한다', () => {
    const html = renderToStaticMarkup(createElement(MarketingHome));
    const root = parse(html);
    assert.equal(root.querySelectorAll('[data-motion-signature]').length, 1);
    assert.equal(root.querySelectorAll('[data-story-chapter]').length, 8);
    assert.ok(html.includes('손님이 찾고 궁금해할 내용을'));
    assert.ok(html.includes('결정 전에 많이 묻는 질문'));
    assert.ok(html.includes('내 사이트 무료 진단'));
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  });

  test('reduced/no-JS에서도 콘텐츠를 숨기거나 거대한 후속 sticky track을 만들지 않는다', () => {
    const continuation = read('src/components/marketing/LandingStoryContinuation.tsx');
    assert.match(continuation, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(continuation, /position:\s*sticky|opacity:\s*0/);
    assert.doesNotMatch(continuation, /\[data-story-chapter\]\s*\{[^}]*display:\s*none/,
      '장식 번호가 아니라 실제 섹션을 숨기면 안 됨');
  });
});
