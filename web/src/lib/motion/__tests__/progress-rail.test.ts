import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { LandingStoryContinuation } from '@/components/marketing/LandingStoryContinuation';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  INTERIOR_NAMED_TEMPLATE_CATALOG as NAMED_TEMPLATE_CATALOG,
} from '@/lib/design/templates';
import { ACTIVE_SIGNATURE_CONTRACTS } from '@/lib/motion/signature-contract';
import {
  GENERATED_SITE_PROGRESS_RAIL,
  withGeneratedSiteProgressRail,
  withSiteCinematicDefault,
} from '@/lib/motion/site-cinematic';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const LEGACY_JSON_SHA256 =
  '0c8810db34bc47fbb68c2e57bbe3620ccdda6481de878762a85185563f18b43e';
const LEGACY_HTML_SHA256 =
  '20f6609ea95e176d5cc70e66e92782054b1c8669a4f76cef3a4f70b1887fb516';
const NUMBERED_JSON_SHA256 =
  '50088db33001ab01b231b732263d739be0c8ba8b10859b868b3b62c70db53467';
const OFF_JSON_SHA256 =
  '01d08588023e210b89a6eba0068c96e8d7b1a84e727196f3aee1071bea0b48e0';
const OFF_HTML_SHA256 =
  '27a24d9f5f9f5c904b85663a8ec1cc0e4beb80d71f34441b9cd7e49e644148a1';
const LANDING_HTML_SHA256 =
  '2b98449a18a4202cc0b1066b16664779c81b53506ca3501f2818d6ff2b06c1dd';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixture(): SiteConfig {
  const config = withSiteCinematicDefault(emptySiteConfig('레일 SHA 기준'));
  config.motion = { presetId: 'base-calm-v2', intensity: 'normal' };
  config.pages[0].sections = ['hero', 'story', 'contact'].map((id, index) => ({
    id,
    type: index === 0 ? 'hero' : index === 2 ? 'contact' : 'about',
    name: id,
    height: index === 0 ? 800 : 560,
    background: {
      color: index % 2 ? config.theme.palette.surface : config.theme.palette.background,
    },
    elements: [{
      id: `${id}-copy`,
      kind: 'text' as const,
      text: `${index + 1}번 섹션`,
      frame: { x: 120, y: 160, w: 720, h: 120 },
      z: 2,
      style: {
        fontSize: 52,
        fontFamily: 'heading' as const,
        color: config.theme.palette.text,
      },
    }],
  }));
  return config;
}

function render(config: SiteConfig, mode: 'desktop' | 'mobile' = 'desktop'): string {
  return renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode,
    interactive: false,
    animate: false,
    runtimeDelivery: 'client',
  }));
}

describe('RAIL R1b — 생성 사이트 진행 표시 전면 제거', () => {
  test('시그니처 계약은 레일을 소유하지 않고 신규 생성 정책은 none 단일값이다', () => {
    assert.equal(GENERATED_SITE_PROGRESS_RAIL, 'none');
    for (const contract of Object.values(ACTIVE_SIGNATURE_CONTRACTS)) {
      assert.equal('progressRail' in contract.renderContract, false);
    }
  });

  test('인테리어 24개 템플릿의 모든 시그니처 선택이 신규 생성에서 none으로 pin된다', () => {
    assert.equal(NAMED_TEMPLATE_CATALOG.length, 24);
    for (const template of NAMED_TEMPLATE_CATALOG) {
      const generated = applyGeneratedMotion(
        fixture(),
        'company_brand',
        'premium',
        { signatureId: template.recipe.motionSignatureId },
      );
      assert.equal(generated.siteCinematic?.progressRail, 'none', template.id);
    }
  });

  test('고객 모션 override와 기존 numbered 입력도 생성 경계를 통과하면 항상 none이다', () => {
    const numbered: SiteConfig = {
      ...fixture(),
      siteCinematic: { ...fixture().siteCinematic!, progressRail: 'numbered' },
    };
    for (const signatureId of ['path-journey', 'true-card-stack'] as const) {
      const generated = applyGeneratedMotion(
        numbered,
        'company_brand',
        'premium',
        { signatureId },
      );
      assert.equal(generated.motion?.requestedSignatureId, signatureId);
      assert.equal(generated.siteCinematic?.progressRail, 'none');
    }
  });

  test('SiteConfig 저장 경계가 optional pin을 보존하고 기존 미지정도 허용한다', () => {
    const missing = fixture();
    const pinned = withGeneratedSiteProgressRail(missing);
    assert.equal(siteConfigSchema.parse(missing).siteCinematic?.progressRail, undefined);
    assert.equal(siteConfigSchema.parse(pinned).siteCinematic?.progressRail, 'none');
  });
});

