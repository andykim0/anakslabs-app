import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Daboim 브랜드·랜딩 불변조건', () => {
  test('무료 진단은 랜딩 첫 히어로의 핵심 진입점이다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const cinematic = page.indexOf('<LandingCinematicShowcase />');
    const engineSection = page.indexOf('ONE SITE · THREE ENGINES');
    assert.ok(cinematic >= 0, '무료 진단을 품은 매니페스토 컴포넌트가 랜딩에서 사라짐');
    assert.ok(engineSection > cinematic, '무료 진단이 후속 설명 섹션보다 뒤로 밀림');

    const manifesto = read('src/components/marketing/LandingCinematicShowcase.tsx');
    assert.match(manifesto, /<LandingScanner \/>/);
    const scannerSource = read('src/components/landing/LandingScanner.tsx');
    assert.match(scannerSource, /id="hero-scanner"/);
    assert.match(scannerSource, /내 사이트 무료 진단/);
    assert.match(scannerSource, /손님이 내 가게를[\s\S]*검색할 때,[\s\S]*홈페이지가 보일까요/);
  });

  test('Daboim 로고는 독립 SVG 자산이며 blue→cyan→mint 신호색을 유지한다', () => {
    const mark = read('public/daboim-mark.svg');
    assert.match(mark, /viewBox="0 0 44 44"/);
    for (const color of ['#174DDA', '#08B8E8', '#03D1B8']) assert.ok(mark.includes(color), `${color} 누락`);
    assert.doesNotMatch(mark, /<image\b/);

    const header = read('src/components/marketing/MarketingHeader.tsx');
    const footer = read('src/components/marketing/MarketingFooter.tsx');
    assert.match(header, /<BrandLogo \/>/);
    assert.match(footer, /<BrandLogo inverse/);
  });

  test('스크롤 진단 CTA는 예약 폭 안에서만 나타나 헤더 CLS를 만들지 않는다', () => {
    const header = read('src/components/marketing/MarketingHeader.tsx');
    assert.match(header, /w-\[100px\] shrink-0/);
    assert.match(header, /aria-hidden=\{!showScannerCta\}/);
    assert.match(header, /tabIndex=\{showScannerCta \? undefined : -1\}/);
    assert.doesNotMatch(header, /AnimatePresence/, 'CTA DOM 삽입으로 로그인 버튼을 밀면 안 됨');
  });

  test('SEO/AEO/GEO 주장은 보장이 아니라 읽히는 기반으로 제한한다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    assert.match(page, /순위나 노출은 보장하지/);
    assert.match(page, /기본 포함 — 네이버·구글·AI까지 설계/);
    assert.match(page, /application\/ld\+json/);
  });

  test('Veo 3D 필름은 웹 최적화 자산 + 지연 로드 + reduced-motion 폴백을 갖는다', () => {
    for (const asset of [
      'public/daboim-visibility-film.mp4',
      'public/daboim-visibility-film.webm',
      'public/daboim-visibility-film-poster.webp',
    ]) {
      const bytes = statSync(join(root, asset)).size;
      assert.ok(bytes > 0, `${asset} 비어 있음`);
      assert.ok(bytes < 2 * 1024 * 1024, `${asset} 2MB 초과`);
    }
    const visual = read('src/components/marketing/OptimizationConsole.tsx');
    assert.match(visual, /Veo 3\.1 Fast/);
    assert.match(visual, /daboim-brand-video-1080-2/);
    assert.match(visual, /기존 Anaks Labs 브랜드 영상과 무관/);
    assert.match(visual, /1080p MP4\/WebM/);
    assert.doesNotMatch(visual, /1920×1080 · MUTED · LAZY-LOADED/);
    assert.match(visual, /IntersectionObserver/);
    assert.match(visual, /useFailClosedReducedMotion/);
    assert.match(visual, /daboim-visibility-film\.webm/);
    assert.match(visual, /daboim-visibility-film-poster\.webp/);
  });
});
