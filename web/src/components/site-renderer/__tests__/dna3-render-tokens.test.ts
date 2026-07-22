import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { ElementContent } from '@/components/site-renderer/ElementContent';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import { emptySiteConfig, type SiteConfig, type TextElement } from '@/lib/types/site';

function fixture(theme: SiteConfig['theme']): SiteConfig {
  return {
    version: 2,
    theme,
    meta: { title: 'DNA3 렌더 토큰' },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: 'sec-hero',
        type: 'hero',
        name: '첫 화면',
        height: 800,
        background: { color: theme.palette.surface },
        elements: [
          {
            id: 'el-hero-title-1',
            kind: 'text',
            frame: { x: 120, y: 120, w: 800, h: 300 },
            z: 2,
            text: '서로 다른 디자인 패밀리',
            style: { fontSize: 76, lineHeight: 1.3, fontWeight: 700, fontFamily: 'heading' },
          },
          {
            id: 'el-feat-card-1',
            kind: 'shape',
            shape: 'rect',
            frame: { x: 120, y: 440, w: 360, h: 220 },
            z: 1,
            style: { fill: theme.palette.surface, borderColor: theme.palette.muted, borderWidth: 1, borderRadius: 4 },
          },
          {
            id: 'el-photo-1',
            kind: 'image',
            frame: { x: 520, y: 440, w: 320, h: 220 },
            z: 2,
            src: '/mock/candidate-light.svg',
            alt: '고정 검수 이미지',
            style: { borderRadius: 4, shadow: true },
          },
          {
            id: 'el-cta-1',
            kind: 'button',
            frame: { x: 880, y: 440, w: 220, h: 56 },
            z: 2,
            label: '문의하기',
            href: '#contact',
            style: { variant: 'solid', borderRadius: 4 },
          },
        ],
      }],
    }],
  };
}

const render = (config: SiteConfig, mode: 'desktop' | 'mobile') => renderToStaticMarkup(
  createElement(SiteRenderer, { config, mode, interactive: false, animate: false }),
);

describe('DNA3 SiteTheme renderer tokens', () => {
  test('토큰이 없는 legacy/OFF 설정은 schema round-trip 전후 HTML이 바이트 동일하다', () => {
    const config = fixture(emptySiteConfig('legacy').theme);
    const parsed = siteConfigSchema.parse(config) as SiteConfig;
    const before = render(config, 'desktop');
    const after = render(parsed, 'desktop');
    assert.equal(after, before);
    assert.doesNotMatch(after, /data-theme-tokens|--theme-shadow|oklch\(/u);
    assert.match(after, /border-radius:0\.2778cqw/u, 'legacy 4px canvas radius contract changed');
  });

  test('DNA 테마는 radius·spacing·type·ramp·shadow/easing을 한 렌더 계약에서 소비한다', () => {
    const theme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 31, {
      density: 'airy',
      radius: 'rounded',
      typeRatio: 'perfect-fourth',
    }));
    const config = fixture(theme);
    assert.equal(siteConfigSchema.safeParse(config).success, true);

    const desktop = render(config, 'desktop');
    const mobile = render(config, 'mobile');
    assert.match(desktop, /data-theme-tokens="1"/u);
    assert.match(desktop, /border-radius:1\.5rem/u, 'soft radius is not applied to cards/media');
    assert.match(desktop, /border-radius:0\.5rem/u, 'sharp radius is not applied to buttons');
    assert.match(desktop, /oklch\(0\.8600/u, 'surfaceStrong ramp step is not rendered');
    assert.match(desktop, /--theme-shadow-high:/u);
    assert.match(desktop, /cubic-bezier\(0\.4, 0, 0\.2, 1\)/u);
    assert.match(mobile, /padding:5\.4rem 2rem/u, 'airy section rhythm is not rendered');
    assert.match(mobile, /gap:1\.6667rem/u, 'airy element gap is not rendered');
    assert.match(mobile, /font-size:52px/u, 'DNA display ratio is not rendered');
  });

  test('저장 경계는 renderer token의 임의 단위·추가 필드를 거부한다', () => {
    const theme = tokenSetToSiteTheme(expandTokens('medical-clinical-clarity', 192));
    const config = fixture(theme);
    assert.equal(siteConfigSchema.safeParse({
      ...config,
      theme: {
        ...theme,
        tokens: { ...theme.tokens, radius: { ...theme.tokens?.radius, soft: '24px' } },
      },
    }).success, false);
    assert.equal(siteConfigSchema.safeParse({
      ...config,
      theme: {
        ...theme,
        tokens: { ...theme.tokens, arbitraryHex: '#ffffff' },
      },
    }).success, false);
  });

  test('outline-tag 텍스트는 DNA surface·radius와 분리된 투명 인라인 태그다', () => {
    const theme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 31));
    const element: TextElement = {
      id: 'el-hero-chip-label-1',
      kind: 'text',
      frame: { x: 122, y: 612, w: 360, h: 40 },
      z: 4,
      text: '매일 직접 굽는 빵',
      style: {
        fontSize: 13,
        fontFamily: 'body',
        color: '#ffffff',
        align: 'center',
        appearance: 'outline-tag',
      },
    };
    const tag = renderToStaticMarkup(createElement(ElementContent, {
      element,
      theme,
      variant: 'canvas',
    }));
    const legacy = renderToStaticMarkup(createElement(ElementContent, {
      element: { ...element, style: { ...element.style, appearance: undefined } },
      theme,
      variant: 'canvas',
    }));

    assert.match(tag, /display:inline-flex/u);
    assert.match(tag, /width:fit-content/u);
    assert.match(tag, /background-color:transparent/u);
    assert.match(tag, /border:1px solid currentColor/u);
    assert.match(tag, /border-radius:999px/u);
    assert.doesNotMatch(legacy, /display:inline-flex|border-radius:999px|max-width/u);
  });
});
