import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import MarketingPrivacyPage from '@/app/(marketing)/privacy/page';
import {
  ANONYMOUS_SITE_EVENT_DISCLOSURE,
  EXTERNAL_AI_PROCESSING_DISCLOSURE,
  privacyPolicy,
  siteCollectsPersonalData,
} from '@/lib/legal/templates';
import { emptySiteConfig, type BusinessInfo } from '@/lib/types/site';

const BUSINESS_INFO: BusinessInfo = {
  businessName: '테스트 사업자',
  ownerName: '홍길동',
  phone: '02-0000-0000',
  isPersonal: false,
};

const DISCLOSURE_LINES = [
  ANONYMOUS_SITE_EVENT_DISCLOSURE.collected,
  ANONYMOUS_SITE_EVENT_DISCLOSURE.purpose,
  ANONYMOUS_SITE_EVENT_DISCLOSURE.excluded,
  ANONYMOUS_SITE_EVENT_DISCLOSURE.retention,
  ANONYMOUS_SITE_EVENT_DISCLOSURE.legalReview,
] as const;

describe('RPT4 — 익명 성과 측정 개인정보 고지', () => {
  test('고객 사이트 방침은 집계 항목·목적·제외 항목·24개월 보관·법무 검토를 모두 고지한다', () => {
    const document = privacyPolicy(BUSINESS_INFO);
    const section = document.sections.find((item) =>
      item.heading.includes(ANONYMOUS_SITE_EVENT_DISCLOSURE.heading),
    );

    assert.ok(section);
    assert.deepEqual(section.body, DISCLOSURE_LINES);
    assert.match(document.updatedNote, /법무 검토 대상/);
    assert.match(section.body.join(' '), /페이지 조회/);
    assert.match(section.body.join(' '), /전화·예약·길찾기/);
    assert.match(section.body.join(' '), /폼 제출 여부/);
    assert.match(section.body.join(' '), /유입 출처 분류/);
    assert.match(section.body.join(' '), /직접 방문\/사이트 내부/);
    assert.doesNotMatch(section.body.join(' '), /직접·사이트 내부/);
    assert.match(section.body.join(' '), /24개월/);
    assert.match(section.body.join(' '), /IP 주소/);
    assert.match(section.body.join(' '), /원문 리퍼러\(raw referrer\)/);
    assert.match(section.body.join(' '), /폼 입력 내용/);
  });

  test('다보임 마케팅 방침도 고객 사이트와 동일한 공용 고지를 실제 HTML에 렌더한다', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));

    assert.match(html, /익명 성과 측정 및 월간 리포트/);
    for (const line of DISCLOSURE_LINES) {
      assert.ok(html.includes(line), `마케팅 방침에서 공용 고지가 누락됨: ${line}`);
    }
  });

  test('실제 폼이 있는 config만 방문자 입력 수집을 고지한다', () => {
    const config = emptySiteConfig('개인정보 테스트');
    assert.equal(siteCollectsPersonalData(config), false);
    config.pages[0].sections.push({
      id: 'contact',
      name: '문의',
      type: 'contact',
      height: 520,
      background: { color: '#ffffff' },
      elements: [{
        id: 'form',
        kind: 'form',
        frame: { x: 0, y: 0, w: 600, h: 400 },
        z: 1,
        formType: 'contact',
        fields: ['name', 'phone', 'message'],
        submitLabel: '문의 보내기',
        style: { variant: 'card' },
      }],
    });
    assert.equal(siteCollectsPersonalData(config), true);
    assert.match(
      privacyPolicy(BUSINESS_INFO, { collectsPersonalData: true }).sections[0].body.join(' '),
      /이름, 연락처/,
    );
  });
});

describe('M2 — 외부 AI 처리 위탁 고지', () => {
  test('Daboim 방침은 Google·Anthropic 처리와 법무 검토 경계를 실제 HTML에 표시한다', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    for (const line of Object.values(EXTERNAL_AI_PROCESSING_DISCLOSURE)) {
      assert.ok(html.includes(line), `외부 AI 고지 누락: ${line}`);
    }
    assert.match(html, /Google AI 서비스/);
    assert.match(html, /Anthropic AI 서비스/);
    assert.match(html, /비밀번호와 결제정보는 AI 생성 요청에 전송하지 않/);
    assert.match(html, /수탁자의 정확한 법인명/);
    assert.match(html, /※ 법무 검토 대상/);
  });
});
