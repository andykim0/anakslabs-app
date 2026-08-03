import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  customerWorkspaceItemsForLocale,
  onboardingAllowedForLocale,
  selfSignupAllowedForLocale,
} from './policy';
import {
  buildOperatorMinimalSiteConfig,
  minimalOperatorSurvey,
  OPERATOR_MINIMAL_SITE_FIELDS,
  siteFormCount,
} from './site-generation';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

test('US customer workspace is operator-managed while non-US behavior is unchanged', () => {
  assert.deepEqual(customerWorkspaceItemsForLocale('en-US'), ['sites', 'reports', 'settings']);
  assert.equal(onboardingAllowedForLocale('en-US'), false);
  assert.equal(selfSignupAllowedForLocale('en-US'), false);

  assert.deepEqual(
    customerWorkspaceItemsForLocale('ko-KR'),
    ['sites', 'reports', 'billing', 'credits', 'settings'],
  );
  assert.equal(onboardingAllowedForLocale('ko-KR'), true);
  assert.equal(selfSignupAllowedForLocale('ko-KR'), true);
});

test('minimal operator input is four source-free fields and creates no form', async () => {
  assert.deepEqual(OPERATOR_MINIMAL_SITE_FIELDS, [
    'businessName',
    'industry',
    'tone',
    'colorPreference',
  ]);
  const input = {
    businessName: 'Operator Dental',
    industry: 'Dental practice',
    tone: 'calm and clinical',
    colorPreference: 'clean blue',
  };
  const survey = minimalOperatorSurvey(input);
  assert.equal(survey.purposeId, 'booking_service');
  assert.equal(survey.templateId, 'booking_service.clinic');
  assert.deepEqual(survey.referenceImageUrls, []);

  const built = await buildOperatorMinimalSiteConfig(input, 'basic');
  assert.equal(built.config.meta.locale, 'en-US');
  assert.equal(built.config.meta.medicalAdPolicyVersion, 'us-medical-ad-2026-08-v1');
  assert.equal(siteFormCount(built.config), 0);
});

test('admin routes preserve exact auth/client binding and existing generators', () => {
  const invite = read('src/app/api/admin/clients/invite/route.ts');
  const create = read('src/app/api/admin/clients/[id]/sites/route.ts');
  assert.match(invite, /requireAdminOr403/u);
  assert.match(invite, /auth\.generateLink/u);
  assert.match(invite, /id: generated\.data\.user\.id/u);
  assert.match(invite, /properties\.hashed_token/u);
  assert.match(invite, /\/api\/auth\/confirm-invite/u);
  assert.doesNotMatch(invite, /password/u);
  assert.match(create, /buildOperatorCrawlSiteConfig/u);
  assert.match(create, /buildOperatorMinimalSiteConfig/u);
  assert.match(create, /formCount !== 0/u);
});

test('unissued login cannot create a client and cross-client site pages fail closed', () => {
  const auth = read('src/lib/services/auth.ts');
  const postLogin = read('src/app/api/_lib/post-login.ts');
  const detail = read('src/app/(dashboard)/dashboard/sites/[siteId]/page.tsx');
  assert.match(auth, /operatorManagedForLocale[\s\S]*clients\.getById\(user\.id\)/u);
  assert.match(postLogin, /if \(!\(await clients\.getById\(user\.id\)\)\) return false/u);
  assert.match(postLogin, /user\.app_metadata\?\.role === 'admin'\) return true/u);
  assert.match(detail, /site\.clientId !== client\.id\) notFound\(\)/u);
});

test('customer onboarding route remains implemented but is gated for US', () => {
  const onboarding = read('src/app/(dashboard)/onboarding/page.tsx');
  const generate = read('src/app/api/onboarding/generate/route.ts');
  assert.match(onboarding, /onboardingAllowedForLocale/u);
  assert.match(onboarding, /redirect\('\/dashboard'\)/u);
  assert.match(generate, /buildZeroCostSiteConfig/u);
});
