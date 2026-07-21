import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function before(text: string, first: string, second: string, message: string): void {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  assert.ok(firstIndex >= 0, `missing ${first}`);
  assert.ok(secondIndex >= 0, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test('candidate factual truth checks run before rate mutation and image providers', () => {
  const route = source('src/app/api/onboarding/candidates/route.ts');
  before(route, 'verifySurveyAssetTruth({', 'rateLimited(client.id', 'truth must precede rate accounting');
  before(route, 'verifySurveyAssetTruth({', 'ai.generateCandidates(', 'truth must precede candidate providers');
  assert.match(route, /requiresAiMedia && !cfg\.enabled/);
  assert.match(route, /verified\.direction === 'real_photo'/);
  before(route, 'submittedSurvey.imageDirectionId && !provenance.assign', 'rateLimited(client.id', 'rollout gate must precede rate accounting');
  before(route, 'submittedSurvey.imageDirectionId && !provenance.assign', 'ai.generateCandidates(', 'rollout gate must precede providers');
  assert.match(route, /imageDirectionId: DEFAULT_V2_IMAGE_DIRECTION/);
  assert.match(route, /getOwnedSite\(targetSiteId, client\.id\)/);
  const candidateValidation = route.indexOf('validateCandidateAssetRef({');
  const finalCandidateResponse = route.indexOf('return NextResponse.json({ candidates })', candidateValidation);
  assert.ok(candidateValidation >= 0 && finalCandidateResponse > candidateValidation, 'candidate response must be canonical before exposure');
  assert.match(route, /expectedImageDirectionId: verifiedDirection/);
  assert.match(route, /allowedCustomerUploadAssetIds: verified\.directUploadAssetRefs\.map/);
  assert.match(route, /error instanceof CandidateAssetTruthError/);
});

test('generate and regenerate verify truth before AI, mutation, or free-regen accounting', () => {
  const generate = source('src/app/api/onboarding/generate/route.ts');
  before(generate, 'verifySurveyAssetTruth({', 'ai.generateSiteConfig(', 'truth must precede generation');
  before(generate, 'verifySurveyAssetTruth({', 'sites.create({', 'truth must precede site creation');
  assert.match(generate, /mergeCanonicalAssetRefs\(draftConfig\.assetRefs, truth\.directUploadAssetRefs\)/);
  before(generate, 'resolveSiteAssetPolicy({', 'sites.create({', 'slot assignment must precede site creation');
  assert.match(generate, /operation: 'assign'[\s\S]*assetPolicyVersion[\s\S]*phase: 'generation'/);
  assert.match(generate, /generalAssetAttestationId: survey\.generalAssetAttestationId/);
  assert.match(generate, /expectedImageDirectionId: survey\.imageDirectionId/);
  assert.match(generate, /error instanceof CandidateAssetTruthError/);
  assert.match(generate, /customerUploadAssetRefs: truth\.directUploadAssetRefs/);

  const regenerate = source('src/app/api/onboarding/regenerate/route.ts');
  before(regenerate, 'verifySurveyAssetTruth({', 'const used = site.freeRegensUsed', 'truth must precede regen accounting');
  before(regenerate, 'verifySurveyAssetTruth({', 'ai.generateSiteConfig(', 'truth must precede regeneration');
  before(regenerate, 'verifySurveyAssetTruth({', 'incrementFreeRegens(', 'truth must precede counter mutation');
  assert.match(regenerate, /site\.assetPolicyVersion === 2 && !submittedSurvey\.imageDirectionId/);
  assert.match(regenerate, /expectedImageDirectionId: survey\.imageDirectionId/);
  assert.match(regenerate, /customerUploadAssetRefs: truth\.directUploadAssetRefs/);
  before(regenerate, 'resolveSiteAssetPolicy({', 'sites.saveDraft(siteId, draftConfig)', 'slot assignment must precede draft persistence');
  before(regenerate, 'resolveSiteAssetPolicy({', 'incrementFreeRegens(', 'slot assignment must precede regen accounting');
});

test('v2 image edit policy rejects factual prompts before mutation while legacy stays on its existing provider path', () => {
  const route = source('src/app/api/edit-requests/route.ts');
  before(route, "if (type === 'image' && site.assetPolicyVersion === 2)", 'assertAiImageGenerationPolicy({', 'only the server-owned v2 cohort may enter the new policy');
  before(route, 'assertAiImageGenerationPolicy({', 'getDataServices()', 'policy must precede service access');
  before(route, 'assertAiImageGenerationPolicy({', 'workflow.submit({', 'policy must precede atomic request+credit mutation');
  before(route, 'assertAiImageGenerationPolicy({', 'ai.generateImage(', 'policy must precede provider');
  assert.match(route, /apiError\(error\.status, error\.code, error\.message/);
  assert.match(
    route,
    /ai\.generateImage\([\s\S]*\.\.\.\(site\.assetPolicyVersion === 2 \? \{ assetPolicyVersion: 2 as const \} : \{\}\)/,
    'provider owner context must carry v2 only for a server-loaded v2 site',
  );
  const bodySchema = route.slice(route.indexOf('const bodySchema'), route.indexOf('\n});', route.indexOf('const bodySchema')));
  assert.doesNotMatch(bodySchema, /assetPolicyVersion/, 'client edit DTO cannot opt itself into or out of v2');
});

test('customer upload candidates require a server-preverified ID allowlist', () => {
  const refs = source('src/lib/assets/owned-refs.ts');
  assert.match(refs, /record\.origin === 'customer_upload'/);
  assert.match(refs, /allowedCustomerUploadAssetIds\?\.includes\(record\.id\)/);
  assert.doesNotMatch(refs, /storePhotoUrls\.includes|heroPhotoUrl\.includes/);
});

test('editor and hero-video saves re-run the server asset policy before persistence', () => {
  const editor = source('src/app/api/sites/[siteId]/route.ts');
  before(editor, 'resolveSiteAssetPolicy({', 'sites.saveDraft(siteId, assetPolicy.config)', 'editor save must audit asset slots first');
  assert.match(editor, /operation: 'assign'[\s\S]*assetPolicyVersion: site\.assetPolicyVersion/);

  const heroVideo = source('src/app/api/sites/[siteId]/hero-video/route.ts');
  before(heroVideo, 'resolveSiteAssetPolicy({', 'sites.saveDraft(siteId, assetPolicy.config)', 'video assignment must precede save');
  assert.match(heroVideo, /operation: 'assign'[\s\S]*assetPolicyVersion: site\.assetPolicyVersion/);
});
