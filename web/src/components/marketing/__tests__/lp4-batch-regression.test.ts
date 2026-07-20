import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import MarketingHome from '@/app/(marketing)/page';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  VIDEO_HERO_MIN_HEIGHT,
  VIDEO_HERO_MIN_WIDTH,
  VIDEO_MAX_COVER_UPSCALE_RATIO,
  VIDEO_MIN_AVERAGE_BITRATE_BPS,
} from '@/lib/motion/asset-limits';
import { MOTION_CSS, MOTION_RUNTIME } from '@/lib/motion/runtime';
import { CINEMATIC_COMPOSITION_DEFAULTS } from '@/lib/motion/scrollytelling-composition';
import {
  buildFictionalDemo,
  configForFictionalDemoPreview,
  FICTIONAL_DEMO_SLUGS,
} from '@/lib/marketing/fictional-demo-sites';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const landingHtml = renderToStaticMarkup(createElement(MarketingHome));
const landing = parse(landingHtml);

function videoProbe(path: string) {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:format=duration,size,bit_rate',
    '-of', 'json',
    join(ROOT, path),
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as {
    streams: Array<{ codec_type: string; codec_name?: string; width?: number; height?: number; pix_fmt?: string }>;
    format: { duration: string; size: string; bit_rate: string };
  };
}

