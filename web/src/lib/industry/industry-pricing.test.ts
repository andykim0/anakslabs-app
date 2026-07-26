import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import { buildJsonLd } from '@/lib/seo/jsonld';
import { emptySiteConfig } from '@/lib/types/site';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import {
  industryProfileIdForSurvey,
  siteIndustryIdForSurvey,
} from './profiles';
import { PRICING_MODEL_VERSION, industryProfile } from '@/lib/pricing';

const read = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

function interiorSurvey(): SurveyInput {
  const template = resolveTemplate('company_brand', '건설·인테리어 시공');
  return {
    businessName: '결 공간',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: '건설·인테리어 시공',
    tone: ['차분한'],
    colorPreference: '뉴트럴',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
  } as SurveyInput;
}

const candidate: DesignCandidate = {
  id: 'industry-profile-test',
  label: '인테리어 계약 테스트',
  style: 'photo',
  description: '',
  heroImageUrl: '/mock/interior.svg',
  theme: emptySiteConfig('industry').theme,
};

describe('IndustryProfile 서버 계약', () => {
  test('정확한 목적·업종만 인테리어 프로파일로 판정하고 자유문장 유사는 거부한다', () => {
    assert.equal(siteIndustryIdForSurvey(interiorSurvey()), 'interior');
    assert.equal(industryProfileIdForSurvey(interiorSurvey()), 'interior');
    assert.equal(
      industryProfileIdForSurvey({
        purposeId: 'company_brand',
        industry: '인테리어를 잘하는 제조 회사',
      }),
      null,
    );
    assert.equal(
      industryProfileIdForSurvey({
        purposeId: 'portfolio',
        industry: '건설·인테리어 시공',
      }),
      null,
    );
  });

  test('신규 생성 config만 industryId를 보존하고 가격 정보는 렌더 계약에 넣지 않는다', () => {
    const config = buildSiteConfigFromSurvey(interiorSurvey(), candidate, {
      heroImageUrl: '/mock/interior.svg',
      imagePool: [],
    });
    assert.equal(config.meta.industryId, 'interior');
    assert.equal(siteConfigSchema.parse(config).meta.industryId, 'interior');
    assert.equal(JSON.stringify(config).includes(PRICING_MODEL_VERSION), false);
    assert.equal(JSON.stringify(config).includes('490000'), false);
  });

  test('industryId는 인테리어 JSON-LD만 구체화하고 가격 모듈을 렌더러에 결합하지 않는다', () => {
    const config = buildSiteConfigFromSurvey(interiorSurvey(), candidate, {
      heroImageUrl: '/mock/interior.svg',
      imagePool: [],
    });
    const identity = buildJsonLd(config, 'https://interior.example.kr')[0];
    const types = Array.isArray(identity['@type']) ? identity['@type'] : [identity['@type']];
    assert.ok(types.includes('HomeAndConstructionBusiness'));
    assert.ok(types.includes('Organization'));

    for (const path of [
      'src/components/site-renderer/SiteRenderer.tsx',
      'src/components/site-renderer/SectionCanvas.tsx',
      'src/components/site-renderer/SectionStack.tsx',
    ]) {
      assert.doesNotMatch(read(path), /from ['"]@\/lib\/pricing/u, path);
    }
  });

  test('0047은 계약 핀을 서버 소유로 추가하고 자산 바인딩 생성도 원자 래퍼를 쓴다', () => {
    const sql = read('../supabase/migrations/0047_industry_pricing_contract.sql');
    const services = read('src/lib/data/supabase/services.ts');
    const generate = read('src/app/api/onboarding/generate/route.ts');

    assert.match(sql, /alter table public\.sites[\s\S]*industry_profile_id text[\s\S]*pricing_model_version text/u);
    assert.match(sql, /alter table public\.site_subscriptions[\s\S]*site_id uuid[\s\S]*industry_profile_id text/u);
    assert.match(sql, /alter table public\.payments[\s\S]*industry_profile_id text/u);
    assert.match(sql, /create_industry_site_with_asset_bindings/u);
    assert.match(sql, /create_industry_site_with_asset_bindings_and_attestation/u);
    assert.match(sql, /industry_profile_id cannot be changed once set/u);
    assert.match(services, /p_industry_profile_id: input\.industryProfileId/u);
    assert.match(services, /p_pricing_model_version: input\.pricingModelVersion/u);
    assert.match(generate, /industryProfileIdForSurvey\(survey\)/u);
    assert.match(generate, /pricingModelVersion: PRICING_MODEL_VERSION/u);
    assert.match(
      sql,
      /pricing_model_version is not null[\s\S]*industry_profile_id is null[\s\S]*length\(btrim\(industry_profile_id\)\) > 0/u,
    );

    for (const comment of sql.split('\n').filter((line) => line.trimStart().startsWith('--'))) {
      assert.doesNotMatch(comment, /\$/u);
    }
    assert.doesNotMatch(sql, /\bif\b[^;\n]*\bcase\b/iu);
  });

  test('프로파일의 스키마·키워드·무콘텐츠 약속이 승인값과 일치한다', () => {
    const profile = industryProfile('interior');
    assert.ok(profile);
    assert.equal(profile.schemaType, 'HomeAndConstructionBusiness');
    assert.equal(profile.postsPerMonth, 0);
    assert.deepEqual(profile.keywordSets.map((set) => set.label), ['지역', '평형']);
  });
});
