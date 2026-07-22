import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { IMAGE_STYLE_OPTIONS, defaultImageStyle } from '@/lib/onboarding/image-style';

const read = (path: string) => readFileSync(path, 'utf8');
const PAGE = read('src/app/(dashboard)/onboarding/page.tsx');
const WIZARD = read('src/components/dashboard/onboarding/wizard.tsx');
const SURVEY = read('src/components/dashboard/onboarding/survey-step.tsx');
const IMPROVE = read('src/components/dashboard/onboarding/improve-step.tsx');
const STEP02 = read('src/components/dashboard/onboarding/steps/step02-existing.tsx');
const STEP03 = read('src/components/dashboard/onboarding/steps/step03-content.tsx');
const STEP04 = read('src/components/dashboard/onboarding/steps/step04-photos.tsx');
const STEP05 = read('src/components/dashboard/onboarding/steps/step05-image-style.tsx');
const STEP08 = read('src/components/dashboard/onboarding/steps/step08-review.tsx');

function between(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source boundary: ${start}`);
  assert.notEqual(to, -1, `missing source boundary: ${end}`);
  return source.slice(from, to);
}

describe('asset-policy v2 rollout UI', () => {
  test('ASSIGN readiness is resolved server-side and only a boolean reaches the client wizard', () => {
    assert.match(PAGE, /assetProvenanceConfig\(\)\.assign/);
    assert.match(PAGE, /assetPolicyV2Ready=\{assetPolicyV2Ready\}/);
    assert.doesNotMatch(WIZARD, /process\.env|assetProvenanceConfig/);
    assert.match(WIZARD, /assetPolicyV2Ready=\{assetPolicyV2Ready\}/g);
  });

  test('ASSIGN OFF renders the exact legacy three-card catalog and industry defaults', () => {
    assert.match(STEP05, /return assetPolicyV2Ready \? <V2ImageStyle \/> : <LegacyImageStyle \/>/);

    const legacy = between(STEP05, 'function LegacyImageStyle()', 'function DirectionSample(');
    assert.match(legacy, /IMAGE_STYLE_OPTIONS\.map/);
    assert.match(legacy, /defaultImageStyle\(industry\)/);
    assert.match(legacy, /sm:grid-cols-3/);
    assert.match(legacy, /aria-pressed=\{selected\}/);
    assert.doesNotMatch(legacy, /IMAGE_DIRECTION_OPTIONS|real_photo|canSelectRealPhoto/);

    assert.deepEqual(IMAGE_STYLE_OPTIONS.map((option) => option.id), [
      'photo',
      '3d_render',
      'illustration',
    ]);
    assert.equal(defaultImageStyle('카페'), 'photo');
    assert.equal(defaultImageStyle('뷰티 살롱'), 'photo');
    assert.equal(defaultImageStyle('법률 사무소'), 'photo');
    assert.equal(defaultImageStyle('SaaS 플랫폼'), '3d_render');
    assert.equal(defaultImageStyle('아동 미술 공방'), 'illustration');
  });

  test('fresh and improve flag-off submissions preserve legacy imageStyle and omit every v2 authority field', () => {
    assert.match(SURVEY, /if \(!assetPolicyV2Ready\) \{\s*goTo\(step \+ 1\);\s*return;/);
    assert.match(SURVEY, /\.\.\.\(assetPolicyV2Ready \? \{ imageDirectionId: selectedImageDirection \} : \{\}\)/);
    assert.match(
      SURVEY,
      /imageStyle: assetPolicyV2Ready[\s\S]*?: \(values\.imageStyle as CandidateStyle \| undefined\) \?\? defaultImageStyle\(values\.industry\)/,
    );
    assert.match(SURVEY, /assetPolicyV2Ready && heroPhotoAssetRef \? \{ heroPhotoAssetRef \} : \{\}/);
    assert.match(SURVEY, /assetPolicyV2Ready && values\.storePhotoAssetRefs\.length[\s\S]*?storePhotoAssetRefs: values\.storePhotoAssetRefs/);
    assert.match(SURVEY, /assetPolicyV2Ready && values\.importedPhotoAssetRefs\.length[\s\S]*?importedPhotoAssetRefs: values\.importedPhotoAssetRefs/);
    assert.match(SURVEY, /assetPolicyV2Ready && values\.generalAssetAttestationId[\s\S]*?generalAssetAttestationId: values\.generalAssetAttestationId/);
    assert.match(SURVEY, /assetPolicyV2Ready && values\.personPhotoAssetIds\.length[\s\S]*?personPhotoAssetIds: values\.personPhotoAssetIds/);
    assert.match(SURVEY, /assetPolicyV2Ready && values\.nonPersonPhotoAssetIds\.length[\s\S]*?nonPersonPhotoAssetIds: values\.nonPersonPhotoAssetIds/);
    assert.match(SURVEY, /assetPolicyV2Ready && it\.photoAssetRef \? \{ photoAssetRef: it\.photoAssetRef \} : \{\}/);

    assert.match(IMPROVE, /\.\.\.\(assetPolicyV2Ready \? \{ imageDirectionId \} : \{\}\)/);
    assert.match(
      IMPROVE,
      /imageStyle: assetPolicyV2Ready[\s\S]*?: defaultImageStyle\(industryClean\)/,
    );
    assert.doesNotMatch(SURVEY, /process\.env/);
    assert.doesNotMatch(IMPROVE, /process\.env/);
  });

  test('flag-off photo, import, and review UX hides v2-only friction and copy', () => {
    assert.match(STEP02, /const \{ setImportedBadge, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.match(
      STEP02,
      /assetPolicyV2Ready[\s\S]*?사진 단계에서 사용 권리를 확인하면 실사로 쓸 수 있어요\.[\s\S]*?: `사진 \$\{got\.length\}장을 담았어요\. 다음 사진 단계에서 확인할 수 있어요\.`/,
    );

    assert.match(STEP03, /const \{ siteId, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.match(STEP03, /if \(assetPolicyV2Ready && !uploaded\.assetRef\) \{[\s\S]*?실사 사진 방향에는 사용할 수 없어요/);

    assert.equal((STEP04.match(/assetPolicyV2Ready && registeredAssetRefs\.length/g) ?? []).length, 2);
    assert.match(STEP04, /assetPolicyV2Ready && unregisteredPhotoCount > 0/);
    assert.match(STEP04, /assetPolicyV2Ready \? \([\s\S]*?aria-live="polite"/);

    assert.match(STEP08, /const \{ goTo, assetPolicyV2Ready \} = useSurveyUx\(\)/);
    assert.match(STEP08, /!assetPolicyV2Ready \? \([\s\S]*?1장 · 히어로에 사용[\s\S]*?AI가 분위기에 맞춰 연출/);
    assert.match(STEP08, /assetPolicyV2Ready && v\.importedPhotoAssetRefs\.length/);
    assert.match(STEP08, /assetPolicyV2Ready \? \([\s\S]*?title="실제 사진 사용 확인"/);
    assert.match(STEP08, /assetPolicyV2Ready && v\.personPhotoAssetIds\.length/);
    assert.match(STEP08, /assetPolicyV2Ready && v\.nonPersonPhotoAssetIds\.length/);
    assert.match(STEP08, /title=\{assetPolicyV2Ready \? '이미지 방향' : '이미지 스타일'\}/);
    assert.match(STEP08, /assetPolicyV2Ready \? imageDirectionLabel : legacyImageStyleLabel/);
  });
});
