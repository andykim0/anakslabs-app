import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementContent } from '@/components/site-renderer/ElementContent';
import { MOTION_CSS } from '@/lib/motion/runtime';
import {
  ANAKS_TEXT_FLOW,
  GENERATED_TEXT_ROLE_RULES,
  textFlowFor,
} from '@/lib/design/typography-scale';
import { emptySiteConfig, type ButtonElement, type TextElement } from '@/lib/types/site';

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const theme = emptySiteConfig('lp2-f3-flow').theme;

function text(fontFamily: 'heading' | 'body'): TextElement {
  return {
    id: `lp2-f3-${fontFamily}`,
    kind: 'text',
    frame: { x: 0, y: 0, w: 640, h: 120 },
    z: 1,
    text: fontFamily === 'heading' ? '손님이 읽기 편한 한글 제목' : '긴 주소나 영문이 있어도 본문 폭을 지킵니다.',
    style: { fontSize: fontFamily === 'heading' ? 36 : 17, fontFamily, lineHeight: 1.7 },
  };
}

describe('LP2$ F3 Korean text flow and no-wrap controls', () => {
  test('공용 helper는 제목 balance·본문 pretty와 긴 토큰 비상 줄바꿈을 구분한다', () => {
    assert.deepEqual(textFlowFor('heading'), ANAKS_TEXT_FLOW.heading);
    assert.deepEqual(textFlowFor('body'), ANAKS_TEXT_FLOW.body);
    assert.deepEqual(textFlowFor(undefined), ANAKS_TEXT_FLOW.body);
    assert.deepEqual(ANAKS_TEXT_FLOW.heading, {
      wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'balance',
    });
    assert.deepEqual(ANAKS_TEXT_FLOW.body, {
      wordBreak: 'keep-all', overflowWrap: 'anywhere', textWrap: 'pretty',
    });
  });

  test('마케팅 역할 CSS가 제목과 본문을 중앙에서 나누고 control은 한 줄로 제한한다', () => {
    const css = source('src/app/globals.css');
    const heading = css.match(
      /\.anakslabs-marketing \.mkt-type-hero,[\s\S]*?\.mkt-type-table-title\s*\{([^}]+)\}/,
    );
    const body = css.match(
      /\.anakslabs-marketing \.mkt-type-body,[\s\S]*?\.mkt-type-support\s*\{([^}]+)\}/,
    );
    const control = css.match(/\.anakslabs-marketing \.mkt-type-control\s*\{([^}]+)\}/);
    assert.ok(heading && body && control);
    assert.match(heading[1], /word-break:\s*keep-all/);
    assert.match(heading[1], /overflow-wrap:\s*anywhere/);
    assert.match(heading[1], /text-wrap:\s*balance/);
    assert.match(body[1], /word-break:\s*keep-all/);
    assert.match(body[1], /overflow-wrap:\s*anywhere/);
    assert.match(body[1], /text-wrap:\s*pretty/);
    assert.match(control[1], /white-space:\s*nowrap/);
    assert.doesNotMatch(control[1], /text-overflow:\s*ellipsis/);
    assert.match(css, /\.mkt-type-control > svg\s*\{[^}]*flex:\s*0 0 auto/);
    assert.match(source('src/components/marketing/MarketingHeader.tsx'), /className="shrink-0"/);
    assert.match(source('src/components/brand/BrandLogo.tsx'), /shrink-0[^"\n]*whitespace-nowrap|whitespace-nowrap[^"\n]*shrink-0/);
  });

  test('production renderer와 editor mirror가 같은 text-flow helper를 소비한다', () => {
    const heading = renderToStaticMarkup(createElement(ElementContent, {
      element: text('heading'), theme, variant: 'stack',
    }));
    const body = renderToStaticMarkup(createElement(ElementContent, {
      element: text('body'), theme, variant: 'stack',
    }));
    assert.match(heading, /word-break:keep-all/);
    assert.match(heading, /overflow-wrap:anywhere/);
    assert.match(heading, /text-wrap:balance/);
    assert.match(body, /word-break:keep-all/);
    assert.match(body, /overflow-wrap:anywhere/);
    assert.match(body, /text-wrap:pretty/);

    const renderer = source('src/components/site-renderer/ElementContent.tsx');
    const editor = source('src/components/editor/ElementView.tsx');
    assert.match(renderer, /textFlowFor\(s\.fontFamily\)/);
    assert.equal(editor.match(/textFlowFor\(s\.fontFamily\)/g)?.length, 2);
    assert.doesNotMatch(renderer, /overflowWrap:\s*'break-word'/);
    assert.doesNotMatch(editor, /overflowWrap:\s*'break-word'/);
  });

  test('legacy scrollytelling과 signature v2가 같은 정적 줄바꿈 fallback을 가진다', () => {
    const legacyHeading = MOTION_CSS.match(/\[data-ss-heading\]\s*\{([^}]+)\}/);
    const legacyBody = MOTION_CSS.match(/\[data-ss-body\]\s*\{([^}]+)\}/);
    const signatureHeading = MOTION_CSS.match(/\[data-signature-heading\]\s*\{([^}]+)\}/);
    const signatureBody = MOTION_CSS.match(/\[data-signature-body\]\s*\{([^}]+)\}/);
    assert.ok(legacyHeading && legacyBody && signatureHeading && signatureBody);
    for (const block of [legacyHeading[1], signatureHeading[1]]) {
      assert.match(block, /word-break:\s*keep-all/);
      assert.match(block, /overflow-wrap:\s*anywhere/);
      assert.match(block, /text-wrap:\s*balance/);
    }
    for (const block of [legacyBody[1], signatureBody[1]]) {
      assert.match(block, /word-break:\s*keep-all/);
      assert.match(block, /overflow-wrap:\s*anywhere/);
      assert.match(block, /text-wrap:\s*pretty/);
    }
  });

  test('generated buttons fail safely on one line while hero statement chips keep their two-line contract', () => {
    const button: ButtonElement = {
      id: 'lp2-f3-button',
      kind: 'button',
      frame: { x: 0, y: 0, w: 172, h: 54 },
      z: 1,
      label: '아주 긴 문의 버튼 문구도 한 줄 계약을 지킵니다',
      href: '#contact',
      style: { variant: 'solid' },
    };
    const markup = renderToStaticMarkup(createElement(ElementContent, {
      element: button, theme, variant: 'canvas',
    }));
    const siteRenderer = source('src/components/site-renderer/SiteRenderer.tsx');
    assert.match(markup, /class="anaks-btn"/);
    assert.match(markup, /white-space:nowrap/);
    assert.match(siteRenderer, /\.anaks-btn \{[\s\S]*?white-space: nowrap/);
    assert.doesNotMatch(siteRenderer, /\.anaks-btn \{[\s\S]*?text-overflow: ellipsis/);

    const chipRule = GENERATED_TEXT_ROLE_RULES.find((rule) =>
      rule.fragments.includes('hero-chip-label'),
    );
    assert.ok(chipRule);
    assert.equal(chipRule.lines, 2);
    assert.doesNotMatch(source('src/components/site-renderer/ElementContent.tsx'), /hero-chip-label[\s\S]{0,120}nowrap/);
  });
});
