import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';
import { buildJsonLd, extractFaq } from '@/lib/seo/jsonld';
import {
  faqQuestionsForIndustry,
  resolveGuidedFaqAnswers,
} from '@/lib/content/content-depth';

const theme = emptySiteConfig('테스트').theme;
const candidate: DesignCandidate = {
  id: 'content-faq',
  label: '테스트',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme,
  description: '',
};

function survey(faqAnswers: NonNullable<SurveyInput['contentDepth']>['faqAnswers'] | undefined): SurveyInput {
  return {
    businessName: '사실가게',
    purposeId: 'local_store',
    purpose: '음식점·로컬 매장',
    industry: '카페·디저트',
    tone: ['차분한'],
    colorPreference: '브라운',
    referenceImageUrls: [],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
      { type: 'faq', name: '자주 묻는 질문', brief: '', source: 'template', pageSlug: '' },
      { type: 'contact', name: '문의', brief: '', source: 'template', pageSlug: '' },
    ],
    templateId: 'local_store.default',
    contentDepth: { version: 1, facts: [], faqAnswers: faqAnswers ?? [], imports: [] },
  };
}

test('업종별 질문은 사실 입력으로 커버되지 않는 유도형 질문만 제시한다', () => {
  const questions = faqQuestionsForIndustry('카페·디저트');
  assert.ok(questions.some((item) => item.id === 'takeout'));
  assert.ok(!questions.some((item) => item.id === 'parking'));
  assert.ok(!questions.some((item) => item.id === 'wifi'));
  assert.ok(!questions.some((item) => item.id === 'group'));
  assert.equal(new Set(questions.map((item) => item.id)).size, questions.length);
});

test('답한 질문만 카탈로그 순서로 해석하고 미등록·빈 답변은 버린다', () => {
  assert.deepEqual(resolveGuidedFaqAnswers('카페', [
    { questionId: 'wifi', answer: '  무료 와이파이를 제공합니다.  ' },
    { questionId: 'parking', answer: '' },
    { questionId: 'unknown', answer: '이 답은 노출되면 안 됩니다.' },
  ]), [{
    questionId: 'wifi',
    question: 'Do you have Wi-Fi and power outlets?',
    answer: '무료 와이파이를 제공합니다.',
}]);
});

test('신규 브리프는 사실 한 번 입력으로 FAQ를 파생하고 구 중복 답변은 명시 답변을 보존한다', () => {
  assert.deepEqual(resolveGuidedFaqAnswers('카페', [], [
    { key: 'openingHours', value: '매일 10:00–20:00', source: 'customer' },
    { key: 'parking', value: '주차 불가', source: 'customer' },
  ]), [
    { questionId: 'hours', question: 'What are your hours?', answer: '매일 10:00–20:00' },
    { questionId: 'parking', question: 'Where can I park?', answer: '주차 불가' },
  ]);
  assert.deepEqual(resolveGuidedFaqAnswers('카페', [
    { questionId: 'parking', answer: '기존 고객 답변' },
  ], [
    { key: 'parking', value: '새 사실 값', source: 'customer' },
  ]), [
    { questionId: 'parking', question: 'Where can I park?', answer: '기존 고객 답변' },
  ]);
});

test('고객 답변 하나가 화면 FAQ와 FAQPage JSON-LD의 같은 문자열이 된다', () => {
  const config = buildSiteConfigFromSurvey(survey([
    { questionId: 'parking', answer: '건물 주차장을 한 시간 이용할 수 있습니다.' },
  ]), candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  const faq = config.pages[0].sections.find((section) => section.type === 'faq');
  assert.ok(faq);
  const visible = extractFaq(faq!);
  assert.deepEqual(visible, [{
    q: 'Q. Where can I park?',
    a: '건물 주차장을 한 시간 이용할 수 있습니다.',
  }]);
  const structured = buildJsonLd(config, 'https://fact.example.com').find(
    (node) => node['@type'] === 'FAQPage',
  ) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
  assert.equal(structured.mainEntity[0]?.name, visible[0]?.q);
  assert.equal(structured.mainEntity[0]?.acceptedAnswer.text, visible[0]?.a);
});

test('답변이 하나도 없으면 FAQ 섹션과 FAQPage를 모두 만들지 않는다', () => {
  const config = buildSiteConfigFromSurvey(survey([]), candidate, {
    heroImageUrl: '/mock/hero.svg', imagePool: [],
  });
  assert.equal(config.pages.flatMap((page) => page.sections).some((section) => section.type === 'faq'), false);
  assert.equal(buildJsonLd(config, 'https://fact.example.com').some((node) => node['@type'] === 'FAQPage'), false);
});

test('종료된 네이버 리치 결과와 남은 질문 매칭 가치를 코드에 명시하고 UI는 고객 답만 받는다', () => {
  const root = process.cwd();
  const catalog = readFileSync(join(root, 'src/lib/content/content-depth.ts'), 'utf8');
  const ui = readFileSync(join(root, 'src/components/dashboard/onboarding/steps/step03-content.tsx'), 'utf8');
  assert.match(catalog, /2026-07-08 종료/);
  assert.match(catalog, /인덱싱·질문 매칭·AI 인용/);
  assert.match(ui, /Only questions you answer will be included on the website and in its structured FAQ/);
  assert.match(ui, /If you don't answer, it won't appear on the website/);
  assert.doesNotMatch(ui, /예상답변|자동생성한 답/);
});
