import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLINIC_FLOW_CSS,
  ClinicFlowSection,
} from '@/components/site-renderer/ClinicFlowSection';
import { ClinicInsuranceStrip } from '@/components/site-renderer/ClinicInsuranceStrip';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import {
  resolveSectionSurfaceTone,
  sectionSurfaceLightnessDelta,
} from '@/lib/design/site-theme-tokens';
import { resolveTypographyTracking } from '@/lib/design/typography-tracking';
import type { Section, SitePage } from '@/lib/types/site';
import type { ProspectPublicSourceBlock } from '@/lib/us-demo/contracts';
import { applyClinicSurfaceCadence } from '@/lib/us-demo/full-preview';
import { buildClinicDarkValueBandSection } from './layout-sections';
import { resolveClinicMasterTheme } from './tokens';

const baseTheme = tokenSetToSiteTheme(expandTokens('medical-clinical-clarity', 207));
const theme = resolveClinicMasterTheme(baseTheme, {
  version: 1,
  masterId: 'premium-dental-v1',
  accentPreset: 'clean-blue',
  typographyPreset: 'clinic-editorial',
  density: 'airy',
  focus: 'balanced',
  demoPitchLocale: 'en',
  paletteSource: {
    version: 1,
    kind: 'neutral',
    sourceSha256: 'a'.repeat(64),
  },
  stockManifestVersion: 1,
});

function section(id: string, type: Section['type'] = 'features'): Section {
  return {
    id,
    type,
    name: id,
    height: 400,
    background: { color: theme.palette.background },
    elements: [],
  };
}

function page(id: string, sections: Section[]): SitePage {
  return { id, title: id, slug: id === 'home' ? '' : id, sections };
}

function source(id: string, text: string): ProspectPublicSourceBlock {
  return {
    id,
    origin: 'prospect_public_source',
    kind: 'service_detail',
    text,
    sourceUrl: 'https://clinic.example/implants',
    sourceLocation: { field: 'body', ordinal: 1 },
    originalSha256: 'b'.repeat(64),
  };
}

