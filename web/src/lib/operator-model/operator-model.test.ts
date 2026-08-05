import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server';
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
import {
  OPERATOR_MANAGED_ONBOARDING_ERROR_CODE,
  operatorManagedOnboardingApiGate,
} from '@/app/api/onboarding/_lib/operator-gate';
import { DEMO_CLINIC_ID } from '@/lib/data/mock/seed';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

test('US customer workspace is operator-managed while non-US behavior is unchanged', () => {
  assert.deepEqual(
    customerWorkspaceItemsForLocale('en-US'),
    ['sites', 'blog', 'reports', 'settings'],
  );
  assert.equal(onboardingAllowedForLocale('en-US'), false);
  assert.equal(selfSignupAllowedForLocale('en-US'), false);

  assert.deepEqual(
    customerWorkspaceItemsForLocale('ko-KR'),
    ['sites', 'blog', 'reports', 'billing', 'credits', 'settings'],
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
  assert.equal(built.config.meta.timezone, 'America/Los_Angeles');
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

test('every self-service onboarding route rejects the US operator-managed product', async () => {
  // Route modules legitimately import server-only modules. The standalone Node runner does not
  // expose Next's server condition, so neutralize only its marker package while importing the
  // actual exported route handlers; no application dependency is mocked.
  const moduleLoader = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleLoader._load;
  moduleLoader._load = function loadForRouteTest(request, parent, isMain) {
    if (request === 'server-only') return {};
    if (request === 'next/headers') {
      return {
        cookies: async () => ({
          // The operator-managed customer is the US clinic workspace that mock login lands on.
          get: (name: string) => name === 'anaks_mock_session'
            ? { value: DEMO_CLINIC_ID }
            : undefined,
          getAll: () => [],
          set: () => undefined,
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const routeModules = await Promise.all([
    import('@/app/api/onboarding/candidates/route'),
    import('@/app/api/onboarding/generate/route'),
    import('@/app/api/onboarding/import/route'),
    import('@/app/api/onboarding/improve-extract/route'),
    import('@/app/api/onboarding/menu-ocr/route'),
    import('@/app/api/onboarding/preflight/route'),
    import('@/app/api/onboarding/regenerate/route'),
    import('@/app/api/onboarding/suggest-section/route'),
  ]).finally(() => {
    moduleLoader._load = originalLoad;
  });
  const routes = [
    ['/api/onboarding/candidates', routeModules[0].POST],
    ['/api/onboarding/generate', routeModules[1].POST],
    ['/api/onboarding/import', routeModules[2].POST],
    ['/api/onboarding/improve-extract', routeModules[3].POST],
    ['/api/onboarding/menu-ocr', routeModules[4].POST],
    ['/api/onboarding/preflight', routeModules[5].POST],
    ['/api/onboarding/regenerate', routeModules[6].POST],
    ['/api/onboarding/suggest-section', routeModules[7].POST],
  ] as const;

  for (const [pathname, handler] of routes) {
    const response = await handler(new NextRequest(`http://app.anakslabs.com${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }), undefined as never);
    assert.equal(response.status, 403, pathname);
    const payload = await response.json() as { error?: { code?: string } };
    assert.equal(payload.error?.code, OPERATOR_MANAGED_ONBOARDING_ERROR_CODE, pathname);
  }

  assert.equal(operatorManagedOnboardingApiGate('ko-KR'), null);
});
