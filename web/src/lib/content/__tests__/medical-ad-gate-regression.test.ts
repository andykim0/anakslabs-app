import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { resolveBeforeAfterFeatureDecision } from '@/lib/assets/provenance-flags-core';
import {
  clinicAvailability,
  CLINIC_PUBLISH_FLAG,
} from '@/lib/industry/clinic-availability';
import { industryPublishPolicy } from '@/lib/industry/publish-policy';
import {
  CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION,
  PREVIOUS_PRICING_MODEL_VERSION,
  PRICING_MODEL_VERSION,
} from '@/lib/pricing';
import { MEDICAL_AD_POLICY_VERSION, screenMedicalCopy } from '@/lib/content/medical-ad-policy';
import { screenMedicalSiteConfig } from '@/lib/content/medical-ad-enforcement';
import { testimonialExposurePolicy } from '@/lib/content/testimonial-policy';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const root = process.cwd();
const source = (path: string): string => readFileSync(join(root, path), 'utf8');

function sourceFiles(directory: string): string[] {
  const absolute = join(root, directory);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    if (statSync(child).isDirectory()) return sourceFiles(relative(root, child));
    return /\.(?:ts|tsx)$/u.test(name) ? [relative(root, child)] : [];
  });
}

function withClinicFlag<T>(value: string | undefined, run: () => T): T {
  const previous = process.env[CLINIC_PUBLISH_FLAG];
  if (value === undefined) delete process.env[CLINIC_PUBLISH_FLAG];
  else process.env[CLINIC_PUBLISH_FLAG] = value;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env[CLINIC_PUBLISH_FLAG];
    else process.env[CLINIC_PUBLISH_FLAG] = previous;
  }
}

async function withClinicFlagAsync<T>(
  value: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env[CLINIC_PUBLISH_FLAG];
  if (value === undefined) delete process.env[CLINIC_PUBLISH_FLAG];
  else process.env[CLINIC_PUBLISH_FLAG] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[CLINIC_PUBLISH_FLAG];
    else process.env[CLINIC_PUBLISH_FLAG] = previous;
  }
}

function medicalConfig(text = '필요한 진료 정보를 차분히 안내합니다'): SiteConfig {
  const config = emptySiteConfig('온결 의원');
  config.theme.fonts = {
    heading: "'Pretendard', sans-serif",
    body: "'Pretendard', sans-serif",
  };
  config.meta = {
    title: '온결 의원',
    description: '진료 범위와 예약 방법을 안내합니다.',
    purposeId: 'booking_service',
    templateId: 'booking_service.clinic',
    industryId: 'clinic',
    industryClass: 'medical',
  };
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '진료 안내',
    height: 720,
    background: { color: '#ffffff' },
    elements: [{
      id: 'hero-title',
      kind: 'text',
      frame: { x: 120, y: 140, w: 900, h: 120 },
      z: 1,
      text,
      style: { fontSize: 48, fontFamily: 'heading', color: '#111111' },
    }],
  }];
  return config;
}

function interiorConfig(): SiteConfig {
  const config = emptySiteConfig('온결 공간');
  config.meta = {
    title: '온결 공간',
    description: '공간의 쓰임과 동선을 차분히 정리합니다.',
    purposeId: 'company_brand',
    templateId: 'company_brand.default',
    industryId: 'interior',
    industryClass: 'workshop',
  };
  config.pages[0].sections = [{
    id: 'hero',
    type: 'hero',
    name: '첫 화면',
    height: 720,
    background: { color: '#0f0e0c' },
    elements: [{
      id: 'hero-title',
      kind: 'text',
      frame: { x: 120, y: 180, w: 900, h: 120 },
      z: 1,
      text: '공간의 쓰임을 먼저 살핍니다',
      style: { fontSize: 48, fontFamily: 'heading', color: '#f5f1e8' },
    }],
  }];
  return config;
}

