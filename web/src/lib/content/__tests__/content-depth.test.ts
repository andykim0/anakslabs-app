import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { PURPOSES } from '@/lib/data/purpose-taxonomy';
import {
  contentIndustryGroup,
  factQuestionsForIndustry,
  missingRequiredFacts,
} from '@/lib/content/content-depth';

test('업종 카탈로그는 카페·의료·미용·공방·교육·법률·리테일을 결정적으로 분류한다', () => {
  assert.equal(contentIndustryGroup('카페·디저트'), 'cafe');
  assert.equal(contentIndustryGroup('파인다이닝·오마카세'), 'food');
  assert.equal(contentIndustryGroup('병원·의원'), 'medical');
  assert.equal(contentIndustryGroup('네일·왁싱·속눈썹'), 'beauty');
  assert.equal(contentIndustryGroup('공방·원데이클래스'), 'workshop');
  assert.equal(contentIndustryGroup('입시·보습학원'), 'education');
  assert.equal(contentIndustryGroup('전문서비스 법인(법무·회계)'), 'legal');
  assert.equal(contentIndustryGroup('편집숍·소품샵'), 'retail');
  assert.equal(contentIndustryGroup('알 수 없는 자유 업종'), 'generic');
});

test('모든 기존 업종 칩은 연락처·영업시간과 중복 없는 선택 질문을 받는다', () => {
  for (const industry of PURPOSES.flatMap((purpose) => purpose.industries)) {
    const questions = factQuestionsForIndustry(industry);
    assert.ok(questions.some((question) => question.key === 'phone' && question.required), industry);
    assert.ok(questions.some((question) => question.key === 'openingHours' && question.required), industry);
    assert.equal(new Set(questions.map((question) => question.key)).size, questions.length, industry);
  }
});

test('필수 사실은 빈 문자열을 답변으로 세지 않고 고객·가져오기 출처 모두 수용한다', () => {
  assert.deepEqual(missingRequiredFacts([]), ['phone', 'openingHours']);
  assert.deepEqual(missingRequiredFacts([
    { key: 'phone', value: '  ', source: 'customer' },
    { key: 'openingHours', value: '화–일 10:00–20:00', source: 'customer_import' },
  ]), ['phone']);
  assert.deepEqual(missingRequiredFacts([
    { key: 'phone', value: '02-123-4567', source: 'customer' },
    { key: 'openingHours', value: '화–일 10:00–20:00', source: 'customer_import' },
  ]), []);
});

test('온보딩은 답한 사실만 저장하고 신규 제출에 contentDepth 게이트를 고정한다', () => {
  const root = process.cwd();
  const step = readFileSync(join(root, 'src/components/dashboard/onboarding/steps/step03-content.tsx'), 'utf8');
  const host = readFileSync(join(root, 'src/components/dashboard/onboarding/survey-step.tsx'), 'utf8');
  const shared = readFileSync(join(root, 'src/components/dashboard/onboarding/steps/shared.tsx'), 'utf8');
  const extras = readFileSync(join(root, 'src/components/dashboard/onboarding/extras-step.tsx'), 'utf8');
  assert.match(step, /답하지 않은 내용은 지어내지 않습니다/);
  assert.match(step, /답할수록 내 홈페이지에 사실 기반 안내와 섹션이 더해져요/);
  assert.match(step, /next\[index\] = \{ key, value, source: 'customer' \}/);
  assert.doesNotMatch(step, /예상 답변|자동 답변|placeholder.*value=/);
  assert.match(host, /missingRequiredFacts/);
  assert.match(host, /contentDepth: \{\s*version: 1 as const,/);
  assert.match(host, /mainStorytelling: \{\s*version: 1 as const,/);
  assert.match(step, /가게의 이야기를 들려주세요/);
  assert.match(step, /register\('brandStory'\)/);
  assert.match(step, /register\('brandOrigin'\)/);
  assert.match(step, /register\('brandPhilosophy'\)/);
  assert.match(step, /비워두면 지어낸 일화 대신 가게가 지향하는 태도만 담아요/);
  assert.match(extras, /mainDirectionsPageEnabled\(survey\)/);
  assert.match(extras, /targetPageSlug: 'directions'/);
  assert.match(shared, /2: \['purposeId', 'businessName', 'industry', 'region'\]/);
});
