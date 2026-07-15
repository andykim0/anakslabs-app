import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { saveSiteDraft } from '@/components/dashboard/onboarding/section-review-api';
import { emptySiteConfig } from '@/lib/types/site';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const review = source('src/components/dashboard/onboarding/section-review-step.tsx');
const generate = source('src/components/dashboard/onboarding/generate-step.tsx');
const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Q$4 — 생성 후 섹션별 반복 검수 게이트', () => {
  test('기존 SiteConfig를 한 섹션 projection으로 보여주고 등록된 세 행동만 적용한다', () => {
    assert.match(review, /reviewTargets\(initialConfig\)/);
    assert.match(review, /configForSectionReview\(config, target\.pageSlug, target\.sectionId\)/);
    assert.match(review, /applySectionDirection\(config, direction\)/);
    for (const intent of ['keep', 'regenerate', 'adjust']) {
      assert.ok(review.includes(`'${intent}'`), `${intent} action 누락`);
    }
    assert.match(review, /SECTION_DIRECTION_GUIDES\.map/);
    assert.match(review, /maxLength=\{500\}/);
  });

  test('adjust/regenerate는 저장 뒤 같은 타깃에 남고 명시적 keep만 다음으로 이동한다', () => {
    assert.match(review, /const nextConfig = applySectionDirection\(config, direction\);\s*await saveSiteDraft\(siteId, nextConfig\);/);
    assert.match(review, /if \(intent === 'keep'\) \{[\s\S]*setTargetIndex\(\(current\) => current \+ 1\)/);
    assert.match(review, /좌우 배치를 바꿨어요\. 같은 섹션을 다시 확인한 뒤, 괜찮으면 이대로 확정해 주세요/);
    assert.equal((review.match(/setTargetIndex\(/g) ?? []).length, 1, 'keep 외 자동 진행 금지');
    assert.match(review, /좌우 배치 바꾸기/);
    assert.match(review, /이대로 확정하고 다음/);
    assert.match(review, /이대로 확정하고 완료/);
  });

  test('GenerateStep은 성공 후 기존 완료 카드보다 먼저 검수 게이트를 연다', () => {
    const gate = generate.indexOf('if (!reviewComplete)');
    const completion = generate.indexOf('<motion.div', gate);
    assert.ok(gate >= 0, 'review gate 누락');
    assert.ok(completion > gate, '기존 완료 카드보다 review gate가 먼저여야 함');
    assert.match(generate, /initialConfig=\{mutation\.data\.reviewConfig\}/);
    assert.match(generate, /onComplete=\{\(reviewedConfig\) => \{[\s\S]*onDirectionsChange\(reviewedConfig\.directions\);[\s\S]*setReviewComplete\(true\)/);
  });

  test('히어로는 선택한 애드온 무대를 preview-only로 복원하고 사진·움직임 재선택 진입점을 제공한다', () => {
    assert.match(review, /hasAppliedHeroVideo = Boolean\([\s\S]*background\.video\?\.src[\s\S]*background\.video\.poster/);
    assert.match(review, /!hasAppliedHeroVideo[\s\S]*config\.motion\?\.videoAddon === true \|\| config\.motion\?\.videoRequested === true/);
    assert.match(review, /previewAsAddon=\{previewAsAddon\}/);
    assert.match(review, /고른 영상 연출의 실제 스크롤 예시예요/);
    assert.match(review, /승인 후 생성된 실제 영상 초안이에요/);
    assert.match(review, /저장된 권한이나 발행물은 바꾸지 않고/);
    assert.match(review, /대표 사진 다시 고르기/);
    assert.match(review, /움직임 다시 고르기/);
    assert.match(review, /onClick=\{onChooseHeroImage\}/);
    assert.match(review, /onClick=\{onChooseHeroMotion\}/);
    assert.match(generate, /onChooseHeroImage=\{onChooseHeroImage\}/);
    assert.match(generate, /onChooseHeroMotion=\{onChooseHeroMotion\}/);
    assert.match(wizard, /onChooseHeroImage=\{\(\) => setStep\(2\)\}/);
    assert.match(wizard, /onChooseHeroMotion=\{\(\) => setStep\(4\)\}/);
  });

  test('완료된 direction 이력은 Wizard survey로 돌아가 다음 전체 reroll 입력에 남는다', () => {
    assert.match(wizard, /onDirectionsChange=\{\(directions\) => \{/);
    assert.match(wizard, /setSurvey\(\(current\) => \{/);
    assert.match(wizard, /return \{ \.\.\.current, directions: preserved \}/);
    assert.match(generate, /onDirectionsChange\(reviewedConfig\.directions\)/);
    assert.match(generate, /sectionDirectionsIntent\(survey\.directions\)/);
  });

  test('직접 편집 무료·무제한 링크를 항상 제공하고 검수 UI에는 원가 호출이 없다', () => {
    assert.match(review, /href=\{`\/dashboard\/sites\/\$\{siteId\}\/editor`\}/);
    assert.match(review, /횟수 제한 없이 무료/);
    for (const banned of ['fetch(', '/api/', 'generateSite', 'generateVeoVideo', 'edit-request', 'credit']) {
      assert.ok(!review.includes(banned), `검수 UI 원가/신규 경로 심볼 금지: ${banned}`);
    }
  });

  test('dashboard save helper는 기존 사이트 PATCH 경로에 draftConfig만 저장한다', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return jsonResponse({ ok: true });
    }) as typeof fetch;
    const draftConfig = emptySiteConfig('검수 초안');

    await saveSiteDraft('site/한글', draftConfig);

    assert.equal(requestUrl, '/api/sites/site%2F%ED%95%9C%EA%B8%80');
    assert.equal(requestInit?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), { draftConfig });
  });

  test('PATCH 성공처럼 보이는 잘못된 응답은 완료로 처리하지 않는다', async () => {
    globalThis.fetch = (async () => jsonResponse({ ok: false })) as typeof fetch;
    await assert.rejects(saveSiteDraft('site-1', emptySiteConfig('검수')), /사이트 초안 저장 응답/);
  });

  test('미지원 자유 메모는 반영 성공으로 말하지 않고 등록 방향을 안내한다', () => {
    assert.match(review, /sectionDirectionGuidesFromNote\(note\)/);
    assert.match(review, /이 메모는 자동 조정 규칙과 연결되지 않았어요/);
    assert.match(review, /선택한 방향 칩만 반영했어요\. 자유 메모는 자동 반영되지 않았으니/);
  });
});
