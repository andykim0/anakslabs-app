import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const STEP02 = read('src/components/dashboard/onboarding/steps/step02-existing.tsx');
const STEP03 = read('src/components/dashboard/onboarding/steps/step03-content.tsx');
const STEP04 = read('src/components/dashboard/onboarding/steps/step04-photos.tsx');
const STEP05 = read('src/components/dashboard/onboarding/steps/step05-image-style.tsx');
const STEP08 = read('src/components/dashboard/onboarding/steps/step08-review.tsx');
const HOST = read('src/components/dashboard/onboarding/survey-step.tsx');
const WIZARD = read('src/components/dashboard/onboarding/wizard.tsx');
const SHARED = read('src/components/dashboard/onboarding/steps/shared.tsx');
const IMPROVE = read('src/components/dashboard/onboarding/improve-step.tsx');
const DASHBOARD_API = read('src/components/dashboard/api.ts');

function block(source: string, start: string, end?: string): string {
  const from = source.indexOf(start);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.notEqual(from, -1, `missing source boundary: ${start}`);
  if (end) assert.notEqual(to, -1, `missing source boundary: ${end}`);
  return source.slice(from, to);
}

describe('asset-policy v2 onboarding wiring', () => {
  test('ASSIGN 준비 시 Step05는 네 방향 native radio를, 준비 전에는 기존 3스타일을 렌더한다', () => {
    assert.match(STEP05, /return assetPolicyV2Ready \? <V2ImageStyle \/> : <LegacyImageStyle \/>/);
    const legacy = block(STEP05, 'function LegacyImageStyle()', 'function DirectionSample(');
    const v2 = block(STEP05, 'function V2ImageStyle()');

    assert.match(legacy, /IMAGE_STYLE_OPTIONS\.map/);
    assert.match(legacy, /defaultImageStyle\(industry\)/);
    assert.match(legacy, /sm:grid-cols-3/);
    assert.doesNotMatch(legacy, /IMAGE_DIRECTION_OPTIONS|real_photo|canSelectRealPhoto/);

    assert.match(v2, /IMAGE_DIRECTION_OPTIONS\.map/);
    assert.match(v2, /<fieldset/);
    assert.match(v2, /type="radio"/);
    assert.match(v2, /const disabled = isRealPhoto && !realPhotoEligible/);
    assert.match(v2, /canSelectRealPhoto/);
    assert.match(v2, /heroPhotoAssetRef/);
    assert.match(v2, /heroPhotoUrl/);
    assert.match(v2, /generalAssetAttestationId/);
    assert.doesNotMatch(v2, /storePhotoUrls\.includes|heroPhotoUrl\s*\?/);
  });

  test('직접 hero/store/content 업로드만 refs를 보존하고 일반 확인은 versioned 서버 route를 호출한다', () => {
    assert.match(STEP04, /uploadImageWithAssetRef/);
    assert.match(STEP04, /setValue\('heroPhotoAssetRef', result\.assetRef/);
    assert.match(STEP04, /setValue\('storePhotoAssetRefs'/);
    assert.match(STEP04, /contentItems\.flatMap/);
    assert.match(STEP04, /createGeneralAssetAttestation/);
    assert.match(STEP04, /GENERAL_ASSET_ATTESTATION_TEXT/);
    assert.match(STEP04, /aria-live="polite"/);
    assert.match(STEP03, /uploadImageWithAssetRef/);
    assert.match(STEP03, /photoAssetRef/);
    assert.match(DASHBOARD_API, /\/api\/asset-attestations\/general/);
    assert.match(DASHBOARD_API, /statementVersion: GENERAL_ASSET_ATTESTATION_VERSION/);
    assert.match(DASHBOARD_API, /assetIds,/);
    assert.match(DASHBOARD_API, /personAssetIds,/);
    assert.match(DASHBOARD_API, /nonPersonAssetIds,/);
    assert.match(DASHBOARD_API, /idempotencyKey: input\.idempotencyKey/);
    assert.match(STEP04, /PERSON_ASSET_CONSENT_TEXT/);
    assert.match(STEP04, /createPersonAssetConsent/);
    assert.match(STEP04, /personPhotoAssetIds/);
    assert.match(STEP04, /nonPersonPhotoAssetIds/);
    assert.match(STEP04, /type="radio"/);
    assert.match(STEP04, /식별 가능한 인물 없음/);
    assert.match(STEP04, /classificationComplete/);
    assert.match(STEP04, /nonPersonPhotoAssetIds\.filter/);
    assert.match(STEP03, /nonPersonIds\.filter/);
    assert.match(DASHBOARD_API, /\/api\/asset-attestations\/person/);
    assert.match(DASHBOARD_API, /statementVersion: PERSON_ASSET_CONSENT_VERSION/);
    assert.doesNotMatch(DASHBOARD_API, /clientId: input\.clientId/);
  });

  test('외부 ingest refs는 importedPhotoAssetRefs에만 격리되고 real_photo 근거 배열에 쓰지 않는다', () => {
    assert.match(STEP02, /setValue\('importedPhotoAssetRefs'/);
    assert.doesNotMatch(STEP02, /setValue\('storePhotoAssetRefs'/);
    assert.match(STEP02, /assetPolicyV2Ready[\s\S]*?실사 사진 자격으로 자동 전환되지 않아요/);
    const attestationSet = STEP04.slice(
      STEP04.indexOf('const registeredAssetRefs'),
      STEP04.indexOf('const unregisteredPhotoCount'),
    );
    assert.doesNotMatch(attestationSet, /importedPhotoAssetRefs/);
  });

  test('submit은 ASSIGN 준비 시에만 신규 방향·refs를 전달하고 improve raw URLs는 예술 방향으로 고정한다', () => {
    assert.match(HOST, /\.\.\.\(assetPolicyV2Ready \? \{ imageDirectionId: selectedImageDirection \} : \{\}\)/);
    assert.match(HOST, /const heroPhotoAssetRef = values\.heroPhotoAssetRef\?\.url === heroPhotoUrl/);
    assert.match(HOST, /assetPolicyV2Ready && heroPhotoAssetRef \? \{ heroPhotoAssetRef \} : \{\}/);
    assert.match(HOST, /assetPolicyV2Ready && values\.storePhotoAssetRefs\.length[\s\S]*?storePhotoAssetRefs: values\.storePhotoAssetRefs/);
    assert.match(HOST, /assetPolicyV2Ready && values\.importedPhotoAssetRefs\.length[\s\S]*?importedPhotoAssetRefs: values\.importedPhotoAssetRefs/);
    assert.match(HOST, /assetPolicyV2Ready && values\.generalAssetAttestationId[\s\S]*?generalAssetAttestationId: values\.generalAssetAttestationId/);
    assert.match(HOST, /assetPolicyV2Ready && values\.personPhotoAssetIds\.length[\s\S]*?personPhotoAssetIds: values\.personPhotoAssetIds/);
    assert.match(HOST, /assetPolicyV2Ready && values\.nonPersonPhotoAssetIds\.length[\s\S]*?nonPersonPhotoAssetIds: values\.nonPersonPhotoAssetIds/);
    assert.match(HOST, /assetPolicyV2Ready && it\.photoAssetRef \? \{ photoAssetRef: it\.photoAssetRef \} : \{\}/);
    assert.match(HOST, /imageStyle: assetPolicyV2Ready/);
    assert.match(HOST, /defaultImageStyle\(values\.industry\)/);
    assert.match(IMPROVE, /recommendedImageDirection/);
    assert.match(IMPROVE, /Imported\/extracted URLs are not direct customer-upload evidence/);
    assert.match(IMPROVE, /imageStyle: assetPolicyV2Ready/);
    assert.match(IMPROVE, /defaultImageStyle\(industryClean\)/);
  });

  test('모든 onboarding 하위 화면은 같은 server readiness로 v2 전용 UX를 격리한다', () => {
    assert.match(STEP02, /const \{ setImportedBadge, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.match(STEP03, /const \{ siteId, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.equal((STEP04.match(/assetPolicyV2Ready && registeredAssetRefs\.length/g) ?? []).length, 2);
    assert.match(STEP04, /assetPolicyV2Ready && unregisteredPhotoCount > 0/);
    assert.match(STEP04, /assetPolicyV2Ready \? \([\s\S]*?aria-live="polite"/);
    assert.match(STEP08, /const \{ goTo, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.match(STEP08, /assetPolicyV2Ready && v\.importedPhotoAssetRefs\.length/);
    assert.match(STEP08, /title=\{assetPolicyV2Ready \? '이미지 방향' : '이미지 스타일'\}/);
    assert.match(HOST, /if \(!assetPolicyV2Ready\)/);
    assert.match(HOST, /\.\.\.\(assetPolicyV2Ready \? \{ imageDirectionId: selectedImageDirection \} : \{\}\)/);
    assert.match(IMPROVE, /\.\.\.\(assetPolicyV2Ready \? \{ imageDirectionId \} : \{\}\)/);
    assert.match(SHARED, /assetPolicyV2Ready: boolean/);
  });

  test('기존 사이트 사진은 owned site scope로 업로드·확인된다', () => {
    assert.match(WIZARD, /existingSiteId=\{siteId \?\? undefined\}/);
    assert.match(HOST, /siteId: existingSiteId/);
    assert.match(HOST, /assetPolicyV2Ready,/);
    assert.match(SHARED, /siteId\?: string/);
    assert.match(STEP04, /uploadImageWithAssetRef\(file, siteId\)/);
    assert.match(STEP04, /createPersonAssetConsent\(assetId, siteId\)/);
    assert.match(STEP04, /\.\.\.\(siteId \? \{ siteId \} : \{\}\)/);
    assert.match(DASHBOARD_API, /form\.append\('siteId', siteId\)/);
  });
});
