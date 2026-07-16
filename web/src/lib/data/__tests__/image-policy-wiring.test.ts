import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

describe('v2 image policy provider wiring', () => {
  test('mock applies policy only to v2, before latency/counter/stamp, and preserves the legacy pool', () => {
    const mock = source('mock/ai.ts');
    const start = mock.indexOf('async generateImage(');
    const end = mock.indexOf('async generateVideo(', start);
    const block = mock.slice(start, end);
    const cohort = block.indexOf('if (owner.assetPolicyVersion === 2)');
    const policy = block.indexOf('assertAiImageGenerationPolicy({');
    const latency = block.indexOf('simulateLatency(');
    const counter = block.indexOf('store.counters.image');
    const stamp = block.indexOf('stampMockAiAsset(');
    assert.ok(cohort >= 0 && cohort < policy && policy < latency && latency < counter && counter < stamp);
    assert.match(block, /const pool = owner\.assetPolicyVersion === 2 \? SAFE_V2_MOCK_IMAGE_POOL : MOCK_IMAGE_POOL/);
  });

  test('real provider branches v2 to the safe prompt and legacy to the existing prompt', () => {
    const ai = source('supabase/ai.ts');
    const start = ai.indexOf('async generateImage(');
    const end = ai.indexOf('async generateVideo(', start);
    const block = ai.slice(start, end);
    const cohort = block.indexOf('owner.assetPolicyVersion === 2');
    const policy = block.indexOf('assertAiImageGenerationPolicy({');
    const setup = block.indexOf('assertAiAssetProvenanceReady();');
    const provider = block.indexOf('generateImageAsset(');
    assert.ok(cohort >= 0 && cohort < policy && policy < setup && setup < provider);
    assert.match(block, /imageDirectionId: 'abstract_editorial'/);
    assert.match(block, /const safePrompt = plan[\s\S]*buildV2ImagePrompt\([\s\S]*:\s*buildImagePrompt\(/);
    assert.match(block, /candidateStyle:\s*'photo'/, 'legacy provider path must remain intact');
  });

  test('edit route returns stable 422 only for a server-loaded v2 site before mutation', () => {
    const route = readFileSync(
      new URL('../../../app/api/edit-requests/route.ts', import.meta.url),
      'utf8',
    );
    const cohort = route.indexOf("if (type === 'image' && site.assetPolicyVersion === 2)");
    const policy = route.indexOf('assertAiImageGenerationPolicy({');
    const errorResponse = route.indexOf('apiError(error.status, error.code, error.message', policy);
    const services = route.indexOf('getDataServices()', policy);
    const create = route.indexOf('editRequests.create({', policy);
    const credit = route.indexOf('credits.consume({', policy);
    const provider = route.indexOf('ai.generateImage(', policy);
    assert.ok(cohort >= 0 && policy > cohort && errorResponse > policy);
    assert.ok(errorResponse < services && services < create && create < credit && credit < provider);
    assert.match(route.slice(policy, services), /guidance: error\.guidance/);
    assert.match(
      route.slice(provider),
      /\.\.\.\(site\.assetPolicyVersion === 2 \? \{ assetPolicyVersion: 2 as const \} : \{\}\)/,
    );
    const schema = route.slice(route.indexOf('const bodySchema'), route.indexOf('\n});', route.indexOf('const bodySchema')));
    assert.doesNotMatch(schema, /assetPolicyVersion/);
  });

  test('new provider paths use v2 prompt builder while legacy prompt stays isolated', () => {
    const candidates = source('design-candidates.ts');
    const real = source('supabase/ai.ts');
    const mock = source('mock/ai.ts');
    assert.match(candidates, /if \(survey\.imageDirectionId\)[\s\S]*buildV2ImagePrompt/);
    assert.match(real, /v2ImagePrompt\([\s\S]*povImagePrompt/);
    assert.match(mock, /SAFE_V2_MOCK_IMAGE_POOL/);
    assert.doesNotMatch(
      mock.slice(mock.indexOf('SAFE_V2_MOCK_IMAGE_POOL'), mock.indexOf('const MOCK_AI_ASSET_BUCKET')),
      /interior-hwarodam/,
    );
  });
});
