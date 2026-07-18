import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElementContent } from '@/components/site-renderer/ElementContent';
import { emptySiteConfig, type TextElement } from '@/lib/types/site';
import {
  DABOIM_TYPOGRAPHY,
  GENERATED_TEXT_ROLE_RULES,
  generatedType,
  resolveRenderedSiteTypography,
} from '@/lib/design/typography-scale';

const root = process.cwd();
const theme = emptySiteConfig('lp3-type').theme;

function textElement(
  fontSize: number,
  lineHeight?: number,
  options: { id?: string; frameHeight?: number } = {},
): TextElement {
  return {
    id: options.id ?? `lp3-${fontSize}`,
    kind: 'text',
    frame: { x: 0, y: 0, w: 640, h: options.frameHeight ?? 120 },
    z: 1,
    text: '사장님 이야기를 손님이 편하게 읽을 수 있습니다.',
    style: { fontSize, lineHeight, fontFamily: 'body', align: 'left' },
  };
}

describe('LP$ L3 기존 발행본 가독성 상향', () => {
  test('넉넉한 canvas와 고정 높이가 없는 stack은 중앙 토큰으로 한 단계 커진다', () => {
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'el-contact-value-legacy',
      style: { fontSize: 15, lineHeight: 1.7, fontFamily: 'body' },
      variant: 'canvas',
      frameHeight: 32,
    }), {
      fontSize: DABOIM_TYPOGRAPHY.generatedSite.body.fontSize,
      lineHeight: DABOIM_TYPOGRAPHY.generatedSite.body.lineHeight,
    });
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'legacy-long-body',
      style: { fontSize: 16, lineHeight: 1.9, fontFamily: 'body' },
      variant: 'stack',
      frameHeight: 20,
    }), {
      fontSize: DABOIM_TYPOGRAPHY.generatedSite.longBody.fontSize,
      lineHeight: DABOIM_TYPOGRAPHY.generatedSite.longBody.lineHeight,
    });
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'legacy-support',
      style: { fontSize: 12, fontFamily: 'body' },
      variant: 'stack',
      frameHeight: 18,
    }), {
      fontSize: DABOIM_TYPOGRAPHY.generatedSite.support.fontSize,
      lineHeight: DABOIM_TYPOGRAPHY.generatedSite.support.lineHeight,
    });
  });

  test('큰 제목과 명시적 본문 행간이 없는 작은 제목은 저장값을 보존한다', () => {
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'legacy-heading',
      style: { fontSize: 40, lineHeight: 1.3, fontFamily: 'heading' },
      variant: 'canvas',
      frameHeight: 80,
    }), {
      fontSize: 40,
      lineHeight: 1.3,
    });
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'legacy-compact-title',
      style: { fontSize: 16, fontFamily: 'body' },
      variant: 'canvas',
      frameHeight: 24,
    }), {
      fontSize: 16,
      lineHeight: 1.45,
    });
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'el-map-label-center-heading-collision',
      style: { fontSize: 20, lineHeight: 1.3, fontFamily: 'heading' },
      variant: 'stack',
      frameHeight: 24,
    }), { fontSize: 20, lineHeight: 1.3 });
  });

  test('레거시 canvas는 확대된 행 상자를 담지 못하면 저장값을 보존한다', () => {
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'el-contact-label-legacy',
      style: { fontSize: 12, fontFamily: 'body' },
      variant: 'canvas',
      frameHeight: 20,
    }), { fontSize: 12, lineHeight: 1.45 });
    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'el-feat-desc-legacy',
      style: { fontSize: 15, lineHeight: 1.75, fontFamily: 'body' },
      variant: 'canvas',
      frameHeight: 80,
    }), { fontSize: 15, lineHeight: 1.75 });

    assert.deepEqual(resolveRenderedSiteTypography({
      elementId: 'el-feat-desc-legacy',
      style: { fontSize: 15, lineHeight: 1.75, fontFamily: 'body' },
      variant: 'stack',
      frameHeight: 80,
    }), generatedType('cardBody'));
  });

  test('생성기 역할은 렌더러에서 재분류되지 않고 모든 역할이 멱등이다', () => {
    for (const rule of GENERATED_TEXT_ROLE_RULES) {
      const token = generatedType(rule.role);
      const resolved = resolveRenderedSiteTypography({
        elementId: `el-${rule.fragments[0]}-fixture`,
        style: { ...token, fontFamily: 'body' },
        variant: 'canvas',
        frameHeight: Math.ceil(token.fontSize * token.lineHeight * rule.lines),
      });
      assert.deepEqual(resolved, token, rule.role);
    }
  });

  test('실제 canvas·mobile renderer가 같은 해석값을 소비한다', () => {
    const legacy = textElement(15, 1.7, {
      id: 'el-contact-value-legacy',
      frameHeight: 32,
    });
    const canvas = renderToStaticMarkup(createElement(ElementContent, {
      element: legacy, theme, variant: 'canvas',
    }));
    const mobile = renderToStaticMarkup(createElement(ElementContent, {
      element: legacy, theme, variant: 'stack',
    }));
    assert.match(canvas, /font-size:1\.1806cqw/); // 17 / DESIGN_WIDTH(1440) × 100
    assert.match(canvas, /line-height:1\.8/);
    assert.match(mobile, /font-size:17px/);
    assert.match(mobile, /line-height:1\.8/);
  });

  test('renderer의 타이포 상향 진입점은 ElementContent 한 곳뿐이다', () => {
    const rendererDir = join(root, 'src/components/site-renderer');
    const elementSource = readFileSync(join(rendererDir, 'ElementContent.tsx'), 'utf8');
    const canvasSource = readFileSync(join(rendererDir, 'SectionCanvas.tsx'), 'utf8');
    const stackSource = readFileSync(join(rendererDir, 'SectionStack.tsx'), 'utf8');
    assert.match(elementSource, /resolveRenderedSiteTypography/);
    assert.doesNotMatch(canvasSource, /typography-scale|resolveRenderedSiteTypography/);
    assert.doesNotMatch(stackSource, /typography-scale|resolveRenderedSiteTypography/);
  });

  test('auto renderer는 1280px 미만에서 읽기 좋은 flow stack을 사용한다', () => {
    const renderer = readFileSync(join(root, 'src/components/site-renderer/SiteRenderer.tsx'), 'utf8');
    const header = readFileSync(join(root, 'src/components/site-renderer/TenantHeader.tsx'), 'utf8');
    const shell = readFileSync(join(root, 'src/lib/export/document-shell.ts'), 'utf8');
    assert.match(renderer, /hidden xl:block/);
    assert.match(renderer, /xl:hidden/);
    assert.doesNotMatch(renderer, /hidden md:block/);
    assert.match(header, /hidden xl:flex/);
    assert.match(header, /xl:hidden/);
    assert.match(shell, /min-width:1280px/);
    assert.match(shell, /xl\\\\:block/);
  });
});
