import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const meterSource = readFileSync(
  'src/components/dashboard/onboarding/onboarding-nudge.tsx',
  'utf8',
);
const surveySource = readFileSync(
  'src/components/dashboard/onboarding/survey-step.tsx',
  'utf8',
);
const contentSource = readFileSync(
  'src/components/dashboard/onboarding/steps/step03-content.tsx',
  'utf8',
);
const proofSource = readFileSync(
  'src/components/dashboard/onboarding/steps/step07-direction.tsx',
  'utf8',
);
const apiSource = readFileSync('src/components/dashboard/api.ts', 'utf8');

test('온보딩 UI는 서버 preflight 결과만 소비하고 점수 산식·규칙을 재정의하지 않는다', () => {
  assert.match(apiSource, /preflightOnboarding[\s\S]*\/api\/onboarding\/preflight/u);
  assert.match(meterSource, /preflightOnboarding\(JSON\.parse\(serialized\)/u);
  assert.doesNotMatch(
    `${meterSource}\n${surveySource}\n${contentSource}\n${proofSource}`,
    /runRules|buildScores|SCAN_SCORE_CAPACITY|SEO_RULES|AEO_RULES|GEO_RULES|scanRuleFor/u,
  );
});

test('클라이언트 디바운스와 서버 레이트리밋이 함께 존재하고 임시 config 저장 호출은 없다', () => {
  assert.match(meterSource, /PREFLIGHT_DEBOUNCE_MS = 900/u);
  assert.match(meterSource, /window\.setTimeout/u);
  const route = readFileSync('src/app/api/onboarding/preflight/route.ts', 'utf8');
  assert.match(route, /ONBOARDING_PREFLIGHT_RATE_LIMIT = 30/u);
  assert.doesNotMatch(route, /saveDraft|sites\.create|\.insert\(|\.update\(/u);
});

test('검증된 두 연결만 배지로 노출하고 무관한 색·폰트·전환 URL에는 배지를 붙이지 않는다', () => {
  assert.match(contentSource, /NudgeBadge id="public-contact"/u);
  assert.match(proofSource, /NudgeBadge id="metric-source"/u);
  assert.doesNotMatch(
    `${surveySource}\n${contentSource}\n${proofSource}`,
    /NudgeBadge id="(?:color|font|conversion|tone|image)/u,
  );
});

test('수치 증거 입력은 원문·발행 주체·기준일을 받고 출처 없는 감점 경고를 그대로 표시한다', () => {
  assert.match(proofSource, /proof\.sourceUrl/u);
  assert.match(proofSource, /proof\.publisher/u);
  assert.match(proofSource, /proof\.asOfDate/u);
  const mapping = readFileSync('src/lib/onboarding/nudge-mapping.ts', 'utf8');
  assert.match(mapping, /geo_unsourced_claims/u);
  assert.match(mapping, /A number without a source weakens trust/u);
});

test('넛지 카피는 순위·노출 확정 약속을 만들지 않는다', () => {
  const surface = `${meterSource}\n${surveySource}\n${contentSource}\n${proofSource}`;
  assert.doesNotMatch(surface, /나오게 만듭니다|순위를 보장|노출을 보장/u);
});
