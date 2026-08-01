import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { PublishPrice } from '@/components/marketing/PublishPrice';
import {
  INDUSTRY_PROFILES,
  KO_BASIC_MAINTENANCE_MONTHLY_KRW,
  KO_BASIC_PROMOTION_END_DATE,
  KO_BASIC_SETUP_LIST_KRW,
  KO_BASIC_SETUP_PROMOTION_KRW,
  PREVIOUS_PRICING_MODEL_VERSION,
  PRICING,
  PRICING_MODEL_VERSION,
  PUBLISH_PAYMENT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
  US_ENTERPRISE_PRICING,
  US_ENTERPRISE_PRICING_MODEL_VERSION,
  industryProfile,
  koBasicSetupPriceAt,
} from '@/lib/pricing';
import { aiEditEnabled, creditsEnabled } from '@/lib/product/flags';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function sourceFiles(path: string): string[] {
  const absolute = join(process.cwd(), path);
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).flatMap((entry) => sourceFiles(join(path, entry)));
}

describe('PRICE-V6 가격 계약', () => {
  test('KO 베이직 가격·프로모션 종료일·유지비·영상 포함을 고정한다', () => {
    assert.equal(PRICING.modelVersion, PRICING_MODEL_VERSION);
    assert.equal(PRICING_MODEL_VERSION, 'price-v6-2026-08');
    assert.deepEqual(PRICING.build, {
      listAmountKrw: KO_BASIC_SETUP_LIST_KRW,
      promotionalAmountKrw: KO_BASIC_SETUP_PROMOTION_KRW,
      promotionEndsOn: KO_BASIC_PROMOTION_END_DATE,
      paymentTiming: 'publish',
      vatIncluded: true,
    });
    assert.equal(KO_BASIC_SETUP_LIST_KRW, 990_000);
    assert.equal(KO_BASIC_SETUP_PROMOTION_KRW, 490_000);
    assert.equal(KO_BASIC_PROMOTION_END_DATE, '2026-10-31');
    assert.equal(KO_BASIC_MAINTENANCE_MONTHLY_KRW, 29_000);
    assert.equal(PRICING.subscription.amountKrw, 29_000);
    assert.equal(PRICING.subscription.creditsPerMonth, 0);
    assert.equal(PRICING.subscription.reportFrequency, 'none');
    assert.deepEqual(PRICING.subscription.annualCommitment, { status: 'unavailable' });
    assert.deepEqual(PRICING.videoHero, {
      included: true,
      includedGenerations: 1,
      generationTiming: 'admin-approval',
    });
    assert.equal(PRICING.selfEdit, 'unlimited-free');
  });

  test('프로모션은 2026-10-31 KST 종료 뒤 정가로 결정적으로 전환된다', () => {
    assert.equal(koBasicSetupPriceAt(new Date('2026-10-31T23:59:59.999+09:00')), 490_000);
    assert.equal(koBasicSetupPriceAt(new Date('2026-11-01T00:00:00.000+09:00')), 990_000);
  });

  test('현재 공개 프로필은 KO 베이직 하나이고 과거 clinic 값은 읽기 경계에만 남는다', () => {
    assert.deepEqual(Object.keys(INDUSTRY_PROFILES), ['interior']);
    assert.equal(industryProfile('clinic'), null);
    assert.equal(industryProfile('clinic', PREVIOUS_PRICING_MODEL_VERSION)?.monthlyKrw, 790_000);
  });

  test('US Enterprise 가격과 딜리버러블 4종은 상수로만 고정한다', () => {
    assert.equal(US_ENTERPRISE_PRICING.modelVersion, US_ENTERPRISE_PRICING_MODEL_VERSION);
    assert.equal(US_ENTERPRISE_PRICING_MODEL_VERSION, 'enterprise-us-v6-2026-08');
    assert.equal(US_ENTERPRISE_PRICING.setupUsd, 990);
    assert.equal(US_ENTERPRISE_PRICING.monthlyUsd, 990);
    assert.deepEqual(US_ENTERPRISE_PRICING.deliverables, [
      'monthly-report',
      'blog-posts-8',
      'inquiry-booking-tracking',
      'hosting-selfedit',
    ]);
  });

  test('크레딧·AI 편집 스위치는 기본 off이고 명시적 1만 허용한다', () => {
    assert.equal(creditsEnabled({}), false);
    assert.equal(aiEditEnabled({}), false);
    assert.equal(creditsEnabled({ CREDITS_ENABLED: '0' }), false);
    assert.equal(aiEditEnabled({ AI_EDIT_ENABLED: 'true' }), false);
    assert.equal(creditsEnabled({ CREDITS_ENABLED: '1' }), true);
    assert.equal(aiEditEnabled({ AI_EDIT_ENABLED: '1' }), true);
  });

  test('동결 스위치는 UI를 숨기고 주요 API를 인증·DB 접근 전에 차단한다', () => {
    const guarded = [
      ['src/app/api/credits/route.ts', 'if (!creditsEnabled())', 'const client = await getAuthedClient()'],
      ['src/app/api/credits/purchase/route.ts', 'if (!creditsEnabled())', 'const client = await getAuthedClient()'],
      ['src/app/api/admin/credits/adjust/route.ts', 'if (!creditsEnabled())', 'const forbidden = await requireAdminOr403()'],
      ['src/app/api/edit-requests/route.ts', 'if (!aiEditEnabled())', 'const client = await getAuthedClient()'],
    ] as const;
    for (const [path, flag, firstProtectedWork] of guarded) {
      const bytes = read(path);
      assert.ok(bytes.indexOf(flag) >= 0, `${path}: 동결 스위치 누락`);
      assert.ok(
        bytes.indexOf(flag) < bytes.indexOf(firstProtectedWork),
        `${path}: 인증·DB 작업보다 동결 가드가 늦음`,
      );
    }
    assert.match(read('src/app/(dashboard)/layout.tsx'), /creditsAvailable=\{creditsEnabled\(\)\}/);
    assert.match(read('src/app/(dashboard)/dashboard/page.tsx'), /aiEditAvailable \? services\.editRequests/);
    assert.match(read('src/app/(dashboard)/dashboard/credits/page.tsx'), /if \(!creditsEnabled\(\)\) notFound\(\)/);
    assert.match(read('src/app/(dashboard)/dashboard/sites/[siteId]/editor/page.tsx'), /aiEditAvailable=\{aiEditEnabled\(\)\}/);
    assert.match(read('src/components/editor/EditorShell.tsx'), /aiEditAvailable \? \([\s\S]*AI 편집/);
    assert.match(read('src/components/editor/Inspector.tsx'), /if \(!aiEditAvailable\) return null/);
    assert.match(read('src/components/admin/client-detail-panel.tsx'), /data\.creditsEnabled \? \([\s\S]*크레딧 수동 조정/);
  });

  test('KO 가격 SSR은 정가·프로모·종료일·유지비를 보이고 US 가격은 보이지 않는다', () => {
    const markup = renderToStaticMarkup(createElement(PublishPrice));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.setupList));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.setupPromotion));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.promotionEndsOn));
    assert.ok(markup.includes(PUBLISH_PAYMENT_COPY.monthlyMaintenance));
    assert.match(markup, /<del/u);
    assert.doesNotMatch(markup, /\$|USD|Enterprise/u);
  });

  test('현재 혜택은 유지·셀프 편집·영상 포함만 고정한다', () => {
    assert.deepEqual(SUBSCRIPTION_BENEFIT_COPY, {
      operations: '호스팅·SSL·백업·유지',
      selfEdit: '직접 수정 무제한 무료',
      videoHero: '승인한 디자인의 영상 히어로 1회 생성 포함',
    });
  });

  test('디자인 후보는 영상을 생성하지 않고 최종 관리자 승인만 1회 생성 경계를 탄다', () => {
    const candidates = read('src/app/api/onboarding/candidates/route.ts');
    const approval = read('src/app/api/admin/video-queue/[siteId]/generate/route.ts');
    const env = read('src/lib/env.ts');
    assert.doesNotMatch(candidates, /generateHeroVideo|generateGuardedVideo|generateVideo/);
    assert.match(approval, /approved: z\.literal\(true\)/);
    assert.match(approval, /videoGen\.countBySite\(siteId\)/);
    assert.match(approval, /INCLUDED_VIDEO_ALREADY_GENERATED/);
    const guardAt = approval.indexOf('await assertVideoGenAllowed(');
    const generateAt = approval.indexOf('await generateHeroVideo(');
    const promoteAt = approval.indexOf("await clients.updateTier(client.id, 'premium')");
    assert.ok(guardAt >= 0 && guardAt < generateAt && generateAt < promoteAt);
    assert.match(approval, /stage: 'final'/);
    assert.match(env, /VIDEO_GEN_ENABLED === '1'/);
    assert.match(env, /VIDEO_GEN_MAX_PER_SITE\) \|\| 6/);
    assert.match(env, /VIDEO_GEN_DAILY_CAP\) \|\| 20/);
  });
});

