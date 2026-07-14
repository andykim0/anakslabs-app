/**
 * [데모 스프린트] docs/demo-sprint-profiles.md 기대표의 회귀 가드 — 문서가 단일 소스.
 * 프로필(업종 purposeId × tier) → 기대 프리셋/히어로 모션/accents가 실제 매핑(presets.ts)과
 * 일치하는지 고정한다. 프리셋 매핑이 드리프트하면 이 테스트가 깨져 데모 플랜 무효화를 즉시 알린다.
 * + §6 다운그레이드(Premium clinic-premium → Basic = office-basic 커버).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type MotionTier, type SiteConfig } from '@/lib/types/site';
import type { CandidateStyle, SitePurposeId } from '@/lib/types/domain';
import { resolvePresetForIndustry, MOTION_PRESETS } from '@/lib/motion/presets';
import { sanitizeMotion } from '@/lib/motion/validate';
import { defaultImageStyle } from '@/lib/onboarding/image-style';

interface Profile {
  n: number;
  name: string;
  purposeId: SitePurposeId;
  tier: MotionTier;
  preset: string;
  hero: string;
  accents: string[];
  industry: string;
  imageStyle: CandidateStyle; // 업종 기본값(설문 미설정 시 폴백)
}

// docs/demo-sprint-profiles.md 표와 1:1 (변경 시 문서·표 동시 갱신)
const PROFILES: Profile[] = [
  { n: 1, name: '소소한자리(카페)', purposeId: 'local_store', tier: 'basic', preset: 'cafe-basic', hero: 'ken-burns', accents: ['marquee'], industry: '카페·베이커리', imageStyle: 'photo' },
  { n: 2, name: '한걸음수학(학원)', purposeId: 'edu_membership', tier: 'basic', preset: 'academy-basic', hero: 'ken-burns', accents: ['count-up'], industry: '학원·교육 (중등 수학 전문)', imageStyle: 'photo' },
  { n: 3, name: '온화 다이닝(파인다이닝)', purposeId: 'local_store', tier: 'premium', preset: 'dining-premium', hero: 'video-hero', accents: ['spotlight', 'split-text'], industry: '레스토랑 (한식 파인다이닝, 코스 전문)', imageStyle: 'photo' },
  { n: 4, name: '결 뷰티라운지(뷰티)', purposeId: 'booking_service', tier: 'premium', preset: 'beauty-premium', hero: 'video-hero', accents: ['parallax', 'hover-video'], industry: '미용실·네일샵', imageStyle: 'photo' },
  { n: 5, name: '법무법인 다림(법률)', purposeId: 'company_brand', tier: 'premium', preset: 'clinic-premium', hero: 'video-hero', accents: ['count-up', 'stacking-cards'], industry: '법률사무소 (이혼·상속 전문)', imageStyle: 'photo' },
];

describe('데모 스프린트 프로필 → 프리셋/모션 기대표 (docs/demo-sprint-profiles.md)', () => {
  for (const p of PROFILES) {
    test(`#${p.n} ${p.name} [${p.purposeId}/${p.tier}] → ${p.preset}`, () => {
      const preset = resolvePresetForIndustry(p.purposeId, p.tier);
      assert.equal(preset, p.preset, '프리셋 매핑 드리프트');
      const def = MOTION_PRESETS[preset];
      assert.equal(def.hero, p.hero, '히어로 모션 불일치');
      assert.deepEqual([...def.accents], p.accents, 'accents 불일치');
    });
  }

  test('§6 다운그레이드 — clinic-premium + Basic → office-basic (+안내)', () => {
    const cfg: SiteConfig = { ...emptySiteConfig('다림'), motion: { presetId: 'clinic-premium', intensity: 'normal' } };
    const { config, changes } = sanitizeMotion(cfg, 'basic');
    assert.equal(config.motion?.presetId, 'office-basic', 'office-basic로 강등되어야');
    assert.ok(changes.length > 0, '강등 안내(changes[]) 있어야');
  });

  test('문서의 업종 프리셋 6개 전부 커버 — 영상 애드온 합성 프리셋은 별도', () => {
    const covered = new Set(PROFILES.map((p) => p.preset));
    covered.add('office-basic'); // §6 다운그레이드
    const documentedIndustryPresets = Object.keys(MOTION_PRESETS).filter((id) => id !== 'cinematic-hero');
    assert.equal(covered.size, documentedIndustryPresets.length, '문서의 업종 프리셋 6개를 전부 커버해야');
    assert.ok('cinematic-hero' in MOTION_PRESETS, '영상 애드온 합성 프리셋 누락');
  });

  // [imageStyle 축] 데모 5종 업종 → 기본 이미지 스타일 폴백(설문 미설정 시). 전부 실사(photo).
  for (const p of PROFILES) {
    test(`#${p.n} ${p.name} — 업종 "${p.industry}" → imageStyle=${p.imageStyle}`, () => {
      assert.equal(defaultImageStyle(p.industry), p.imageStyle, '업종 기본 imageStyle 드리프트');
    });
  }
});
