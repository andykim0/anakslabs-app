/**
 * [T5] 목적 10종 생성 스모크 — 각 목적 최소 시드로 생성해 공통 기준을 한 번에 고정:
 * pagePlan 유효 / 밀도 통과 / 모션 프리셋 매핑 / 무배선 버튼 0 / 이미지 프롬프트 불변식(T2) / 발행 blocker 0.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, SitePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, isValidPageSlug } from '@/lib/types/site';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { resolvePresetForIndustry, isPresetId } from '@/lib/motion/presets';
import { isThinSection } from '@/lib/design/section-density';
import { checkPublish } from '@/lib/publish/preflight';
import { NO_TEXT_DIRECTIVE } from '@/lib/design/quality-standards';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
/** 내용이 실려야 하는 타입(preflight DENSE와 동일 기준) */
const DENSE = new Set(['about', 'features', 'menu', 'gallery', 'testimonials', 'pricing', 'team', 'cases', 'faq']);

const CONTENT = `[소개]
성실하게 오래 해온 곳입니다. 처음 오신 분도 편하게 찾아주세요.

[메뉴]
대표 상품 12,000 / 인기 상품 15,000 / 프리미엄 구성 29,000

[영업 정보]
화–일 10:00–20:00 (월 휴무)
서울 마포구 성미산로 12
행사일: 2026년 8월 15일`;

const SEEDS: { purposeId: SitePurposeId; industry: string }[] = [
  { purposeId: 'local_store', industry: '카페·베이커리' },
  { purposeId: 'booking_service', industry: '미용실·네일샵' },
  { purposeId: 'ecommerce', industry: '패션 브랜드' },
  { purposeId: 'edu_membership', industry: '수학 학원' },
  { purposeId: 'company_brand', industry: '컨설팅' },
  { purposeId: 'portfolio', industry: '디자인 스튜디오' },
  { purposeId: 'blog_media', industry: '온라인 매거진' },
  { purposeId: 'community', industry: '러닝 크루' },
  { purposeId: 'event', industry: '컨퍼런스' },
  { purposeId: 'one_page', industry: '링크 모음' },
];

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 14 }, (_, i) => `/mock/p${i}.svg`) };

function seedSurvey(purposeId: SitePurposeId, industry: string): SurveyInput {
  const t = resolveTemplate(purposeId, industry);
  return {
    businessName: '스모크', purposeId, purpose: '테스트', industry, tone: ['모던'],
    colorPreference: '#c98a5e', referenceImageUrls: [], providedContent: CONTENT,
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}

describe('T5 — 목적 10종 생성 스모크', () => {
  for (const { purposeId, industry } of SEEDS) {
    test(`${purposeId} (${industry})`, () => {
      const survey = seedSurvey(purposeId, industry);
      const cfg = applyGeneratedMotion(buildSiteConfigFromSurvey(survey, candidate, opts), purposeId, 'basic');

      // ① pagePlan 유효 — 홈 존재·slug 규칙·빈 페이지 없음
      assert.equal(cfg.pages[0].slug, '', '첫 페이지는 홈');
      for (const p of cfg.pages) {
        assert.ok(isValidPageSlug(p.slug), `slug '${p.slug}' 무효`);
        assert.ok(p.sections.length >= 1, `${p.slug} 빈 페이지`);
      }

      // ② 밀도 — 내용형 섹션에 "제목+한 줄+버튼" 빈약 0
      for (const s of cfg.pages.flatMap((p) => p.sections)) {
        if (DENSE.has(s.type)) assert.ok(!isThinSection(s), `${s.id} 빈약(밀도 미달)`);
      }

      // ③ 모션 프리셋 매핑
      assert.ok(isPresetId(resolvePresetForIndustry(purposeId, 'basic')));
      assert.ok(cfg.motion && isPresetId(cfg.motion.presetId), '모션 프리셋 미주입');

      // ④ 무배선 버튼 0 + 앵커 타깃 실존
      const secIds = new Set(cfg.pages.flatMap((p) => p.sections).map((s) => s.id));
      for (const s of cfg.pages.flatMap((p) => p.sections)) {
        for (const el of s.elements) {
          if (el.kind !== 'button') continue;
          assert.ok(el.href && el.href !== '#', `${el.id} 무배선`);
          const m = /^(?:\/[a-z0-9-]*)?#(.+)$/.exec(el.href);
          if (m) assert.ok(secIds.has(m[1]), `${el.id} 앵커 '${m[1]}' 미존재`);
        }
      }

      // ⑤ 이미지 프롬프트 불변식(T2)
      for (const bp of buildCandidateBlueprints(survey)) {
        assert.ok(bp.heroImagePrompt.includes(NO_TEXT_DIRECTIVE));
        assert.doesNotMatch(bp.heroImagePrompt, HANGUL);
        assert.doesNotMatch(bp.heroImagePrompt, /#/);
      }

      // ⑥ 발행 게이트 — blocker 0 (경고는 허용)
      const r = checkPublish(cfg, 'basic');
      assert.deepEqual(r.blockers, [], `${purposeId}: ${r.blockers.join(' / ')}`);
    });
  }
});
