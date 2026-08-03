import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyInput } from '@/lib/types/domain';
import {
  surveyFormSchema,
  toFormDefaults,
} from '@/components/dashboard/onboarding/steps/shared';
import { REFERENTIAL_IMAGE_POLICY_COPY } from '@/lib/assets/image-directions';

const STEP04 = readFileSync(
  'src/components/dashboard/onboarding/steps/step04-photos.tsx',
  'utf8',
);
const REVIEW = readFileSync(
  'src/components/dashboard/onboarding/steps/step08-review.tsx',
  'utf8',
);
const HOST = readFileSync(
  'src/components/dashboard/onboarding/survey-step.tsx',
  'utf8',
);

describe('H4 — 대표 사진 폼 계약', () => {
  test('fresh 기본값은 빈 문자열이고 initialValues의 URL은 그대로 복원한다', () => {
    assert.equal(toFormDefaults(null).heroPhotoUrl, '');
    assert.equal(toFormDefaults(null).heroPhotoAssetRef, undefined);
    assert.deepEqual(toFormDefaults(null).storePhotoAssetRefs, []);
    const initial = {
      purposeId: 'local_store',
      purpose: '음식점·로컬 매장',
      businessName: '온화 다이닝',
      industry: '파인다이닝',
      tone: ['고급스러운'],
      colorPreference: '#222222',
      referenceImageUrls: [],
      sectionPlan: [],
      templateId: 'local_store.default',
      heroPhotoUrl: 'https://assets.example.com/customer/hero.webp',
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: 'https://assets.example.com/customer/hero.webp',
      },
    } as SurveyInput;
    assert.equal(toFormDefaults(initial).heroPhotoUrl, initial.heroPhotoUrl);
    assert.deepEqual(toFormDefaults(initial).heroPhotoAssetRef, initial.heroPhotoAssetRef);
    assert.equal(toFormDefaults({
      ...initial,
      heroPhotoAssetRef: { ...initial.heroPhotoAssetRef!, url: '/uploads/stale.webp' },
    }).heroPhotoAssetRef, undefined, 'URL projection과 어긋난 ref는 fail closed');
  });

  test('SurveyForm 스키마가 대표 사진 문자열을 storePhotoUrls와 별도로 보존한다', () => {
    const parsed = surveyFormSchema.safeParse({
      ...toFormDefaults(null),
      purposeId: 'local_store',
      businessName: '온화 다이닝',
      industry: '파인다이닝',
      tone: ['고급스러운'],
      heroPhotoUrl: 'https://assets.example.com/customer/hero.webp',
      storePhotoUrls: ['https://assets.example.com/customer/gallery.webp'],
      heroPhotoAssetRef: {
        assetId: '11111111-1111-4111-8111-111111111111',
        url: 'https://assets.example.com/customer/hero.webp',
      },
      storePhotoAssetRefs: [{
        assetId: '22222222-2222-4222-8222-222222222222',
        url: 'https://assets.example.com/customer/gallery.webp',
      }],
      generalAssetAttestationId: '33333333-3333-4333-8333-333333333333',
      personPhotoAssetIds: ['11111111-1111-4111-8111-111111111111'],
      nonPersonPhotoAssetIds: ['22222222-2222-4222-8222-222222222222'],
    });
    assert.equal(parsed.success, true);
    if (!parsed.success) return;
    assert.equal(parsed.data.heroPhotoUrl, 'https://assets.example.com/customer/hero.webp');
    assert.deepEqual(parsed.data.storePhotoUrls, ['https://assets.example.com/customer/gallery.webp']);
    assert.equal(parsed.data.heroPhotoAssetRef?.assetId, '11111111-1111-4111-8111-111111111111');
    assert.equal(parsed.data.storePhotoAssetRefs[0]?.assetId, '22222222-2222-4222-8222-222222222222');
    assert.equal(parsed.data.generalAssetAttestationId, '33333333-3333-4333-8333-333333333333');
    assert.deepEqual(parsed.data.personPhotoAssetIds, ['11111111-1111-4111-8111-111111111111']);
    assert.deepEqual(parsed.data.nonPersonPhotoAssetIds, ['22222222-2222-4222-8222-222222222222']);
  });
});

describe('H4 — 대표 사진 UI·제출 배선', () => {
  test('S4 상단 슬롯이 referential 래스터 업로드·교체·삭제·무업로드 안내를 제공한다', () => {
    assert.match(STEP04, /watch\('heroPhotoUrl'\)/);
    assert.match(STEP04, /setValue\('heroPhotoUrl', result\.url/);
    assert.match(STEP04, /setValue\('heroPhotoUrl', ''/);
    assert.match(STEP04, /setValue\('heroPhotoAssetRef', result\.assetRef/);
    assert.match(STEP04, /setValue\('heroPhotoAssetRef', undefined/);
    assert.match(STEP04, /accept="image\/png,image\/jpeg,image\/webp"/);
    assert.match(STEP04, /Upload featured photo/);
    assert.match(STEP04, /Replace photo/);
    assert.match(STEP04, /REFERENTIAL_IMAGE_POLICY_COPY\.intro/);
    assert.match(STEP04, /REFERENTIAL_IMAGE_POLICY_COPY\.heroHint/);
    assert.match(STEP04, /REFERENTIAL_IMAGE_POLICY_COPY\.collectionHint/);
    assert.match(REFERENTIAL_IMAGE_POLICY_COPY.intro, /spaces, people, services, or logo/u);
    assert.match(REFERENTIAL_IMAGE_POLICY_COPY.intro, /zero uploads do not block generation/u);
  });

  test('호스트는 공백을 정리한 heroPhotoUrl을 SurveyInput으로 전달한다', () => {
    assert.match(HOST, /const heroPhotoUrl = clean\(values\.heroPhotoUrl\)/);
    assert.match(HOST, /heroPhotoUrl,/);
    assert.match(
      HOST,
      /assetPolicyV2Ready && heroPhotoAssetRef \? \{ heroPhotoAssetRef \} : \{\}/,
      'legacy requests must not submit a v2 authority projection',
    );
    assert.match(HOST, /values\.heroPhotoAssetRef\?\.url === heroPhotoUrl/);
  });

  test('확인 화면은 대표 사진과 일반 사진을 별도 행으로 보여준다', () => {
    assert.match(REVIEW, /Row title="Representative real photos"/);
    assert.match(REVIEW, /Row title="Clinic, service, and team photos"/);
    assert.match(REVIEW, /v\.heroPhotoAssetRef/);
    assert.match(REVIEW, /URL image \(not direct-upload evidence\)/);
  });
});
