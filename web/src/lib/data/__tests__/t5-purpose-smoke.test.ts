/**
 * [T5 · 제품 확정] 소개형 목적 6종 생성 스모크 — 각 목적 최소 시드로 공통 기준을 한 번에 고정:
 * pagePlan 유효 / 밀도 통과 / 모션 프리셋 매핑 / 무배선 버튼 0 / 이미지 프롬프트 불변식(T2) /
 * JSON-LD @type = PURPOSE_SCHEMA_MAP 일치 (목적이 구조화 데이터 타입을 결정 = SEO/AEO 해자).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { DesignCandidate, LivePurposeId, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig, isValidPageSlug } from '@/lib/types/site';
import { LIVE_PURPOSE_IDS } from '@/lib/data/purpose-taxonomy';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { applyGeneratedMotion } from '@/lib/motion/validate';
import { resolvePresetForIndustry, isPresetId } from '@/lib/motion/presets';
import { isThinSection } from '@/lib/design/section-density';
import { checkPublish } from '@/lib/publish/preflight';
import { NO_TEXT_DIRECTIVE } from '@/lib/design/quality-standards';
import { PURPOSE_SCHEMA_MAP, buildJsonLd } from '@/lib/seo/jsonld';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const DENSE = new Set(['about', 'features', 'menu', 'gallery', 'testimonials', 'pricing', 'team', 'cases', 'faq']);

const CONTENT = `[소개]
성실하게 오래 해온 곳입니다. 처음 오신 분도 편하게 찾아주세요.

[메뉴]
대표 상품 12,000 / 인기 상품 15,000 / 프리미엄 구성 29,000

[영업 정보]
화–일 10:00–20:00 (월 휴무)
서울 마포구 성미산로 12`;

const SEEDS: Record<LivePurposeId, string> = {
  local_store: '카페·베이커리',
  booking_service: '미용실·네일샵',
  company_brand: '컨설팅',
  portfolio: '디자인 스튜디오',
  edu_membership: '입시학원',
  one_page: '링크 모음',
};

const candidate: DesignCandidate = {
  id: 'cand-warm-cozy', label: 'x', style: 'photo', heroImageUrl: '/mock/h.svg',
  theme: emptySiteConfig('t').theme, description: '',
};
const opts = { heroImageUrl: '/mock/h.svg', imagePool: Array.from({ length: 14 }, (_, i) => `/mock/p${i}.svg`) };

function seedSurvey(purposeId: LivePurposeId, industry: string): SurveyInput {
  const t = resolveTemplate(purposeId, industry);
  return {
    businessName: '스모크', purposeId, purpose: '테스트', industry, tone: ['모던'],
    colorPreference: '#c98a5e', referenceImageUrls: [], providedContent: CONTENT, region: '서울 마포',
    sectionPlan: planFromTemplate(t), pagePlan: pagePlanFromTemplate(t), templateId: t.id,
  } as SurveyInput;
}
function typeSet(node: { '@type': string | string[] }): Set<string> {
  return new Set(Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
}

describe('T5 — 소개형 목적 6종 생성 스모크', () => {
  test('LIVE_PURPOSE_IDS = 6종', () => {
    assert.equal(LIVE_PURPOSE_IDS.length, 6);
  });

  for (const purposeId of LIVE_PURPOSE_IDS) {
    test(`${purposeId} (${SEEDS[purposeId]})`, () => {
      const survey = seedSurvey(purposeId, SEEDS[purposeId]);
      const cfg = applyGeneratedMotion(buildSiteConfigFromSurvey(survey, candidate, opts), purposeId, 'basic');

      assert.equal(cfg.pages[0].slug, '', '첫 페이지는 홈');
      for (const p of cfg.pages) {
        assert.ok(isValidPageSlug(p.slug), `slug '${p.slug}' 무효`);
        assert.ok(p.sections.length >= 1, `${p.slug} 빈 페이지`);
      }

      for (const s of cfg.pages.flatMap((p) => p.sections)) {
        if (DENSE.has(s.type)) assert.ok(!isThinSection(s), `${s.id} 빈약`);
      }

      assert.ok(isPresetId(resolvePresetForIndustry(purposeId, 'basic')));
      assert.ok(cfg.motion && isPresetId(cfg.motion.presetId), '모션 프리셋 미주입');

      const secIds = new Set(cfg.pages.flatMap((p) => p.sections).map((s) => s.id));
      for (const s of cfg.pages.flatMap((p) => p.sections)) {
        for (const el of s.elements) {
          if (el.kind !== 'button') continue;
          assert.ok(el.href && el.href !== '#', `${el.id} 무배선`);
          const m = /^(?:\/[a-z0-9-]*)?#(.+)$/.exec(el.href);
          if (m) assert.ok(secIds.has(m[1]), `${el.id} 앵커 '${m[1]}' 미존재`);
        }
      }

      for (const bp of buildCandidateBlueprints(survey)) {
        assert.ok(bp.heroImagePrompt.includes(NO_TEXT_DIRECTIVE));
        assert.doesNotMatch(bp.heroImagePrompt, HANGUL);
        assert.doesNotMatch(bp.heroImagePrompt, /#/);
      }

      const nodes = buildJsonLd(cfg, 'https://x.anakslabs.com') as { '@type': string | string[] }[];
      const spec = PURPOSE_SCHEMA_MAP[purposeId];
      const wantOrg = Array.isArray(spec.orgType) ? spec.orgType : [spec.orgType];
      for (const t of wantOrg) assert.ok(typeSet(nodes[0]).has(t), `${purposeId}: 주 노드 @type에 ${t} 없음`);
      assert.equal(cfg.meta.purposeId, purposeId, 'meta.purposeId 미주입');

      assert.deepEqual(checkPublish(cfg, 'basic').blockers, []);
    });
  }
});
