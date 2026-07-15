/**
 * [데모 스프린트] docs/demo-sprint-profiles.md의 v1 프리셋은 이미 발행된 사이트의
 * 불변 레거시 계약이다. 새 사이트는 v2 active base를 배정하되, 문서에 기록된 v1 ID와
 * hero/accent 의미는 삭제하거나 바꾸지 않는지 함께 검증한다.
 * + §6 다운그레이드(Premium clinic-premium → Basic = office-basic 커버).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySiteConfig, type MotionTier, type SiteConfig } from '@/lib/types/site';
import type { CandidateStyle, SitePurposeId } from '@/lib/types/domain';
import {
  ACTIVE_PRESET_IDS,
  resolvePresetForIndustry,
  MOTION_PRESETS,
  type PresetId,
} from '@/lib/motion/presets';
import { sanitizeMotion } from '@/lib/motion/validate';
import { defaultImageStyle } from '@/lib/onboarding/image-style';

interface Profile {
  n: number;
  name: string;
  purposeId: SitePurposeId;
  tier: MotionTier;
  preset: PresetId;
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

describe('데모 스프린트 v1 레거시 계약 + v2 신규 생성 매핑', () => {
  for (const p of PROFILES) {
    test(`#${p.n} ${p.name} — ${p.preset} 의미 보존 + 신규 생성은 active v2`, () => {
      const def = MOTION_PRESETS[p.preset];
      assert.equal(def.catalogVersion, 1);
      assert.equal(def.status, 'legacy');
      assert.equal(def.hero, p.hero, '히어로 모션 불일치');
      assert.deepEqual([...def.accents], p.accents, 'accents 불일치');

      const generated = resolvePresetForIndustry(p.purposeId, p.tier);
      assert.ok(ACTIVE_PRESET_IDS.includes(generated as (typeof ACTIVE_PRESET_IDS)[number]));
      assert.equal(MOTION_PRESETS[generated].catalogVersion, 2);
      assert.equal(MOTION_PRESETS[generated].status, 'active');
      assert.equal(MOTION_PRESETS[generated].tier, p.tier);
    });
  }

  test('§6 다운그레이드 — clinic-premium + Basic → office-basic (+안내)', () => {
    const cfg: SiteConfig = { ...emptySiteConfig('다림'), motion: { presetId: 'clinic-premium', intensity: 'normal' } };
    const { config, changes } = sanitizeMotion(cfg, 'basic');
    assert.equal(config.motion?.presetId, 'office-basic', 'office-basic로 강등되어야');
    assert.ok(changes.length > 0, '강등 안내(changes[]) 있어야');
  });

  test('문서 v1 프리셋은 전부 legacy로 남고, 신규 생성 프리셋은 전부 active v2다', () => {
    const coveredLegacy = new Set([...PROFILES.map((p) => p.preset), 'office-basic', 'cinematic-hero']);
    const legacyIds = Object.entries(MOTION_PRESETS)
      .filter(([, preset]) => preset.status === 'legacy')
      .map(([id]) => id);
    assert.deepEqual(new Set(legacyIds), coveredLegacy);
    assert.deepEqual(
      new Set(ACTIVE_PRESET_IDS),
      new Set(Object.entries(MOTION_PRESETS).filter(([, preset]) => preset.status === 'active').map(([id]) => id)),
    );
  });

  // [imageStyle 축] 데모 5종 업종 → 기본 이미지 스타일 폴백(설문 미설정 시). 전부 실사(photo).
  for (const p of PROFILES) {
    test(`#${p.n} ${p.name} — 업종 "${p.industry}" → imageStyle=${p.imageStyle}`, () => {
      assert.equal(defaultImageStyle(p.industry), p.imageStyle, '업종 기본 imageStyle 드리프트');
    });
  }
});
