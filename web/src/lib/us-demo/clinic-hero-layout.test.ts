import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test, { describe } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer';
import type { CrawlArtifactPayload } from '@/lib/crawl/contracts';
import type { SiteConfig } from '@/lib/types/site';
import { compileUsMedicalDemo } from '@/lib/us-demo/source-compiler';
import { clinicHeroLayoutDecision, prospectPublicSourceImages } from './source-images';

const FIXTURES = resolve(process.cwd(), 'scripts/fixtures/us-demo-artifacts');
const SAMPLES = ['dental360', 'cameods', 'iddental'] as const;
const artifact = (name: string) => JSON.parse(
  readFileSync(`${FIXTURES}/t0-${name}.json`, 'utf8'),
) as CrawlArtifactPayload;
const configFor = (name: string) => compileUsMedicalDemo(artifact(name), { renderMode: 'preview-full' }).config;

function render(config: SiteConfig, pageSlug: string): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config, pageSlug, mode: 'desktop', interactive: false, animate: false,
  }));
}

function heroMarkup(html: string): string {
  const start = html.indexOf('data-section-type="hero"');
  if (start < 0) return '';
  const from = html.lastIndexOf('<section', start);
  const end = html.indexOf('</section>', start);
  return html.slice(from, end + 10);
}

describe('D2 — the hero layout decision is made once, at compile time', () => {
  test('치수를 재지 못하면 split, 1400px 이상 가로 사진만 fullbleed-panel', () => {
    const images = prospectPublicSourceImages(artifact('dental360'));
    const unknown = images.find((i) => clinicHeroLayoutDecision(i).reason === 'no measured dimensions')!;
    assert.equal(clinicHeroLayoutDecision(unknown).mode, 'split');
    const wide = images.find((i) => i.source.url.includes('CLIENT-scaled'))!;
    assert.deepEqual(clinicHeroLayoutDecision(wide), {
      version: 1, mode: 'fullbleed-panel', reason: 'landscape 2560x1621 from metadata',
    });
    // Landscape but not large enough stays split — the threshold is not negotiable downward.
    const narrow = images.find((i) => i.source.url.includes('female-dentist-adjusting-lamp'))!;
    assert.equal(clinicHeroLayoutDecision(narrow).mode, 'split');
    assert.match(clinicHeroLayoutDecision(narrow).reason, /under 1400px/u);
  });

  test('크롤 3건의 실제 모드 — fullbleed-panel 은 연락처 2건뿐이다', () => {
    const measured = SAMPLES.flatMap((name) => configFor(name).pages.map((page) => ({
      site: name,
      slug: page.slug || 'home',
      mode: page.sections.find((s) => s.type === 'hero')?.clinicHeroLayout?.mode ?? 'none',
    })));
    const fullbleed = measured.filter((m) => m.mode === 'fullbleed-panel');
    assert.deepEqual(fullbleed, [
      { site: 'dental360', slug: 'contact', mode: 'fullbleed-panel' },
      { site: 'iddental', slug: 'contact', mode: 'fullbleed-panel' },
    ]);
    // The stock-hero page carries no decision at all, so D3's fallback path is untouched.
    assert.equal(measured.filter((m) => m.mode === 'none').length, 1);
    assert.equal(measured.filter((m) => m.mode === 'split').length, measured.length - 3);
  });
});

describe('D2 — no mode puts text on a washed photograph', () => {
  test('두 모드 모두 이미지 위에 오버레이 요소를 만들지 않는다', () => {
    for (const name of SAMPLES) {
      const config = configFor(name);
      for (const page of config.pages) {
        const hero = page.sections.find((s) => s.type === 'hero');
        if (!hero?.clinicHeroLayout) continue;
        const markup = heroMarkup(render(config, page.slug));
        // The wash lives on [data-clinic-flow-hero-media]::after. Never emitting that element is
        // what makes the gradient unable to match — this is structural, not a screenshot claim.
        assert.doesNotMatch(markup, /data-clinic-flow-hero-media/u, `${name}/${page.slug}`);
        assert.doesNotMatch(markup, /opacity/iu, `${name}/${page.slug} carries an opacity`);
        assert.match(markup, /data-clinic-hero-mode="(?:split|fullbleed-panel)"/u);
        assert.match(markup, /data-clinic-hero-plate/u);
      }
    }
  });

  test('컴파일은 en-US 히어로에 overlayOpacity 를 더 이상 싣지 않는다', () => {
    for (const name of SAMPLES) {
      for (const page of configFor(name).pages) {
        const hero = page.sections.find((s) => s.type === 'hero');
        if (!hero?.clinicHeroLayout) continue;
        assert.equal(hero.background.image?.overlayOpacity, undefined, `${name}/${page.slug}`);
      }
    }
  });
});

describe('D2 — a config without the field is untouched', () => {
  test('필드가 없으면 기존 풀블리드 경로를 그대로 탄다', () => {
    const config = configFor('dental360');
    const legacy: SiteConfig = {
      ...config,
      pages: config.pages.map((page) => ({
        ...page,
        sections: page.sections.map(({ clinicHeroLayout: _dropped, ...section }) => section),
      })),
    };
    const markup = heroMarkup(render(legacy, ''));
    // Exactly the pre-D2 shape: copy nested inside the media div, which is what the wash paints.
    assert.match(markup, /data-clinic-flow-hero-media/u);
    assert.match(markup, /data-clinic-flow-section="hero\.split-left"/u);
    assert.doesNotMatch(markup, /data-clinic-hero-mode/u);
    // And the stylesheet gate follows the same field, so legacy bytes do not move either.
    assert.doesNotMatch(render(legacy, ''), /data-clinic-hero-plate/u);
  });

  test('ko-KR 컴파일은 overlayOpacity 를 계속 싣는다 — 변수를 세우는 유일한 경로다', async () => {
    const { buildClinicHeroSection } = await import('@/lib/clinic-engine/layout-sections');
    const config = configFor('dental360');
    const block = { id: 'b1', text: 'Clinic', originalSha256: 'a'.repeat(64) };
    const withDecision = buildClinicHeroSection({
      id: 'h', title: block as never, theme: config.theme,
      image: { src: 'https://x.test/a.jpg' } as never,
      clinicHeroLayout: { version: 1, mode: 'split', reason: 'test' },
    });
    const withoutDecision = buildClinicHeroSection({
      id: 'h', title: block as never, theme: config.theme,
      image: { src: 'https://x.test/a.jpg' } as never,
    });
    assert.equal(withDecision.background.image?.overlayOpacity, undefined);
    assert.equal(withoutDecision.background.image?.overlayOpacity, 0.78);
  });
});
