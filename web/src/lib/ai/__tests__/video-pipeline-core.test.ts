/**
 * [motion 4단계 — V3] 영상 파이프라인 순수 로직 — 비용 가드 3종·모션 프롬프트·컨텍스트·config 적용.
 * (실제 Veo/Gemini 호출 없음 — 순수 함수만. 실호출 경로는 video-pipeline.ts server-only)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';
import {
  videoGuardError,
  buildMotionPrompt,
  heroVideoContext,
  applyHeroVideoToConfig,
  type VideoGuardConfig,
} from '@/lib/ai/video-pipeline-core';

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

describe('buildMotionPrompt — 고정 골격 + POV mood + 소재', () => {
  test('mood·subject·루프·no-text 포함, 자유서술 없음', () => {
    const p = buildMotionPrompt('Dark cinematic mood', 'fine dining restaurant');
    assert.match(p, /Dark cinematic mood/);
    assert.match(p, /fine dining restaurant/);
    assert.match(p, /seamless loop/);
    assert.match(p, /no cuts/);
    assert.match(p, /6-8 seconds/);
    assert.match(p, /no text/i);
    // [T2] 한글 subject는 스크럽 후 영어 폴백 — 최종 프롬프트에 한글·빈 Subject 없음
    const k = buildMotionPrompt('Dark cinematic mood', '화로담, 파인다이닝');
    assert.doesNotMatch(k, /[가-힣]/);
    assert.match(k, /Subject: the signature scene of the business/);
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
    assert.equal(ctx!.subject, '화로담'); // 힌트 없으면 사이트 제목
  });
  test('히어로 배경 이미지 없으면 null (폴백 유지)', () => {
    assert.equal(heroVideoContext(cfgWith({ color: '#111' })), null);
  });
  test('다크 팔레트 → 시네마틱 mood 폴백', () => {
    const ctx = heroVideoContext(cfgWith({ image: { src: '/h.png' } })); // emptySiteConfig 배경 #0f0e0c(다크)
    assert.match(ctx!.povMood, /Dark cinematic/);
  });
  test('힌트(subject/povMood) 우선', () => {
    const ctx = heroVideoContext(cfgWith({ image: { src: '/h.png' } }), { subject: '민트워시, 세차', povMood: 'Custom mood' });
    assert.equal(ctx!.subject, '민트워시, 세차');
    assert.equal(ctx!.povMood, 'Custom mood');
  });
});

describe('applyHeroVideoToConfig — 히어로 background.video 세팅(비파괴)', () => {
  test('히어로에 video 세팅, 배경 이미지(poster 후보) 보존', () => {
    const c = cfgWith({ image: { src: '/hero.png' } });
    const next = applyHeroVideoToConfig(c, '/v.mp4', '/hero.png');
    const hero = next.pages[0].sections[0];
    assert.deepEqual(hero.background.video, { src: '/v.mp4', poster: '/hero.png' });
    assert.equal(hero.background.image?.src, '/hero.png'); // ken-burns 폴백용 이미지 보존
    assert.notEqual(next, c); // 불변(새 객체)
  });
});
