/**
 * [motion 4단계 — V3] 영상 파이프라인 순수 로직 — 비용 가드 3종·모션 프롬프트·컨텍스트·config 적용.
 * (실제 Veo/Gemini 호출 없음 — 순수 함수만. 실호출 경로는 video-pipeline.ts server-only)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import {
  videoGuardError,
  synchronousVideoTransportError,
  buildMotionPrompt,
  ensureRegisteredVideoPrompt,
  FAITHFUL_PHOTO_MOTION_DIRECTIVE,
  REGISTERED_VIDEO_PROMPT_MARKER,
  heroVideoContext,
  applyHeroVideoToConfig,
  resolveHeroSourceUrl,
  type VideoGuardConfig,
} from '@/lib/ai/video-pipeline-core';
import {
  MOOD_SUBJECTS,
  PRODUCT_SAFETY_DIRECTIVE,
} from '@/lib/design/image-subjects';
import { resolveMotionPlan } from '@/lib/motion/apply';

const ON: VideoGuardConfig = { enabled: true, maxPerSite: 6, dailyCap: 20 };

describe('videoGuardError — 비용 가드 3종 + tier', () => {
  test('킬스위치 off → 차단', () => {
    assert.match(videoGuardError({ ...ON, enabled: false }, 'premium', 0, 0)!, /VIDEO_GEN_DISABLED/);
  });
  test('영상 애드온 미보유(basic) → 차단', () => {
    assert.match(videoGuardError(ON, 'basic', 0, 0)!, /VIDEO_GEN_ADDON/);
  });
  test('사이트당 상한 도달 → 차단', () => {
    assert.match(videoGuardError(ON, 'premium', 6, 0)!, /VIDEO_GEN_SITE_CAP/);
  });
  test('일일 상한 도달 → 차단', () => {
    assert.match(videoGuardError(ON, 'premium', 0, 20)!, /VIDEO_GEN_DAILY_CAP/);
  });
  test('전부 통과 → null', () => {
    assert.equal(videoGuardError(ON, 'premium', 5, 19), null);
  });
  test('우선순위: 킬스위치가 tier·상한보다 먼저', () => {
    assert.match(videoGuardError({ ...ON, enabled: false }, 'basic', 99, 99)!, /VIDEO_GEN_DISABLED/);
  });
});

describe('synchronousVideoTransportError — 장기 HTTP fail-closed', () => {
  test('mock은 실원가·외부 장기 작업이 없어 기존 플로우를 허용한다', () => {
    assert.equal(synchronousVideoTransportError(true), null);
  });

  test('non-mock 실제 동기 생성은 재개 가능한 처리 경로 전까지 차단한다', () => {
    assert.match(synchronousVideoTransportError(false) ?? '', /^VIDEO_GEN_SYNC_UNSAFE:/);
  });
});

describe('buildMotionPrompt — 등록 무드 + 출처별 안전 골격', () => {
  test('ambient AI 모드는 등록 mood·ambient·제품 금지·루프·no-text만 포함한다', () => {
    const p = buildMotionPrompt('Dark cinematic mood', 'ambient-ai');
    assert.match(p, new RegExp(REGISTERED_VIDEO_PROMPT_MARKER));
    assert.ok(MOOD_SUBJECTS.calm.ambient.some((subject) => p.includes(subject)), p);
    assert.ok(p.includes(PRODUCT_SAFETY_DIRECTIVE));
    assert.doesNotMatch(p, /Dark cinematic mood/);
    assert.match(p, /seamless loop/);
    assert.match(p, /no cuts/);
    assert.match(p, /6-8 seconds/);
    assert.match(p, /no text/i);
    assert.doesNotMatch(p, /Subject:/);
  });

  test('uploaded photo 모드는 faithful directive를 사용한다', () => {
    const p = buildMotionPrompt('quiet editorial light', 'uploaded-photo');
    assert.ok(p.includes(FAITHFUL_PHOTO_MOTION_DIRECTIVE));
    assert.match(p, /do NOT add, remove, replace/);
  });

  test('마커를 흉내 낸 유료 영상 원문도 전체를 폐기하고 등록 ambient prompt로 교체한다', () => {
    const raw = `${REGISTERED_VIDEO_PROMPT_MARKER}. 화로담 signature product with steam and people, 6-8 seconds. no text, no letters, no words, no typography, no signage, no logos, no watermarks.`;
    const safe = ensureRegisteredVideoPrompt(raw);
    assert.ok(safe.startsWith(`${REGISTERED_VIDEO_PROMPT_MARKER}.`));
    assert.doesNotMatch(safe, /화로담|signature product|with steam/i);
    assert.notEqual(safe, raw, '클라이언트가 붙인 마커를 신뢰하면 안 됨');
    assert.ok(safe.includes(PRODUCT_SAFETY_DIRECTIVE));
  });
});

function cfgWith(bg: { image?: { src: string }; color?: string }, title = '화로담'): SiteConfig {
  const base = emptySiteConfig(title);
  return {
    ...base,
    pages: [{ id: 'home', title: '홈', slug: '', sections: [{ id: 'hero', type: 'hero', name: '히어로', height: 800, background: bg, elements: [] }] }],
  };
}

describe('heroVideoContext — 맥락 도출', () => {
  test('히어로 배경 이미지 있으면 ctx(heroImageUrl=poster 후보)', () => {
    const ctx = heroVideoContext(cfgWith({ image: { src: '/hero.png' } }));
    assert.ok(ctx);
    assert.equal(ctx!.heroImageUrl, '/hero.png');
    assert.equal(ctx!.source, 'ambient-ai');
  });
  test('히어로 배경 이미지 없으면 null (폴백 유지)', () => {
    assert.equal(heroVideoContext(cfgWith({ color: '#111' })), null);
  });
  test('다크 팔레트 → 시네마틱 mood 폴백', () => {
    const ctx = heroVideoContext(cfgWith({ image: { src: '/h.png' } })); // emptySiteConfig 배경 #0f0e0c(다크)
    assert.match(ctx!.povMood, /quiet elegant mood/i);
  });
  test('tone은 등록 ambient 무드로만 변환되고 raw 상품 카피는 새지 않는다', () => {
    const ctx = heroVideoContext(cfgWith({ image: { src: '/h.png' } }), {
      tone: ['따뜻하고 친근한', 'espresso product raw copy'],
    });
    assert.match(ctx!.povMood, /welcoming warm mood/);
    assert.doesNotMatch(ctx!.povMood, /espresso|product|raw copy/i);
  });
  test('heroPhotoUrl이 실제 hero src와 exact match일 때만 uploaded-photo 출처', () => {
    const config = cfgWith({ image: { src: '/uploaded/hero.jpg' } });
    assert.equal(heroVideoContext(config, { heroPhotoUrl: '/uploaded/hero.jpg' })!.source, 'uploaded-photo');
    assert.equal(heroVideoContext(config, { heroPhotoUrl: '/uploaded/hero.jpg?changed=1' })!.source, 'ambient-ai');
    assert.equal(heroVideoContext(config, { heroPhotoUrl: '/other.jpg' })!.source, 'ambient-ai');
  });
  test('mock data:image 대표 사진은 거대한 URL 힌트 없이도 uploaded-photo로 판정', () => {
    const config = cfgWith({ image: { src: 'data:image/png;base64,AA==' } });
    assert.equal(heroVideoContext(config)!.source, 'uploaded-photo');
  });
  test("배열 0/0이 아니라 slug='' 홈의 type=hero를 탐색", () => {
    const config = cfgWith({ image: { src: '/unused.png' } });
    config.pages = [
      { id: 'about', title: '소개', slug: 'about', sections: [{ id: 'decoy', type: 'hero', name: '가짜', height: 500, background: { image: { src: '/decoy.png' } }, elements: [] }] },
      {
        id: 'actual-home',
        title: '홈',
        slug: '',
        sections: [
          { id: 'intro', type: 'about', name: '소개', height: 400, background: {}, elements: [] },
          { id: 'actual-hero', type: 'hero', name: '히어로', height: 800, background: { image: { src: '/actual.png' } }, elements: [] },
        ],
      },
    ];
    assert.equal(heroVideoContext(config)!.heroImageUrl, '/actual.png');
  });
});

describe('applyHeroVideoToConfig — 히어로 background.video 세팅(비파괴)', () => {
  test('히어로에 video 세팅, 배경 이미지(poster 후보) 보존', () => {
    const c = cfgWith({ image: { src: '/hero.png' } });
    const next = applyHeroVideoToConfig(c, '/v.mp4', '/hero.png');
    const hero = next.pages[0].sections[0];
    assert.deepEqual(hero.background.video, { src: '/v.mp4', poster: '/hero.png' });
    assert.equal(hero.background.image?.src, '/hero.png'); // ken-burns 폴백용 이미지 보존
    assert.equal(next.motion?.presetId, 'cinematic-hero');
    assert.equal(next.motion?.heroTechnique, 'video-hero');
    assert.equal(next.motion?.videoAddon, true);
    assert.ok(resolveMotionPlan(next, { tier: 'premium' }).cinematicHeroSections.has(hero.id));
    assert.notEqual(next, c); // 불변(새 객체)
  });
  test('basic 정적 폴백 요청도 승인 후 적용 시 선택 모션을 보존하며 cinematic으로 승격한다', () => {
    const c = cfgWith({ image: { src: '/hero.png' } });
    c.motion = {
      presetId: 'cafe-basic',
      intensity: 'normal',
      videoRequested: true,
      videoAddon: true,
      heroImageChoice: 'upload',
      heroMotionId: 'parallax-depth',
    };
    const next = applyHeroVideoToConfig(c, '/v.mp4', '/hero.png');
    assert.equal(next.motion?.presetId, 'cinematic-hero');
    assert.equal(next.motion?.heroTechnique, 'video-hero');
    assert.equal(next.motion?.heroMotionId, 'parallax-depth');
    assert.equal(next.motion?.heroImageChoice, 'upload');
    assert.ok(resolveMotionPlan(next, { tier: 'premium' }).videoHeroSections.has(next.pages[0].sections[0].id));
  });
  test("홈의 type=hero만 갱신하고 앞선 페이지·비hero 섹션은 건드리지 않는다", () => {
    const c = cfgWith({ image: { src: '/old.png' } });
    const originalHome = c.pages[0];
    c.pages = [
      { id: 'other', title: '기타', slug: 'other', sections: [{ id: 'other-hero', type: 'hero', name: '기타 히어로', height: 500, background: {}, elements: [] }] },
      { ...originalHome, sections: [{ id: 'about', type: 'about', name: '소개', height: 400, background: {}, elements: [] }, ...originalHome.sections] },
    ];
    const next = applyHeroVideoToConfig(c, '/v.mp4', '/old.png');
    assert.equal(next.pages[0].sections[0].background.video, undefined);
    assert.equal(next.pages[1].sections[0].background.video, undefined);
    assert.deepEqual(next.pages[1].sections[1].background.video, { src: '/v.mp4', poster: '/old.png' });
  });
  test('route가 검증한 영상 AssetRef만 manifest에 병합하고 URL 불일치는 거부한다', () => {
    const c = cfgWith({ image: { src: '/hero.png' } });
    c.assetRefs = [{ assetId: '00000000-0000-4000-8000-000000000001', url: '/hero.png' }];
    const videoRef = { assetId: '00000000-0000-4000-8000-000000000002', url: '/v.mp4' };
    const next = applyHeroVideoToConfig(c, '/v.mp4', '/hero.png', videoRef);
    assert.deepEqual(next.assetRefs, [c.assetRefs[0], videoRef]);
    assert.throws(
      () => applyHeroVideoToConfig(c, '/other.mp4', '/hero.png', videoRef),
      /ASSET_REF_URL_MISMATCH/,
    );
  });
});

describe('resolveHeroSourceUrl — 상대 mock src', () => {
  test('request origin으로 상대 경로를 fetch 가능한 절대 URL로 만든다', () => {
    assert.equal(resolveHeroSourceUrl('/mock/hero.png', 'http://localhost:3000/api/sites/s/video'), 'http://localhost:3000/mock/hero.png');
  });
  test('origin 없는 상대 경로·비 http(s)는 거부한다', () => {
    assert.equal(resolveHeroSourceUrl('/mock/hero.png'), null);
  assert.equal(resolveHeroSourceUrl('data:image/png;base64,AA==', 'https://anakslabs.com'), null);
  });
});
