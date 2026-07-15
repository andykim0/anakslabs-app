import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('AI asset provenance — server-owned origin/owner wiring', () => {
  test('AI 서비스 계약은 설문과 분리된 인증 owner context를 실·mock 구현 모두 요구한다', () => {
    const contract = source('src/lib/data/types.ts');
    const real = source('src/lib/data/supabase/ai.ts');
    const mock = source('src/lib/data/mock/ai.ts');

    assert.match(contract, /export interface AiAssetOwnerContext\s*\{[\s\S]*clientId:\s*string;[\s\S]*siteId\?:\s*string;/);
    assert.match(contract, /generateCandidates\(survey: SurveyInput, owner: AiAssetOwnerContext\)/);
    assert.match(contract, /generateSiteConfig\([\s\S]*owner: AiAssetOwnerContext/);
    assert.match(contract, /generateImage\([\s\S]*owner: AiAssetOwnerContext/);
    assert.match(contract, /generateVideo\([\s\S]*owner: AiAssetOwnerContext/);

    for (const implementation of [real, mock]) {
      assert.match(implementation, /async generateCandidates\([\s\S]*AiAssetOwnerContext/);
      assert.match(implementation, /async generateSiteConfig\([\s\S]*AiAssetOwnerContext/);
      assert.match(implementation, /async generateImage\([\s\S]*AiAssetOwnerContext/);
      assert.match(implementation, /async generateVideo\([\s\S]*AiAssetOwnerContext/);
    }
  });

  test('인증/owned-site route만 clientId·siteId를 별도 인자로 공급하고 client body schema에는 받지 않는다', () => {
    const candidates = source('src/app/api/onboarding/candidates/route.ts');
    const generate = source('src/app/api/onboarding/generate/route.ts');
    const regenerate = source('src/app/api/onboarding/regenerate/route.ts');
    const edits = source('src/app/api/edit-requests/route.ts');
    const heroVideo = source('src/app/api/sites/[siteId]/hero-video/route.ts');

    assert.match(candidates, /getAuthedClient\(\)[\s\S]*generateCandidates\([\s\S]*\{ clientId: client\.id \}/);
    assert.match(generate, /getAuthedClient\(\)[\s\S]*generateSiteConfig\([\s\S]*\{ clientId: client\.id \}/);
    assert.match(regenerate, /getOwnedSite\(siteId, client\.id\)[\s\S]*generateSiteConfig\([\s\S]*\{ clientId: client\.id, siteId \}/);
    assert.match(edits, /getOwnedSite\(siteId, client\.id\)[\s\S]*generateImage\([\s\S]*\{ clientId: client\.id, siteId \}/);
    assert.match(edits, /generateGuardedVideo\(\{[\s\S]*clientId: client\.id,[\s\S]*siteId,/);
    assert.match(heroVideo, /getOwnedSite\(siteId, client\.id\)[\s\S]*generateHeroVideo\(\{[\s\S]*clientId: client\.id/);

    for (const [route, schemaMarker] of [
      [candidates, 'const bodySchema'],
      [generate, 'const bodySchema'],
      [regenerate, 'const bodySchema'],
      [edits, 'const bodySchema'],
      [heroVideo, 'const draftsBody'],
    ] as const) {
      const schemaStart = route.indexOf(schemaMarker);
      const schemaEnd = route.indexOf('\n});', schemaStart);
      const schema = route.slice(schemaStart, schemaEnd + '\n});'.length);
      assert.doesNotMatch(schema, /\b(?:owner|origin|clientId)\s*:/, '소유자/출처를 request body에서 받으면 안 된다');
    }
  });

  test('WRITE off는 기존 URL wrapper이고 WRITE on은 ai_generated registry dual-write를 await한다', () => {
    const storage = source('src/lib/data/supabase/storage.ts');
    const configRead = storage.indexOf('readAssetProvenanceConfig().write');
    const writeGate = storage.indexOf('return undefined;', configRead);
    const ownerGate = storage.indexOf('const clientId = input.owner.clientId.trim();', writeGate);
    const register = storage.indexOf('await registerAiGeneratedAsset({', ownerGate);
    const canonicalRef = storage.indexOf('toAssetRef(record).assetId', register);

    assert.ok(configRead >= 0 && configRead < writeGate && writeGate < ownerGate && ownerGate < register && register < canonicalRef);
    assert.match(storage, /registerAiGeneratedAsset\(\{[\s\S]*clientId,[\s\S]*siteId:[\s\S]*storageBucket: input\.storageBucket \?\? AI_ASSET_BUCKET,[\s\S]*storageKey: input\.objectPath,[\s\S]*canonicalUrl: input\.url,[\s\S]*mediaType: input\.mediaType/);
    assert.doesNotMatch(storage.slice(register, canonicalRef), /\borigin\s*:/, 'origin은 client/input이 아니라 fixed server helper가 정해야 한다');
    assert.match(storage, /uploadAiAsset\([\s\S]*return \(await uploadAiAssetDetailed\(input\)\)\.url/);
    assert.match(storage, /uploadAiVideo\([\s\S]*return \(await uploadAiVideoDetailed\(input\)\)\.url/);
    for (const boundary of ['uploadAiAsset', 'uploadAiAssetDetailed', 'uploadAiVideo', 'uploadAiVideoDetailed']) {
      const start = storage.indexOf(`export async function ${boundary}`);
      const end = storage.indexOf('}):', start);
      assert.match(storage.slice(start, end), /owner: AiAssetOwnerContext/, `${boundary} owner가 optional이면 안 된다`);
    }
  });

  test('Gemini 후보·섹션·편집 결과가 모두 detailed 등록 경로를 쓰고 registry 실패는 fallback하지 않는다', () => {
    const ai = source('src/lib/data/supabase/ai.ts');
    const helper = ai.slice(ai.indexOf('async function generateImageAsset'), ai.indexOf('// ---------- 1차 가공'));
    assert.match(helper, /generateGeminiImage\(/);
    assert.match(helper, /await uploadAiAssetDetailed\([\s\S]*owner,/);

    const candidates = ai.slice(ai.indexOf('async generateCandidates'), ai.indexOf('async generateSiteConfig'));
    const sections = ai.slice(ai.indexOf('async generateSiteConfig'), ai.indexOf('async generateText'));
    const edit = ai.slice(ai.indexOf('async generateImage'), ai.indexOf('async generateVideo'));
    assert.match(candidates, /generateImageAsset\(heroPrompt, 'candidates', owner, '16:9'\)/);
    assert.match(sections, /generateImageAsset\([\s\S]*'sections',[\s\S]*owner,[\s\S]*'4:3'/);
    assert.match(edit, /return generateImageAsset\([\s\S]*'edits',[\s\S]*owner/);
    for (const fallbackBoundary of [candidates, sections]) {
      const fatal = fallbackBoundary.indexOf('if (isAiAssetRegistrationError(err)) throw err;');
      const legacyFallback = fallbackBoundary.indexOf('console.warn', fatal);
      assert.ok(fatal >= 0 && fatal < legacyFallback, 'registry 실패를 기존 이미지 fallback으로 삼키면 안 된다');
    }
  });

  test('Veo는 입력 사진 출처와 무관하게 생성 결과 영상을 ai_generated로 등록한다', () => {
    const veo = source('src/lib/ai/veo-video.ts');
    const pipeline = source('src/lib/ai/video-pipeline.ts');
    assert.match(veo, /generateVeoVideo\([\s\S]*owner: AiAssetOwnerContext/);
    assert.match(veo, /generateVeoVideoBytes\(input\)[\s\S]*uploadAiVideoDetailed\(\{ bytes, mimeType, prefix: 'videos', owner \}\)/);
    assert.doesNotMatch(veo.slice(veo.indexOf('export interface VeoInput'), veo.indexOf('generateVeoVideoBytes')), /\borigin\??:/);
    assert.match(pipeline, /ai\.generateVideo\([\s\S]*\{ clientId: input\.clientId, siteId: input\.siteId \}/);
    assert.match(pipeline, /image\?: \{ base64: string; mimeType: string \}/);
  });

  test('WRITE registry 오류는 URL-only 성공이 아니라 명시 오류로 전파된다', () => {
    const storage = source('src/lib/data/supabase/storage.ts');
    const readiness = storage.slice(storage.indexOf('function readAssetProvenanceConfig'), storage.indexOf('export async function stampAiGeneratedAsset'));
    const stamp = storage.slice(storage.indexOf('export async function stampAiGeneratedAsset'), storage.indexOf('function extFromMime'));
    assert.match(readiness, /catch \(error\)[\s\S]*provenance flag 설정 오류/);
    assert.match(stamp, /if \(!clientId\)[\s\S]*throw new AiAssetRegistrationError/);
    assert.match(stamp, /catch \(error\)[\s\S]*throw new AiAssetRegistrationError\(`레지스트리 기록 실패/);
    assert.doesNotMatch(stamp, /catch \(error\)[\s\S]*return\s+(?:undefined|input\.url)/);
  });

  test('flag 의존성은 AI 비용·rate·credit·provider보다 앞에서 검증된다', () => {
    const real = source('src/lib/data/supabase/ai.ts');
    for (const [method, firstCost] of [
      ['async generateCandidates', 'buildCandidateBlueprints(survey)'],
      ['async generateSiteConfig', 'generateSectionCopy(survey, blueprint)'],
      ['async generateImage', "buildImagePrompt('editorial'"],
      ['async generateVideo', 'generateVeoVideo(input, owner)'],
    ] as const) {
      const start = real.indexOf(method);
      const ready = real.indexOf('assertAiAssetProvenanceReady();', start);
      const cost = real.indexOf(firstCost, start);
      assert.ok(start >= 0 && ready > start && ready < cost, method);
    }

    const candidates = source('src/app/api/onboarding/candidates/route.ts');
    assert.ok(candidates.indexOf('assetProvenanceConfig();') < candidates.indexOf('rateLimited(client.id'));
    const edits = source('src/app/api/edit-requests/route.ts');
    const preflight = edits.indexOf("if (type === 'image' || type === 'video') assetProvenanceConfig();");
    assert.ok(preflight >= 0 && preflight < edits.indexOf('await editRequests.create') && preflight < edits.indexOf('await credits.consume'));
    const hero = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const heroPreflight = hero.indexOf('assetProvenanceConfig();', hero.indexOf('export const POST'));
    assert.ok(heroPreflight >= 0 && heroPreflight < hero.indexOf('await assertVideoGenAllowed', heroPreflight));
  });

  test('candidate·config·Veo refs는 registry 검증과 site binding 뒤에만 저장된다', () => {
    const generate = source('src/app/api/onboarding/generate/route.ts');
    const validateCandidate = generate.indexOf('await validateCandidateAssetRef({');
    const create = generate.indexOf('sites.create({');
    const atomicRefs = generate.indexOf('assetRefsToBind: draftConfig.assetRefs', create);
    assert.ok(validateCandidate >= 0 && validateCandidate < create && atomicRefs > create);
    assert.doesNotMatch(
      generate.slice(create),
      /bindGeneratedConfigAssetRefs[\s\S]*sites\.saveDraft/,
      '최초 draft를 저장한 뒤 provisional refs를 사후 binding하면 안 된다',
    );

    const services = source('src/lib/data/supabase/services.ts');
    const rpc = services.indexOf(".rpc('create_site_with_asset_bindings'");
    const ordinaryInsert = services.indexOf(".from('sites')", rpc);
    assert.ok(rpc >= 0 && ordinaryInsert > rpc, 'asset manifest가 있으면 atomic RPC를 먼저 사용해야 한다');

    const editor = source('src/app/api/sites/[siteId]/route.ts');
    const validateManifest = editor.indexOf('await validateConfigAssetRefsForSave({');
    const editorSave = editor.indexOf('sites.saveDraft(siteId, sanitized)');
    assert.ok(validateManifest >= 0 && validateManifest < editorSave);

    const hero = source('src/app/api/sites/[siteId]/hero-video/route.ts');
    const resolve = hero.indexOf('await resolveOwnedAssetRecords({', hero.indexOf('export const PATCH'));
    const apply = hero.indexOf('applyHeroVideoToConfig(', resolve);
    const saveHero = hero.indexOf('sites.saveDraft(siteId, next)', apply);
    assert.ok(resolve >= 0 && resolve < apply && apply < saveHero);
    assert.match(hero.slice(resolve, apply), /clientId: client\.id[\s\S]*siteId/);
    assert.match(hero.slice(resolve, apply), /record\.origin !== 'ai_generated'[\s\S]*record\.mediaType !== 'video'/);
  });
});