describe('CLINIC C surface-tone policy', () => {
  test('ramps가 있을 때 4 enum을 OKLCH 표면으로 풀고 dark 텍스트를 자동 반전한다', () => {
    const base = resolveSectionSurfaceTone(theme, 'base');
    const tint = resolveSectionSurfaceTone(theme, 'tint');
    const brand = resolveSectionSurfaceTone(theme, 'brand');
    const dark = resolveSectionSurfaceTone(theme, 'dark');
    assert.equal(base.resolvedTone, 'base');
    assert.equal(tint.resolvedTone, 'tint');
    assert.match(tint.background, /^oklch\(0\.9200 0\.0150 /u);
    assert.match(brand.background, /^oklch\(0\.9500 /u);
    assert.equal(sectionSurfaceLightnessDelta(theme, 'tint'), 0.08);
    assert.equal(dark.background, theme.tokens?.color.ramps?.neutral['950']);
    assert.equal(dark.text, theme.tokens?.color.ramps?.neutral['50']);
    assert.equal(dark.dark, true);
  });

  test('ramps 부재는 tone 요청을 semantic base 단톤으로 fail-closed한다', () => {
    const { tokens: _tokens, ...withoutRamps } = theme;
    void _tokens;
    for (const tone of ['base', 'tint', 'brand', 'dark'] as const) {
      const paint = resolveSectionSurfaceTone(withoutRamps, tone);
      assert.equal(paint.requestedTone, tone);
      assert.equal(paint.resolvedTone, 'base');
      assert.equal(paint.background, withoutRamps.palette.background);
      assert.equal(paint.text, withoutRamps.palette.text);
      assert.equal(paint.dark, false);
    }
  });

  test('substantial page는 tint 2연속·MID dark 1·CTA brand, short page는 단톤이다', () => {
    const substantial = applyClinicSurfaceCadence([
      page('home', [
        section('hero', 'hero'),
        section('overview'),
        section('services'),
        section('process'),
        section('faq', 'faq'),
        section('cta', 'cta'),
      ]),
    ])[0];
    assert.deepEqual(
      substantial.sections.map((candidate) => candidate.surfaceTone),
      ['base', 'tint', 'tint', 'dark', 'base', 'brand'],
    );
    const compactSubstantial = applyClinicSurfaceCadence([
      page('compact', [
        section('hero', 'hero'),
        section('overview'),
        section('process'),
        section('faq', 'faq'),
        section('cta', 'cta'),
      ]),
    ])[0];
    assert.deepEqual(
      compactSubstantial.sections.map((candidate) => candidate.surfaceTone),
      ['base', 'tint', 'tint', 'dark', 'brand'],
    );
    const short = applyClinicSurfaceCadence([
      page('emergency', [
        section('hero', 'hero'),
        section('overview'),
        section('cta', 'cta'),
      ]),
    ])[0];
    assert.deepEqual(short.sections.map((candidate) => candidate.surfaceTone), [
      'base',
      'base',
      'base',
    ]);
  });

  test('dark-value-band는 source statement 1개를 dark surface의 실제 flow DOM으로 렌더한다', () => {
    const statement = source(
      'statement',
      'Implant treatment planning starts with a detailed consultation.',
    );
    const band = buildClinicDarkValueBandSection({
      id: 'clinic-dark-value',
      name: 'Treatment planning',
      theme,
      statement: { id: 'statement', title: statement },
    });
    assert.equal(band.sectionLayout?.resolvedId, 'features.dark-value-band');
    assert.equal(band.surfaceTone, 'dark');
    const html = renderToStaticMarkup(createElement(ClinicFlowSection, {
      section: band,
      theme,
    }));
    assert.match(html, /data-section-surface-tone="dark"/u);
    assert.match(html, /data-clinic-flow-section="features\.dark-value-band"/u);
    assert.match(html, /Implant treatment planning starts with a detailed consultation\./u);
    assert.match(html, /data-clinic-typography-tier="display"/u);
    assert.match(html, /letter-spacing:-0\.025em/u);
  });

  test('보험 로고 전용 renderer도 공통 surface tone과 dark 자동반전을 소비한다', () => {
    const insurance: Section = {
      ...section('clinic-accepted-insurance', 'custom'),
      name: 'Accepted Insurance',
      surfaceTone: 'dark',
      elements: [{
        id: 'clinic-insurance-title',
        kind: 'text',
        text: 'Accepted Insurance',
        frame: { x: 0, y: 0, w: 100, h: 20 },
        z: 1,
        style: { fontSize: 40, fontWeight: 600, color: theme.palette.text },
      }, {
        id: 'clinic-insurance-logo',
        kind: 'image',
        src: '/clinic/provider-placeholder.svg',
        alt: 'Insurance source logo',
        frame: { x: 0, y: 20, w: 50, h: 30 },
        z: 1,
        style: { objectFit: 'contain' },
      }],
    };
    const html = renderToStaticMarkup(createElement(ClinicInsuranceStrip, {
      section: insurance,
      theme,
      variant: 'canvas',
    }));
    assert.match(html, /data-section-surface-tone="dark"/u);
    assert.match(html, /data-section-surface-enhanced="true"/u);
    assert.match(html, /background-color:oklch\(0\.0900/u);
    assert.match(html, /color:oklch\(0\.9700/u);
    assert.match(html, /data-clinic-tracking-role="heading"/u);
    assert.match(html, /letter-spacing:-0\.01em/u);
  });

  test('tracking은 공통 size×uppercase 함수 하나로 음수·양수·body 범위를 결정한다', () => {
    assert.equal(resolveTypographyTracking({
      fontSizePx: 88,
      uppercase: false,
      role: 'display',
    }), '-0.025em');
    assert.equal(resolveTypographyTracking({
      fontSizePx: 52,
      uppercase: false,
      role: 'heading',
    }), '-0.01em');
    assert.equal(resolveTypographyTracking({
      fontSizePx: 14,
      uppercase: true,
      role: 'eyebrow',
    }), '0.12em');
    assert.equal(resolveTypographyTracking({
      fontSizePx: 16,
      uppercase: false,
      role: 'body',
    }), '0em');
    assert.equal(resolveTypographyTracking({
      fontSizePx: 16,
      uppercase: false,
      role: 'button',
    }), '0em');
    assert.match(CLINIC_FLOW_CSS, /font-weight: var\(--clinic-control-weight\)/u);
    assert.doesNotMatch(CLINIC_FLOW_CSS, /letter-spacing\s*:/u);
  });
});