describe('RAIL R2 — 기존 SHA·랜딩·no-rail 시각 흔적', () => {
  test('기존 미지정과 명시 numbered JSON·HTML SHA를 고정한다', () => {
    const missing = fixture();
    const numbered: SiteConfig = {
      ...missing,
      siteCinematic: { ...missing.siteCinematic!, progressRail: 'numbered' },
    };
    assert.equal(sha256(JSON.stringify(missing)), LEGACY_JSON_SHA256);
    assert.equal(sha256(render(missing)), LEGACY_HTML_SHA256);
    assert.equal(sha256(JSON.stringify(numbered)), NUMBERED_JSON_SHA256);
    assert.equal(sha256(render(numbered)), LEGACY_HTML_SHA256);
    assert.equal(render(numbered), render(missing));
  });

  test('siteCinematic OFF는 기존 HTML을 유지하고 레일을 만들지 않는다', () => {
    const off = fixture();
    delete off.siteCinematic;
    const html = render(off);
    assert.equal(sha256(JSON.stringify(off)), OFF_JSON_SHA256);
    assert.equal(sha256(html), OFF_HTML_SHA256);
    assert.doesNotMatch(html, /data-story-progress-rail="true"/u);
    assert.doesNotMatch(html, /data-story-chapter="/u);
  });

  test('none은 선·번호를 제거하고 별도 모바일 좌측 gutter 없이 챕터 계약을 유지한다', () => {
    const none = withGeneratedSiteProgressRail(fixture());
    const html = render(none, 'mobile');
    assert.doesNotMatch(html, /data-story-progress-rail="true"/u);
    assert.equal((html.match(/data-story-spine-hidden="true"/gu) ?? []).length, 3);
    assert.deepEqual(
      [...html.matchAll(/data-story-chapter="(\d{2})"/gu)].map((match) => match[1]),
      ['01', '02', '03'],
    );
    assert.match(html, /\[data-story-spine-hidden\]::after\s*\{\s*display:\s*none/u);
    assert.doesNotMatch(html, /\[data-story-spine-hidden\][^{]*\{[^}]*padding-left/u);
  });

  test('다보임 랜딩은 독립 레일과 기존 HTML SHA를 유지한다', () => {
    const html = renderToStaticMarkup(createElement(
      LandingStoryContinuation,
      null,
      createElement('section', { 'data-story-chapter': '01' }, '랜딩'),
    ));
    assert.equal(sha256(html), LANDING_HTML_SHA256);
    assert.equal((html.match(/data-story-progress-rail="true"/gu) ?? []).length, 1);
  });

  test('72렌더 harness가 fonts.ready 뒤 전면 제거와 기존 품질 게이트를 함께 강제한다', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/render-template-gallery-review.tsx'),
      'utf8',
    );
    assert.match(source, /document\.fonts\.ready/u);
    assert.match(source, /progressRail !== 'none'/u);
    assert.doesNotMatch(source, /signatureContractFor/u);
    assert.match(source, /renderedRailCount/u);
    assert.match(source, /visibleChapterNumberCount/u);
    assert.match(source, /maximumChapterContentPaddingLeft/u);
    assert.match(source, /maximumChapterContentPaddingImbalance/u);
    assert.match(source, /heroForegroundOverlaps/u);
    assert.match(source, /imageContrastMeasurements/u);
    assert.match(source, /horizontalOverflow/u);
    assert.match(source, /buttonNowrapViolations/u);
    assert.match(source, /record\.cls !== 0/u);
  });
});