describe('LP4$ batch 통합 회귀', () => {
  test('P9 비교표는 경쟁 강점 없이 다보임 우위 축 5행만 렌더한다', () => {
    const comparison = landing.querySelector('[data-story-chapter="03"]');
    assert.ok(comparison);
    const rows = comparison.querySelectorAll('[data-comparison-row]').map((row) =>
      row.querySelectorAll(':scope > div').map((cell) => cell.textContent.trim()),
    );
    assert.deepEqual(rows, [
      ['누가 만드나요', '다보임이 처음부터 끝까지', '사장님이 직접', '상담·견적을 거쳐 업체가'],
      ['시작하는 법', '질문에 답하면 디자인 3안이 도착', '템플릿 고르고 직접 조립', '상담→견적→제작'],
      ['검색·AI 노출', '기본 포함 — 네이버·구글·AI까지 설계', '사장님이 직접 설정', '계약 범위에 따라'],
      ['오픈 후 수정', '무제한 무료', '사장님이 직접', '요청·계약에 따라'],
      ['성과 확인', '매달 리포트가 숫자로 도착', '스스로 분석', '별도 관리 계약'],
    ]);
    const header = comparison.querySelector('[data-comparison-header]');
    assert.ok(header);
    assert.deepEqual(
      header.querySelectorAll(':scope > div').map((cell) => cell.textContent.trim()),
      ['', '다보임', '일반 템플릿 빌더', '웹 제작대행사'],
    );
    assert.equal(header.querySelectorAll(':scope > div')[1]?.getAttribute('data-comparison-column'), 'daboim');
    assert.equal(
      comparison.querySelectorAll('[data-comparison-row]').every((row) =>
        row.querySelectorAll(':scope > div')[1]?.getAttribute('data-comparison-column') === 'daboim'),
      true,
    );
    const competitorCopy = rows.flatMap((row) => row.slice(2, 4)).join(' ');
    assert.doesNotMatch(competitorCopy, /강점|폭넓|맞춤|전문|고품질|다양|풍부|유연|편리/u);
    assert.equal(comparison.textContent.includes('잘하는 일'), false);
    assert.equal(rows.every((row) => ['누가 만드나요', '시작하는 법', '검색·AI 노출', '오픈 후 수정', '성과 확인'].includes(row[0]!)), true);
    assert.match(read('src/app/(marketing)/page.tsx'), /data-comparison-row[^>]*break-keep/u);
    assert.match(read('src/app/(marketing)/page.tsx'), /data-comparison-column="daboim"[^>]*bg-gradient-to-r[^>]*font-semibold/u);
  });

  test('P8 왜 다보임인가는 두 대안 사이 위치를 말한다', () => {
    const comparison = landing.querySelector('[data-story-chapter="03"]');
    assert.ok(comparison);
    const title = comparison.querySelector('[data-comparison-title]');
    const support = comparison.querySelector('[data-comparison-support]');
    assert.ok(title && support);
    assert.equal(title.textContent, '직접 만드는 것보다 쉽고,\n맡기는 것보다 빠릅니다.');
    assert.equal(title.querySelectorAll('br').length, 1);
    assert.match(title.getAttribute('class') ?? '', /text-balance break-keep/u);
    assert.equal(
      support.textContent,
      '다보임이 처음부터 끝까지 만들어 드립니다. 사장님은 원하는 것만 말씀하세요. 오픈 후에는 매달 성과를 숫자로 받아봅니다.',
    );
    assert.doesNotMatch(`${title.textContent} ${support.textContent}`, /다듬|수정|고르/u);
  });

  test('P7 무료진단은 장식 레이어와 전문용어를 걷고 한 문장·입력·CTA에 집중한다', () => {
    const scanner = landing.querySelector('#hero-scanner');
    assert.ok(scanner);
    const lead = scanner.querySelector('[data-scan-lead]');
    assert.ok(lead);
    assert.equal(
      lead.textContent.trim(),
      '홈페이지 주소를 넣으면 손님이 검색하거나 AI에 물을 때 빠진 정보를 바로 보여드립니다.',
    );
    assert.equal(scanner.querySelectorAll('#landing-scan-url').length, 1);
    assert.equal(scanner.querySelectorAll('button').some((button) => button.textContent.includes('내 사이트 무료 진단')), true);
    assert.doesNotMatch(scanner.textContent, /\b(?:SEO|AEO|GEO|1080P|MUTED|LAZY-LOADED)\b/u);
    assert.equal(scanner.textContent.includes('검색 · 질문 · AI 정보 확인'), true);

    const consoleSource = read('src/components/marketing/OptimizationConsole.tsx');
    const showcaseSource = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.doesNotMatch(consoleSource, /bg-gradient-to-br from-\[#174DDA\]\/5 via-transparent to-\[#03D1B8\]\/16 mix-blend-multiply/u);
    assert.doesNotMatch(consoleSource, /absolute -inset-8 rounded-full|absolute inset-y-0 w-24 -skew-x-12/u);
    assert.doesNotMatch(showcaseSource, /data-lcs-hero-ambient|bg-\[size:56px_56px\]/u);
  });

  test('P1/P2 기술 배지 rail과 죽은 전체 오버레이가 필름 출력에 재등장하지 않는다', () => {
    const film = landing.querySelector('[data-landing-manifesto]');
    assert.ok(film);
    for (const badge of [
      'SEMANTIC HTML',
      'JSON-LD',
      'NAVER INDEXNOW',
      'MULTI-PAGE SSR',
      'SSL HOSTING',
      'CANVAS EDITOR',
    ]) {
      assert.equal(film.textContent.includes(badge), false, `필름 기술 배지 재등장: ${badge}`);
    }

    const showcase = read('src/components/marketing/LandingCinematicShowcase.tsx');
    const fullFilm = read('src/components/marketing/LandingFullFilm.tsx');
    assert.doesNotMatch(showcase, /TECH_RAIL|bg-\[#07142F\]\/45|backdrop-blur-xl/u);
    assert.doesNotMatch(
      `${showcase}\n${fullFilm}`,
      /bg-\[linear-gradient\(to_bottom,rgba\(255,255,255,\.05\),rgba\(255,255,255,0\)_50%,rgba\(248,251,255,\.82\)\)\]/u,
    );
  });

  test('P3 랜딩 필름은 데스크·모바일 화질 예산과 poster-first CWV 계약을 지킨다', () => {
    const desktopPath = 'public/daboim-visibility-film-scrub.mp4';
    const mobilePath = 'public/daboim-visibility-film-mobile.mp4';
    const desktop = videoProbe(desktopPath);
    const mobile = videoProbe(mobilePath);
    const desktopVideo = desktop.streams.find((stream) => stream.codec_type === 'video');
    const mobileVideo = mobile.streams.find((stream) => stream.codec_type === 'video');

    assert.deepEqual(
      [desktopVideo?.codec_name, desktopVideo?.width, desktopVideo?.height, desktopVideo?.pix_fmt],
      ['h264', 1920, 1080, 'yuv420p'],
    );
    assert.deepEqual(
      [mobileVideo?.codec_name, mobileVideo?.width, mobileVideo?.height, mobileVideo?.pix_fmt],
      ['h264', 1600, 900, 'yuv420p'],
    );
    assert.equal(desktop.streams.some((stream) => stream.codec_type === 'audio'), false);
    assert.equal(mobile.streams.some((stream) => stream.codec_type === 'audio'), false);
    assert.ok(statSync(join(ROOT, desktopPath)).size <= 10_000_000);
    assert.ok(statSync(join(ROOT, mobilePath)).size <= 4_000_000);

    const stage = landing.querySelector('[data-landing-full-film-stage]')!;
    assert.equal(stage.querySelectorAll('video').length, 1);
    assert.equal(stage.querySelectorAll('video[preload="none"][width="1920"][height="1080"]').length, 1);
    assert.equal(stage.querySelectorAll('video source').length, 2);
    assert.equal(landing.querySelectorAll('link[rel="preload"][as="image"][href="/daboim-visibility-film-poster.webp"]').length, 1);
    assert.equal(landing.querySelectorAll('script[src]').length, 0);
  });

  test('P4/P4b 필름 막은 패널 없이 preset대로 움직이고 이후 DOM 모션과 끊김 없이 분리된다', () => {
    const fullFilm = read('src/components/marketing/LandingFullFilm.tsx');
    const stage = landing.querySelector('[data-landing-full-film-stage]')!;
    const upper = stage.querySelector('[data-landing-manifesto][data-m-progress]');
    const continuation = stage.querySelector('[data-landing-continuation][data-m-progress]');
    assert.ok(upper && continuation);
    assert.equal(upper.querySelectorAll('video').length, 1);
    assert.equal(continuation.querySelectorAll('video').length, 0);
    assert.equal(continuation.querySelectorAll('[data-story-chapter]').length, 8);

    const acts = upper.querySelectorAll('[data-ss-act]');
    assert.deepEqual(acts.map((act) => act.getAttribute('data-ss-composition')), ['left', 'right', 'left', 'right', 'left']);
    assert.equal(upper.querySelector('[data-ss-act-list]')?.getAttribute('data-ss-composition-pattern'), 'alternate-lr');
    assert.equal(upper.querySelectorAll('[data-ss-word]').length > acts.length, true);
    assert.match(MOTION_CSS, /m-scrollytelling-ready \[data-ss-copy\][^{]*\{[^}]*padding: 0;[^}]*border: 0;[^}]*background: none/);
    assert.match(MOTION_CSS, /\[data-ss-media\][^{]*\{[^}]*height: 100svh/);
    assert.match(MOTION_CSS, /m-scrollytelling-ready \[data-ss-media\][^{]*\{[^}]*height: 100svh/);
    assert.match(fullFilm, /\.daboim-cinematic \[data-signature-id="scrollytelling-manifesto"\] \[data-ss-media\][^{]*\{[^}]*position: fixed !important/);
    assert.doesNotMatch(fullFilm, /m-scrollytelling-ready[^\n{]*\[data-ss-media\]/);
    assert.match(fullFilm, /prefers-reduced-motion: reduce[\s\S]*\[data-ss-media\][^{]*\{[^}]*position: relative !important/);
    assert.doesNotMatch(MOTION_CSS, /data-cinematic-scrim/);
    assert.match(read('src/components/marketing/LandingCinematicShowcase.tsx'), /@media \(prefers-reduced-motion: reduce\)/u);
  });

  test('P6 생성 사이트는 공통 구도 기본값·장면 통합 타이포·영상 확대 가드를 방출한다', () => {
    assert.deepEqual(CINEMATIC_COMPOSITION_DEFAULTS, {
      'cinematic-scrub': 'left',
      'scrollytelling-manifesto': 'alternate-lr',
      'portal-zoom': 'alternate-lr',
      'scroll-curtain': 'alternate-lr',
      'horizontal-story': 'alternate-lr',
    });
    assert.equal(VIDEO_HERO_MIN_WIDTH, 1920);
    assert.equal(VIDEO_HERO_MIN_HEIGHT, 1080);
    assert.equal(VIDEO_MIN_AVERAGE_BITRATE_BPS, 4_000_000);
    assert.equal(VIDEO_MAX_COVER_UPSCALE_RATIO, 1.15);
    assert.match(MOTION_RUNTIME, /refreshVideoQualityGuards[\s\S]*coverScale>1\.15/u);
    assert.doesNotMatch(MOTION_RUNTIME, /publishDispose\(disposeStatic\);\s*refreshVideoQualityGuards\(\)/u);
    assert.match(
      MOTION_RUNTIME,
      /roots\.forEach\(function\(root\)\{[\s\S]*root\.classList\.toggle\('m-cinematic-ready'[\s\S]*\n    \}\);[\s\S]*Geometry reads must happen after[\s\S]*refreshVideoQualityGuards\(\)/u,
    );

    for (const slug of FICTIONAL_DEMO_SLUGS) {
      const config = configForFictionalDemoPreview(buildFictionalDemo(slug));
      const html = renderToStaticMarkup(createElement(SiteRenderer, {
        config,
        tier: 'premium',
        interactive: true,
        animate: true,
        runtimeDelivery: 'client',
      }));
      const root = parse(html);
      const guardedVideo = root.querySelector('[data-video-quality-guard]');
      assert.ok(guardedVideo, `${slug}: 영상 확대 가드 누락`);
      assert.ok(Number(guardedVideo.getAttribute('data-source-width')) > 0);
      assert.ok(Number(guardedVideo.getAttribute('data-source-height')) > 0);
      assert.equal(root.querySelectorAll('[data-cinematic-scrim]').length, 0);
      assert.equal(root.querySelectorAll('script').length, 0);
      assert.ok(root.querySelector('[data-ss-word], [data-cinematic-word]'), `${slug}: 단어 시차 마크업 누락`);
    }
  });

  test('SEO/no-JS 불변식은 전 카피와 정적 가시성을 보존한다', () => {
    const expected = [
      '손님이 내 가게를 검색할 때',
      '손님이 검색하면, 가게를 찾기 쉽게.',
      '지금 보고 계신 이 홈페이지가 다보임으로 만든 예시입니다.',
      '손님이 찾고 궁금해할 내용을 홈페이지에 먼저 담아드립니다.',
      '손님이 가게를 찾는 세 순간을 한 번에.',
      '사장님이 중간마다 고르고, 확인한 만큼만 만들어집니다.',
      '카페와 병원은 같은 홈페이지일 수 없습니다.',
      '결정 전에 많이 묻는 질문',
    ];
    const text = landing.textContent.replace(/\s+/gu, ' ');
    for (const copy of expected) assert.ok(text.includes(copy), `정적 HTML 카피 누락: ${copy}`);
    for (const element of landing.querySelectorAll('h1, h2, h3, p, a, button')) {
      assert.doesNotMatch(element.getAttribute('style') ?? '', /opacity:\s*0|visibility:\s*hidden/u);
    }
    assert.ok(landing.querySelector('noscript'));
  });
});
