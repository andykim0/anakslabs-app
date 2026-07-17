import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('L$ 랜딩 시네마틱 스크롤 시연', () => {
  test('무료 진단 직후 실제 공용 progress 런타임 무대가 노출된다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const scanner = page.indexOf('<LandingScanner />');
    const cinematic = page.indexOf('<LandingCinematicShowcase />');
    const category = page.indexOf('A NEW WEBSITE CATEGORY');
    assert.ok(scanner >= 0 && cinematic > scanner, '스크럽 시연이 무료 진단 뒤에 없음');
    assert.ok(category > cinematic, '스크럽 시연이 후속 제품 설명 뒤로 밀림');

    const runtime = read('src/components/marketing/LandingCinematicRuntime.tsx');
    assert.match(runtime, /usePreviewMotion/);
    assert.doesNotMatch(runtime, /addEventListener\(['"]scroll|currentTime\s*=/, '별도 스크럽 엔진을 중복 구현함');
  });

  test('SSR 마크업은 poster·전 막 본문을 보존하고 영상만 지연 로드한다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(source, /data-m-progress/);
    assert.match(source, /data-m-cinematic-video/);
    assert.match(source, /data-playback="scrub"/);
    assert.match(source, /data-playback="loop"/);
    assert.match(source, /daboim-visibility-film-poster\.webp/);
    assert.match(source, /width=\{1920\}/);
    assert.match(source, /height=\{1080\}/);
    assert.match(source, /loading="lazy"/);
    assert.match(source, /decoding="async"/);
    assert.match(source, /preload="none"/);
    assert.match(source, /<article/);
    assert.match(source, /<h3 data-ss-heading>/);
    assert.equal((source.match(/<article/g) ?? []).length, 1, '막은 ACTS map의 단일 시맨틱 템플릿이어야 함');
    assert.doesNotMatch(source, /autoPlay|autoplay/);
    for (const forbidden of ['WebGL', 'three.js', 'Lenis', 'preventDefault']) {
      assert.ok(!source.includes(forbidden), `금지 기법 포함: ${forbidden}`);
    }
  });

  test('M6 실제 SSR은 4막 전체와 no-JS 폴백을 보존하고 블로킹 외부 스크립트가 없다', () => {
    const html = renderToStaticMarkup(createElement(LandingCinematicShowcase));
    const expectedCopy = [
      ['검색엔진이 먼저 구조를 읽습니다.', '페이지 제목과 설명, 시맨틱 HTML, 사이트맵을 화면 뒤의 실제 문서 구조로 함께 만듭니다.'],
      ['질문의 답이 되는 문장을 설계합니다.', 'FAQ와 직접 답변 문장을 배치해 검색의 답변 영역이 핵심 정보를 집어가기 좋은 형태로 정리합니다.'],
      ['AI가 사업 정보를 이해할 단서를 남깁니다.', '사업 주체와 지역, 서비스 정보를 텍스트와 구조화 데이터로 일치시켜 생성형 AI가 참고하기 쉬운 기반을 만듭니다.'],
      ['이 움직임까지 실제 홈페이지에 적용됩니다.', '데스크톱에서는 스크롤이 영상의 재생 위치를 제어하고, 모바일에서는 안정적인 루프로 전환됩니다. 정적인 포스터와 본문은 언제나 남습니다.'],
    ] as const;

    assert.equal((html.match(/<article\b/g) ?? []).length, 4);
    for (const [heading, body] of expectedCopy) {
      assert.ok(html.includes(heading), `SSR heading 누락: ${heading}`);
      assert.ok(html.includes(body), `SSR body 누락: ${body}`);
    }
    assert.equal((html.match(/<video\b/g) ?? []).length, 2);
    assert.equal((html.match(/preload="none"/g) ?? []).length, 2);
    assert.equal((html.match(/poster="\/daboim-visibility-film-poster\.webp"/g) ?? []).length, 2);
    assert.match(html, /<img[^>]+width="1920"[^>]+height="1080"[^>]+loading="lazy"[^>]+decoding="async"/);
    assert.match(html, /<noscript>/);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  });

  test('영상 전체를 덮는 워시 없이 카피 뒤에만 국소 스크림을 둔다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(source, /data-lcs-local-scrim/);
    assert.match(source, /\.m-scrollytelling-ready \[data-lcs-local-scrim\]/);
    assert.doesNotMatch(source, /linear-gradient\(90deg,rgba\(3,12,31/);
    assert.doesNotMatch(source, /linear-gradient\(to_bottom,rgba\(7,20,47/);
    assert.doesNotMatch(source, /rel=["']preload["'][^>]+daboim-visibility-film-poster/);
  });

  test('데스크 scrub MP4는 8MB 이하 all-intra(-g 1) 자산이다', () => {
    const path = join(root, 'public/daboim-visibility-film-scrub.mp4');
    const bytes = statSync(path).size;
    assert.ok(bytes > 3 * 1024 * 1024, '스크럽 자산이 예상보다 작아 저화질 재인코딩 가능성');
    assert.ok(bytes <= 8 * 1024 * 1024, '스크럽 자산 8MB 하드 상한 초과');

    const mp4 = readFileSync(path);
    assert.ok(mp4.includes(Buffer.from('stsz')), 'MP4 sample-size box 누락');
    // ISO BMFF에서 stss(sync sample table)가 없으면 모든 샘플이 sync sample이다.
    assert.equal(mp4.includes(Buffer.from('stss')), false, '일부 프레임만 키프레임인 비스크럽 자산');
  });
});