function rendererSha(config: SiteConfig): string {
  const html = renderToStaticMarkup(createElement(SiteRenderer, {
    config,
    mode: 'auto',
    interactive: false,
    animate: false,
  }));
  return createHash('sha256').update(html).digest('hex');
}

describe('MEDLAW R3 — clinic 단일 가용성 게이트', () => {
  test('정확히 플래그 1 + 배포 정책버전 일치만 기본 공개 경계를 연다', () => {
    assert.equal(CLINIC_REQUIRED_MEDICAL_AD_POLICY_VERSION, MEDICAL_AD_POLICY_VERSION);
    for (const value of [undefined, '', '0', 'true', '01']) {
      assert.deepEqual(
        clinicAvailability({ flagValue: value }),
        {
          available: false,
          reason: 'flag-off',
          requiredPolicyVersion: MEDICAL_AD_POLICY_VERSION,
          deployedPolicyVersion: MEDICAL_AD_POLICY_VERSION,
        },
      );
    }
    assert.equal(clinicAvailability({ flagValue: '1' }).available, true);
    assert.deepEqual(
      clinicAvailability({
        flagValue: '1',
        deployedPolicyVersion: 'medical-ad-previous',
      }),
      {
        available: false,
        reason: 'policy-version-mismatch',
        requiredPolicyVersion: MEDICAL_AD_POLICY_VERSION,
        deployedPolicyVersion: 'medical-ad-previous',
      },
    );
  });

  test('발행·결제용 게이트는 현재 draft 전체를 매번 재검사하고 감사 핀을 우회권한으로 쓰지 않는다', () => {
    const safe = medicalConfig();
    assert.equal(clinicAvailability({
      flagValue: '1',
      requireDraft: true,
      config: safe,
    }).available, true);

    const blocked = medicalConfig('100% 완치를 보장합니다');
    blocked.meta.medicalAdPolicyVersion = MEDICAL_AD_POLICY_VERSION;
    assert.deepEqual(
      clinicAvailability({
        flagValue: '1',
        requireDraft: true,
        config: blocked,
      }).reason,
      'copy-blocked',
    );

    const warning = medicalConfig('시술 효과를 안내합니다');
    const warningScreen = screenMedicalSiteConfig(warning);
    assert.equal(warningScreen.blockViolations.length, 0);
    assert.ok(warningScreen.warnViolations.length > 0);
    assert.equal(clinicAvailability({
      flagValue: '1',
      requireDraft: true,
      config: warning,
    }).reason, 'review-required');
  });

  test('업종 분류 불일치·초안 부재는 활성 플래그에서도 fail-closed한다', () => {
    assert.equal(clinicAvailability({
      flagValue: '1',
      requireDraft: true,
    }).reason, 'draft-required');
    const mismatched = medicalConfig();
    mismatched.meta.industryClass = 'other';
    assert.equal(clinicAvailability({
      flagValue: '1',
      requireDraft: true,
      config: mismatched,
    }).reason, 'classification-mismatch');
  });

  test('PRICE-V6 clinic 신규 판매는 닫고 과거 계약만 기존 의료 게이트로 해석한다', () => {
    const site = {
      industryProfileId: 'clinic' as const,
      pricingModelVersion: PRICING_MODEL_VERSION,
      draftConfig: medicalConfig(),
    };
    assert.equal(industryPublishPolicy(site).status, 'unavailable');
    const previousSite = {
      ...site,
      pricingModelVersion: PREVIOUS_PRICING_MODEL_VERSION,
    };
    withClinicFlag(undefined, () => {
      const policy = industryPublishPolicy(previousSite);
      assert.equal(policy.status, 'gated');
      if (policy.status === 'gated') assert.equal(policy.reason, 'flag-off');
    });
    withClinicFlag('1', () => {
      const policy = industryPublishPolicy(previousSite);
      assert.equal(policy.status, 'available');
      if (policy.status === 'available') {
        assert.equal(policy.pricing.amountKrw, 790_000);
        assert.equal(policy.pricing.industryProfileId, 'clinic');
      }
    });
  });

  test('플래그와 clinic 공개 경계는 단일 모듈만 소유하고 여섯 표면이 그 결과를 소비한다', () => {
    const owners = sourceFiles('src').filter(
      (path) => source(path).includes(`'${CLINIC_PUBLISH_FLAG}'`),
    );
    assert.deepEqual(owners, ['src/lib/industry/clinic-availability.ts']);

    const availability = source('src/lib/industry/clinic-availability.ts');
    const industry = source('src/lib/industry/publish-policy.ts');
    const page = source('src/app/(marketing)/clinic/page.tsx');
    const sitemap = source('src/app/sitemap.ts');
    const layout = source('src/app/(marketing)/layout.tsx');
    const publish = source('src/app/api/sites/[siteId]/publish/route.ts');
    const payment = source('src/app/api/sites/[siteId]/publish-payment/route.ts');
    assert.match(availability, /screenMedicalSiteConfig\(input\.config\)/u);
    assert.match(industry, /clinicAvailability\(\{/u);
    assert.match(page, /clinicAvailability\(\)\.available[\s\S]*notFound\(\)/u);
    assert.match(sitemap, /clinicAvailability\(\)\.available/u);
    assert.match(layout, /clinicAvailability\(\)\.available/u);
    assert.match(publish, /industryPublishPolicy\(site\)/u);
    assert.match(payment, /industryPublishPolicy\(site\)/u);
  });

  test('기본 OFF에서는 sitemap·내부 링크가 clinic을 노출하지 않는다', async () => {
    await withClinicFlagAsync(undefined, async () => {
      const [{ default: sitemap }, { MarketingFooter }] = await Promise.all([
        import('@/app/sitemap'),
        import('@/components/marketing/MarketingFooter'),
      ]);
      assert.equal(
        sitemap().some((entry) => new URL(entry.url).pathname === '/clinic'),
        false,
      );
      const footer = renderToStaticMarkup(createElement(MarketingFooter));
      assert.doesNotMatch(footer, /href="\/clinic"/u);
    });
  });

  test('clinic 랜딩 고정 문구도 현재 린터를 통과한다', () => {
    for (const copy of [
      '필요한 진료 정보를 찾기 쉬운 순서로 정리합니다.',
      '진료 범위·의료진·예약·오시는 길을 한 흐름으로 구성합니다.',
      '문구는 만들 때 한 번, 공개할 때 다시 확인합니다.',
      '고객이 입력한 표현은 임의로 바꾸지 않고 확인이 필요한 위치와 수정 방향을 알려드립니다.',
    ]) {
      assert.deepEqual(screenMedicalCopy(copy).violations, [], copy);
    }
  });
});

describe('MEDLAW R3 — 비의료·기존 의료 안전 정책 무회귀', () => {
  test('interior config는 의료 검사에서 즉시 빠지고 JSON·HTML SHA가 고정된다', () => {
    const config = interiorConfig();
    const before = JSON.stringify(config);
    assert.deepEqual(screenMedicalSiteConfig(config).violations, []);
    assert.equal(JSON.stringify(config), before);
    assert.equal(
      rendererSha(config),
      '6c33e882d6c2dc7ea69c4b885aa4cd86810a775522f775684c103b07d4052858',
    );
  });

  test('의료 후기는 계속 차단되고 의료 전후사진은 플래그와 무관하게 계속 비활성이다', () => {
    assert.deepEqual(testimonialExposurePolicy('medical'), {
      allowed: false,
      reason: 'medical-advertising-policy',
    });
    assert.deepEqual(resolveBeforeAfterFeatureDecision({
      medical: true,
      industryClass: 'medical',
      config: {
        beforeAfterEnabled: true,
        beforeAfterApprovedIndustries: ['beauty'],
      },
    }), {
      allowed: false,
      code: 'MEDICAL_BEFORE_AFTER_DISABLED',
    });
  });
});