describe('PRICE-V6 표시 계약 스캔', () => {
  test('마케팅·가격 표면에 폐기 가격·유료 영상 애드온·크레딧 혜택이 없다', () => {
    const roots = [
      'src/app/(auth)',
      'src/app/(marketing)',
      'src/components/marketing',
      'src/lib/publish/human-checks.ts',
    ];
    const files = roots
      .flatMap(sourceFiles)
      .filter((path) => /\.tsx?$/.test(path) && !path.includes('/__tests__/'));
    const forbidden = /790_?000|790,000|79\s*만|200_?000|200,000|20\s*만|videoHeroAddon|CREDIT_CONTRACT_COPY|CREDIT_PACKS/u;

    for (const file of files) {
      assert.doesNotMatch(read(file), forbidden, `${file}: 폐기된 가격·혜택 표면`);
    }
  });

  test('KO 가격 페이지는 US 가격을 노출하거나 영어 가격 라우트를 만들지 않는다', () => {
    const pricingPage = read('src/app/(marketing)/pricing/page.tsx');
    assert.doesNotMatch(pricingPage, /US_ENTERPRISE|setupUsd|monthlyUsd|\$990/u);
    assert.equal(sourceFiles('src/app/(marketing)').some((path) => /(?:^|\/)en(?:\/|$).*pricing/u.test(path)), false);
  });
});
