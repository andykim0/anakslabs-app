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
      ['손님이 검색하면, 가게를 찾기 쉽게.', '네이버·구글이 가게 이름, 지역, 서비스와 페이지 내용을 찾을 수 있게 정리합니다.'],
      ['“주차 되나요?”에 홈페이지가 바로 답하게.', '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 적습니다.'],
      ['AI에게 물어봐도, 공식 정보를 확인하기 쉽게.', '가게 이름, 지역, 서비스와 공식 연락처를 한뜻으로 정리해 AI가 정보를 덜 헷갈리게 합니다.'],
      ['이 움직임을 사장님 홈페이지에도.', '컴퓨터에서는 스크롤에 맞춰 장면이 바뀌고, 휴대폰에서는 부드럽게 반복됩니다. 움직임을 줄인 기기에서는 사진과 글이 그대로 보입니다.'],
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
