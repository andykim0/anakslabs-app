import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { surveySchema } from '@/app/api/_lib/schemas';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';

const candidate: DesignCandidate = {
  id: 'survey-brief', label: '설문 브리프', style: 'photo', heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('설문 브리프').theme, description: '',
};

function makeSurvey(goal: SurveyInput['siteGoal'] = 'call'): SurveyInput {
  const template = resolveTemplate('company_brand', '법률 법인');
  return {
    businessName: '정직 법률', purposeId: 'company_brand', purpose: template.label,
    industry: '법률 법인', tone: ['차분한'], colorPreference: '#425466', referenceImageUrls: [],
    sectionPlan: planFromTemplate(template), pagePlan: pagePlanFromTemplate(template), templateId: template.id,
    siteGoal: goal, contentItems: [{ name: '기업 자문' }],
    contentDepth: {
      version: 2, imports: [], faqAnswers: [],
      facts: [{ key: 'phone', value: '02-123-4567', source: 'customer' }],
      mainStorytelling: { version: 1 },
      surveyBrief: {
        version: 1,
        targetCustomer: '복잡한 문제를 처음 상담하려는 소상공인에게 필요한 내용을 전합니다.',
        visitorNeed: '상담 가능한 업무와 준비할 자료를 먼저 알고 싶어 합니다.',
        valueProposition: '어려운 내용을 이해하기 쉬운 말로 차분히 안내합니다.',
        conversionDestination: { kind: 'phone_fact' },
      },
    },
  };
}

function homeHero(survey: SurveyInput) {
  const config = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  const hero = config.pages.find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
  assert.ok(hero);
  return { config, hero };
}

function primaryCtaHref(survey: SurveyInput): string | undefined {
  for (const element of homeHero(survey).hero.elements) {
    if (element.kind === 'button' && element.id.includes('hero-cta') && !element.id.includes('cta2')) {
      return element.href;
    }
  }
  return undefined;
}

function primaryCtaLabel(survey: SurveyInput): string | undefined {
  for (const element of homeHero(survey).hero.elements) {
    if (element.kind === 'button' && element.id.includes('hero-cta') && !element.id.includes('cta2')) {
      return element.label;
    }
  }
  return undefined;
}

test('코어 브리프 문장은 히어로·스토리·가치에 고객 원문 그대로 소비된다', () => {
  const survey = makeSurvey();
  const { config, hero } = homeHero(survey);
  const allText = config.pages.flatMap((page) => page.sections).flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : []).join(' ');
  assert.ok(hero.elements.some((element) => element.kind === 'text' && element.text === survey.contentDepth?.surveyBrief?.valueProposition));
  assert.match(allText, /복잡한 문제를 처음 상담하려는 소상공인/u);
  assert.match(allText, /상담 가능한 업무와 준비할 자료/u);
  assert.match(allText, /어려운 내용을 이해하기 쉬운 말로 차분히 안내/u);
});

test('전화·예약·메신저·문의 폼 목적지는 히어로 주 CTA의 실제 href가 된다', () => {
  const phone = makeSurvey('call');
  assert.equal(primaryCtaHref(phone), 'tel:021234567');

  const reserve = makeSurvey('reserve');
  reserve.contentDepth!.surveyBrief!.conversionDestination = {
    kind: 'reservation_url', url: 'https://booking.naver.com/booking/6/bizes/1',
  };
  assert.equal(primaryCtaHref(reserve), 'https://booking.naver.com/booking/6/bizes/1');

  const messenger = makeSurvey('kakao_inquiry');
  messenger.contentDepth!.surveyBrief!.conversionDestination = { kind: 'messenger_url', url: 'https://pf.kakao.com/_shop' };
  assert.equal(primaryCtaHref(messenger), 'https://pf.kakao.com/_shop');

  messenger.contentDepth!.surveyBrief!.conversionDestination = { kind: 'contact_form' };
  assert.equal(primaryCtaHref(messenger), '#sec-contact');
  assert.equal(primaryCtaLabel(messenger), 'Contact us');
});

test('서버 스키마는 브리프를 왕복하고 안전하지 않은 전환 URL을 거부한다', () => {
  const valid = makeSurvey('reserve');
  valid.contentDepth!.surveyBrief!.conversionDestination = {
    kind: 'reservation_url', url: 'https://booking.naver.com/booking/6/bizes/1',
  };
  assert.deepEqual(surveySchema.parse(valid).contentDepth?.surveyBrief, valid.contentDepth?.surveyBrief);

  valid.contentDepth!.surveyBrief!.conversionDestination = {
    kind: 'reservation_url', url: 'https://example.com/not-a-booking-service',
  };
  assert.equal(surveySchema.safeParse(valid).success, false);
});

test('출처 상태가 붙은 증거만 SitePlan 신뢰 섹션을 활성화하고 내부 상태는 렌더하지 않는다', () => {
  const survey = makeSurvey('trust');
  const before = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  assert.equal(before.pages.flatMap((page) => page.sections).some((section) => section.type === 'team'), false);
  assert.equal(before.pages.flatMap((page) => page.sections).some((section) => section.type === 'cases'), false);

  survey.contentDepth!.surveyBrief!.proofs = [
    { kind: 'qualification', content: '고객이 확인한 등록 자격', sourceStatus: 'evidence_available' },
    { kind: 'case', content: '고객이 게시를 허락한 실제 자문 사례', sourceStatus: 'publication_permission' },
  ];
  const after = buildSiteConfigFromSurvey(survey, candidate, { heroImageUrl: '/mock/hero.svg', imagePool: [] });
  const sections = after.pages.flatMap((page) => page.sections);
  assert.ok(sections.some((section) => section.type === 'team'));
  assert.ok(sections.some((section) => section.type === 'cases'));
  const text = sections.flatMap((section) => section.elements)
    .flatMap((element) => element.kind === 'text' ? [element.text] : []).join(' ');
  assert.match(text, /고객이 확인한 등록 자격/u);
  assert.match(text, /고객이 게시를 허락한 실제 자문 사례/u);
  assert.doesNotMatch(text, /customer_confirmed|evidence_available|publication_permission/u);
});

test('검증 가능한 증거는 종류·내용·출처 상태가 모두 있어야 서버 경계를 통과한다', () => {
  const survey = makeSurvey('trust');
  survey.contentDepth!.surveyBrief!.proofs = [
    { kind: 'award', content: '고객이 확인한 수상', sourceStatus: 'evidence_available' },
  ];
  assert.equal(surveySchema.safeParse(survey).success, true);
  const malformed = structuredClone(survey) as unknown as {
    contentDepth: { surveyBrief: { proofs: Array<Record<string, unknown>> } };
  };
  delete malformed.contentDepth.surveyBrief.proofs[0].sourceStatus;
  assert.equal(surveySchema.safeParse(malformed).success, false);
});
