import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { emptySiteConfig, type ScrollytellingAct, type SiteConfig } from '@/lib/types/site';
import {
  SCROLLYTELLING_TEMPLATE_POLICY,
  canRenderScrollytellingSection,
  sanitizeScrollytellingSections,
} from '@/lib/motion/scrollytelling';

const ACTS: ScrollytellingAct[] = [
  { heading: '첫 장면', body: '고객이 고른 태그라인', band: [0, 0.3] },
  { heading: '정체성', body: '고객이 제공한 소개 문장', band: [0.3, 0.65] },
  { heading: '초대', body: '고객이 고른 문의 목표', band: [0.65, 1] },
];

function stageConfig(templateId = 'company_brand.default'): SiteConfig {
  const config = emptySiteConfig('스크롤리텔링');
  config.meta = { ...config.meta, purposeId: 'company_brand', templateId };
  config.motion = {
    presetId: 'cinematic-hero',
    intensity: 'normal',
    heroTechnique: 'video-hero',
    videoRequested: true,
  };
  config.pages[0].sections = [
    {
      id: 'stage',
      type: 'hero',
      name: '브랜드 서사',
      height: 800,
      layout: 'scrollytelling',
      acts: structuredClone(ACTS),
      background: {
        image: { src: '/poster.webp' },
        video: { src: '/stage.mp4', poster: '/poster.webp', bytes: 2_000_000 },
      },
      elements: [],
    },
  ];
  return config;
}

describe('SS1 — 스크롤리텔링 additive 계약', () => {
  test('SiteConfig 저장 스키마가 templateId·layout·3~5막·band를 보존한다', () => {
    const input = stageConfig();
    const parsed = siteConfigSchema.parse(input);
    assert.equal(parsed.meta.templateId, input.meta.templateId);
    assert.equal(parsed.pages[0].sections[0].layout, 'scrollytelling');
    assert.deepEqual(parsed.pages[0].sections[0].acts, ACTS);
  });

  test('막 수·진행 구간 범위·순서가 잘못되면 저장 경계에서 거부한다', () => {
    const tooShort = stageConfig();
    tooShort.pages[0].sections[0].acts = ACTS.slice(0, 2);
    assert.equal(siteConfigSchema.safeParse(tooShort).success, false);

    const overlap = stageConfig();
    overlap.pages[0].sections[0].acts = [
      { heading: '1', body: 'a', band: [0, 0.5] },
      { heading: '2', body: 'b', band: [0.4, 0.8] },
      { heading: '3', body: 'c', band: [0.8, 1] },
    ];
    assert.equal(siteConfigSchema.safeParse(overlap).success, false);
  });

  test('허용 템플릿 + 영상 애드온 + 영상/poster만 무대를 보존한다', () => {
    for (const { purposeId, templateId } of SCROLLYTELLING_TEMPLATE_POLICY) {
      const config = stageConfig(templateId);
      config.meta.purposeId = purposeId;
      const result = sanitizeScrollytellingSections(config, 'premium');
      assert.equal(result.config, config, templateId);
      assert.equal(result.changes.length, 0, templateId);
      assert.equal(canRenderScrollytellingSection(config, config.pages[0].sections[0], 'premium'), true);
    }
  });

  test('미승인·비허용 목적은 일반 canvas로 강등하되 acts와 원본을 보존한다', () => {
    const requested = stageConfig();
    const basic = sanitizeScrollytellingSections(requested, 'basic');
    assert.equal(basic.config.pages[0].sections[0].layout, 'canvas');
    assert.deepEqual(basic.config.pages[0].sections[0].acts, ACTS);
    assert.equal(requested.pages[0].sections[0].layout, 'scrollytelling', '원본 변형');
    assert.match(basic.changes.join('\n'), /영상 애드온 미보유/);

    const cafe = stageConfig('local_store.default');
    const disallowed = sanitizeScrollytellingSections(cafe, 'premium');
    assert.equal(disallowed.config.pages[0].sections[0].layout, 'canvas');
    assert.match(disallowed.changes.join('\n'), /허용되지 않은 목적 템플릿/);
  });

  test('영상 전 pending layout은 보존하되 실제 렌더 readiness는 false다', () => {
    const config = stageConfig();
    delete config.pages[0].sections[0].background.video;
    const result = sanitizeScrollytellingSections(config, 'premium');
    assert.equal(result.config.pages[0].sections[0].layout, 'scrollytelling');
    assert.equal(result.changes.length, 0);
    assert.equal(canRenderScrollytellingSection(result.config, result.config.pages[0].sections[0], 'premium'), false);
  });

  test('purpose/template 불일치·오염된 acts는 예외 없이 fail-closed한다', () => {
    const mismatch = stageConfig('local_store.fine_dining');
    mismatch.meta.purposeId = 'company_brand';
    assert.equal(sanitizeScrollytellingSections(mismatch, 'premium').config.pages[0].sections[0].layout, 'canvas');

    const polluted = stageConfig();
    (polluted.pages[0].sections[0] as { acts?: unknown }).acts = [
      { heading: 7, body: 'a' },
      { heading: 'b', body: 'b' },
      { heading: 'c', body: 'c' },
    ];
    assert.doesNotThrow(() => sanitizeScrollytellingSections(polluted, 'premium'));
    assert.equal(sanitizeScrollytellingSections(polluted, 'premium').config.pages[0].sections[0].layout, 'canvas');
  });
});
