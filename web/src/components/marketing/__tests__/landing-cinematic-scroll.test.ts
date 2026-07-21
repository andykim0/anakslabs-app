import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { LandingCinematicShowcase } from '../LandingCinematicShowcase';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('LP$ L2 랜딩 매니페스토 페이지 관통 무대', () => {
  test('무료 진단과 5막 무대가 하나의 공용 runtime 컴포넌트로 이어진다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const cinematic = page.indexOf('<LandingCinematicShowcase />');
    const category = page.indexOf('A NEW WEBSITE CATEGORY');
    assert.ok(cinematic >= 0, '페이지 관통 무대가 랜딩 첫 경험에서 사라짐');
    assert.ok(category > cinematic, '스크럽 시연이 후속 제품 설명 뒤로 밀림');
    assert.doesNotMatch(page, /HeroVideo|<LandingScanner/, '별도 히어로 엔진이나 진단 surface가 남아 있음');
    assert.match(page, /<LandingFullFilm>[\s\S]*<LandingCinematicShowcase \/>[\s\S]*<LandingStoryContinuation>/);

    const showcase = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(showcase, /data-landing-manifesto/);
    assert.match(showcase, /<LandingScanner \/>/);
    assert.match(showcase, /signatureId: 'scrollytelling-manifesto'/);
    assert.match(showcase, /<MotionSignatureRenderer/);
    assert.doesNotMatch(showcase, /data-signature-status=/, 'production renderer 상태를 마케팅 DOM이 흉내 내면 안 됨');

    const runtime = read('src/components/marketing/LandingCinematicRuntime.tsx');
    assert.match(runtime, /usePreviewMotion/);
    assert.doesNotMatch(runtime, /addEventListener\(['"]scroll|currentTime\s*=/, '별도 스크럽 엔진을 중복 구현함');
  });

  test('SSR 마크업은 poster·전 막 본문을 보존하고 영상만 지연 로드한다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    const renderer = read('src/components/site-renderer/MotionSignatureRenderer.tsx');
    assert.match(source, /satisfies ScrollytellingManifestoScene/);
    assert.match(source, /responsiveVideoSources=\{LANDING_VIDEO_SOURCES\}/);
    assert.match(renderer, /data-m-progress/);
    assert.match(renderer, /data-m-cinematic-video/);
    assert.match(renderer, /data-playback=\{scrub \? 'scrub' : 'loop'\}/);
    assert.match(source, /daboim-visibility-film-poster\.webp/);
    assert.match(source, /width: 1920/);
    assert.match(source, /height: 1080/);
    assert.match(renderer, /loading: eager \? 'eager' as const : 'lazy' as const/);
    assert.match(renderer, /decoding: eager \? 'sync' as const : 'async' as const/);
    assert.match(renderer, /preload="none"/);
    assert.match(renderer, /<article/);
    assert.match(renderer, /<h2 id=\{headingId\} data-ss-heading data-signature-heading aria-label=\{act\.heading\}>/);
    assert.match(renderer, /data-ss-word aria-hidden="true"/);
    assert.doesNotMatch(source, /<article|<video/, '마케팅에서 production scene DOM을 복제하면 안 됨');
    assert.doesNotMatch(renderer, /autoPlay|autoplay/);
    for (const forbidden of ['WebGL', 'three.js', 'Lenis', 'preventDefault']) {
      assert.ok(!source.includes(forbidden), `금지 기법 포함: ${forbidden}`);
    }
  });

  test('SSR은 LCP poster·무료 진단·5막 전체를 보존하고 영상만 지연한다', () => {
    const html = renderToStaticMarkup(createElement(LandingCinematicShowcase));
    const rootNode = parse(html);
    const expectedCopy = [
      ['손님이 검색하면, 가게를 찾기 쉽게.', '네이버·구글이 가게 이름, 지역, 서비스와 페이지 내용을 찾을 수 있게 정리합니다.'],
      ['“주차 되나요?”에 홈페이지가 바로 답하게.', '영업시간, 주차, 예약처럼 손님이 자주 묻는 내용을 질문과 답으로 또렷하게 적습니다.'],
      ['AI에게 물어봐도, 공식 정보를 확인하기 쉽게.', '가게 이름, 지역, 서비스와 공식 연락처를 한뜻으로 정리해 AI가 정보를 덜 헷갈리게 합니다.'],
      ['이 움직임을 사장님 홈페이지에도.', '컴퓨터에서는 스크롤에 맞춰 장면이 바뀌고, 휴대폰에서는 부드럽게 반복됩니다. 움직임을 줄인 기기에서는 사진과 글이 그대로 보입니다.'],
      ['지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.', '업종마다 필요한 내용과 장면을 어떻게 다르게 담는지 적용 사례에서 확인해 보세요.'],
    ] as const;

    assert.equal(rootNode.querySelectorAll('h1').length, 1);
    assert.equal(rootNode.querySelectorAll('article[data-ss-act]').length, 5);
    assert.equal(rootNode.querySelectorAll('article[data-ss-act][aria-labelledby]').length, 5);
    assert.equal(rootNode.querySelectorAll('article[data-ss-act] h2').length, 5);
    assert.equal(rootNode.querySelectorAll('[data-motion-signature]').length, 1);
    for (const [heading, body] of expectedCopy) {
      assert.ok(html.includes(heading), `SSR heading 누락: ${heading}`);
      assert.ok(html.includes(body), `SSR body 누락: ${body}`);
    }
    assert.equal((html.match(/<video\b/g) ?? []).length, 1);
    assert.equal((html.match(/preload="none"/g) ?? []).length, 1);
    assert.equal((html.match(/poster="\/daboim-visibility-film-poster\.webp"/g) ?? []).length, 1);
    assert.equal(rootNode.querySelectorAll('img[width="1920"][height="1080"][loading="eager"][decoding="sync"][fetchpriority="high"]').length, 1);
    assert.match(html, /<link[^>]+rel="preload"[^>]+as="image"[^>]+href="\/daboim-visibility-film-poster\.webp"/);
    assert.equal(rootNode.querySelectorAll('video[preload="none"][muted][playsinline]').length, 1);
    assert.equal(rootNode.querySelectorAll('video[width="1920"][height="1080"]').length, 1);
    assert.equal(rootNode.querySelectorAll('video source').length, 2);
    assert.equal(rootNode.querySelectorAll('source[src="/daboim-visibility-film-mobile.mp4"][media="(max-width: 767.98px)"]').length, 1);
    assert.equal(rootNode.querySelectorAll('source[src="/daboim-visibility-film-scrub.mp4"]').length, 1);
    assert.equal(rootNode.querySelectorAll('[data-signature-status="production-renderer"]').length, 1);
    assert.equal(rootNode.querySelectorAll('img[data-optimization-poster][loading="lazy"]').length, 0);
    assert.equal(rootNode.querySelectorAll('img[data-optimization-poster][fetchpriority]').length, 0,
      'Next 16 문서상 preload와 fetchPriority를 함께 쓰면 안 됨');
    assert.match(html, /<noscript>/);
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  });

  test('막 영상 전체 워시 없이 카피 뒤에만 국소 스크림을 둔다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    const fullFilm = read('src/components/marketing/LandingFullFilm.tsx');
    const continuation = read('src/components/marketing/LandingStoryContinuation.tsx');
    assert.match(source, /\.daboim-cinematic \[data-ss-copy\]::before/);
    assert.match(source, /radial-gradient\(ellipse at var\(--ss-scrim-x/);
    assert.doesNotMatch(fullFilm, /\[data-film-scrim\]/);
    assert.match(continuation, /\[data-story-chapter\][\s\S]*background: transparent !important/);
    assert.match(continuation, /linear-gradient\(180deg,#f8fbff 0%,#eef5ff 36%/);
    assert.doesNotMatch(source, /linear-gradient\(90deg,rgba\(3,12,31/);
    assert.doesNotMatch(source, /linear-gradient\(to_bottom,rgba\(7,20,47/);
    const renderer = read('src/components/site-renderer/MotionSignatureRenderer.tsx');
    assert.match(renderer, /data-video-poster[\s\S]*preload="none"/);
  });

  test('reduced-motion과 no-JS는 큰 sticky track 없이 compact 세로 기사로 읽힌다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(source, /\.m-scrollytelling-static \[data-signature-id="scrollytelling-manifesto"\]/);
    assert.match(source, /height: auto !important; contain: none/);
    assert.match(source, /min-height: min\(58svh, 560px\); padding-block: clamp\(56px, 6vw, 88px\)/);
    assert.match(source, /const NO_JS_STAGE_CSS/);
    assert.match(source, /<noscript>[\s\S]*NO_JS_STAGE_CSS/);
  });

  test('hero는 중복 미디어 없이 전역 필름 하나만 공유한다', () => {
    const source = read('src/components/marketing/LandingCinematicShowcase.tsx');
    const scannerSource = read('src/components/landing/LandingScanner.tsx');
    assert.doesNotMatch(source, /consoleMedia/);
    assert.doesNotMatch(scannerSource, /OptimizationConsole|data-optimization-poster/);
    assert.doesNotMatch(source, /data-lcs-hero-ambient|bg-\[size:56px_56px\]/);
    assert.doesNotMatch(source, /data-lcs-hero-poster/);
    assert.equal((source.match(/<video\b/g) ?? []).length, 0);
    assert.match(source, /responsiveVideoSources=\{LANDING_VIDEO_SOURCES\}/);
  });

  test('데스크 scrub·모바일 loop는 고화질 분기와 각 용량 상한을 지킨다', () => {
    const path = join(root, 'public/daboim-visibility-film-scrub.mp4');
    const bytes = statSync(path).size;
    assert.ok(bytes > 8 * 1024 * 1024, '스크럽 자산이 품질 예산을 사용하지 않음');
    assert.ok(bytes <= 10_000_000, '스크럽 자산 10MB 하드 상한 초과');

    const mp4 = readFileSync(path);
    assert.ok(mp4.includes(Buffer.from('stsz')), 'MP4 sample-size box 누락');
    // ISO BMFF에서 stss(sync sample table)가 없으면 모든 샘플이 sync sample이다.
    assert.equal(mp4.includes(Buffer.from('stss')), false, '일부 프레임만 키프레임인 비스크럽 자산');

    const mobilePath = join(root, 'public/daboim-visibility-film-mobile.mp4');
    const mobileBytes = statSync(mobilePath).size;
    assert.ok(mobileBytes > 2 * 1024 * 1024, '모바일 자산이 예상보다 작아 저화질 재인코딩 가능성');
    assert.ok(mobileBytes <= 4_000_000, '모바일 자산 4MB 하드 상한 초과');
  });
});
