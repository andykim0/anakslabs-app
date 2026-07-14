import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Daboim 브랜드·랜딩 불변조건', () => {
  test('무료 진단은 랜딩 첫 히어로의 핵심 진입점이다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    const scanner = page.indexOf('<LandingScanner />');
    const engineSection = page.indexOf('ONE SITE · THREE ENGINES');
    assert.ok(scanner >= 0, '무료 진단 컴포넌트가 랜딩에서 사라짐');
    assert.ok(engineSection > scanner, '무료 진단이 후속 설명 섹션보다 뒤로 밀림');

    const scannerSource = read('src/components/landing/LandingScanner.tsx');
    assert.match(scannerSource, /id="hero-scanner"/);
    assert.match(scannerSource, /내 사이트 무료 진단/);
    assert.match(scannerSource, /내 홈페이지,[\s\S]*검색과 AI가[\s\S]*제대로 읽고 있을까요/);
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

  test('SEO/AEO/GEO 주장은 보장이 아니라 읽히는 기반으로 제한한다', () => {
    const page = read('src/app/(marketing)/page.tsx');
    assert.match(page, /순위나 인용을 보장하지/);
    assert.match(page, /SEO·AEO·GEO가 생성 기본값/);
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
    assert.match(visual, /1920×1080/);
    assert.match(visual, /IntersectionObserver/);
    assert.match(visual, /useReducedMotion/);
    assert.match(visual, /daboim-visibility-film\.webm/);
    assert.match(visual, /daboim-visibility-film-poster\.webp/);
  });
});
