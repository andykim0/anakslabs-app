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

describe('IndustryProfile server contract', () => {
  test('the US fork never issues an interior product profile', () => {
    assert.equal(siteIndustryIdForSurvey(interiorSurvey()), null);
    assert.equal(industryProfileIdForSurvey(interiorSurvey()), null);
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

  test('new configs omit interior while the schema still reads historical render data', () => {
    const config = buildSiteConfigFromSurvey(interiorSurvey(), candidate, {
      heroImageUrl: '/mock/interior.svg',
      imagePool: [],
    });
    assert.equal(config.meta.industryId, undefined);
    const historical = structuredClone(config);
    historical.meta.industryId = 'interior';
    assert.equal(siteConfigSchema.parse(historical).meta.industryId, 'interior');
    assert.equal(JSON.stringify(config).includes(PRICING_MODEL_VERSION), false);
    assert.equal(JSON.stringify(config).includes('490000'), false);
  });

  test('historical interior configs remain readable without restoring a product profile', () => {
    const config = buildSiteConfigFromSurvey(interiorSurvey(), candidate, {
      heroImageUrl: '/mock/interior.svg',
      imagePool: [],
    });
    config.meta.industryId = 'interior';
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

  test('the active profile pins the clinic schema, content cadence, and grounded keyword axes', () => {
    const profile = industryProfile('clinic');
    assert.ok(profile);
    assert.equal(profile.schemaType, 'MedicalClinic');
    assert.equal(profile.postsPerMonth, 8);
    assert.deepEqual(profile.keywordSets.map((set) => set.label), ['Region', 'Medical specialty']);
  });
});
