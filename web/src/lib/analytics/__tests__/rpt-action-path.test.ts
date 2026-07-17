import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { emptySiteConfig } from '@/lib/types/site';
import { extraFeatureSelectionSchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { applyExtraFeatures } from '@/lib/data/extras-inject';
import { resolveTemplate, planFromTemplate, pagePlanFromTemplate } from '@/lib/data/site-blueprints';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import {
  businessDirectionsHref,
  businessPhoneHref,
  classifyTrackableHref,
  isRecognizedReservationUrl,
} from '@/lib/analytics/trackable-actions';

const RESERVATION_URL = 'https://booking.naver.com/booking/6/bizes/12345';
const candidate: DesignCandidate = {
  id: 'reservation-actions',
  label: '예약 액션',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme: emptySiteConfig('예약 액션').theme,
  description: '',
};

function reservationSurvey(): SurveyInput {
  const template = resolveTemplate('booking_service', '미용실');
  return {
    businessName: '다보임 살롱',
    purposeId: 'booking_service',
    purpose: '예약·서비스업',
    industry: '미용실',
    tone: ['모던'],
    colorPreference: '#1268e8',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    siteGoal: 'reserve',
    contentItems: [{ name: '커트', price: '30,000원' }],
  };
}

describe('RPT action path — 실제 href만 생성·집계', () => {
  test('예약 링크 계약은 beacon과 같은 HTTPS allowlist만 통과시키고 legacy omission은 보존한다', () => {
    assert.deepEqual(
      extraFeatureSelectionSchema.parse({ reservationLink: { url: RESERVATION_URL } }),
      { reservationLink: { url: RESERVATION_URL } },
    );
    assert.equal(extraFeatureSelectionSchema.safeParse({}).success, true, '레거시 extras는 계속 유효해야 함');
    for (const url of [
      'http://booking.naver.com/booking/1',
      'https://example.com/reservation',
      '#sec-contact',
      'javascript:alert(1)',
    ]) {
      assert.equal(
        extraFeatureSelectionSchema.safeParse({ reservationLink: { url } }).success,
        false,
        url,
      );
    }
    assert.equal(isRecognizedReservationUrl('https://pf.kakao.com/_shop'), true);
  });

  test('생성 config → extras 주입 → zod 저장 → 공용 hosted/static renderer에 실제 CTA가 남는다', () => {
    const generated = buildSiteConfigFromSurvey(reservationSurvey(), candidate, {
      heroImageUrl: '/mock/hero.svg',
      imagePool: ['/mock/a.svg', '/mock/b.svg'],
    });
    const injected = applyExtraFeatures(generated, { reservationLink: { url: RESERVATION_URL } });
    injected.businessInfo = {
      businessName: '다보임 살롱',
      ownerName: '김대표',
      businessNumber: '123-45-67890',
      address: '서울특별시 마포구 월드컵북로 1',
      phone: '02-1234-5678',
    };
    const stored = siteConfigSchema.parse(injected);
    const homeHero = stored.pages.find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
    const primary = homeHero?.elements.find(
      (element) => element.kind === 'button' && element.id.includes('hero-cta') && !element.id.includes('cta2'),
    );
    assert.ok(primary?.kind === 'button');
    assert.equal(primary.href, RESERVATION_URL);
    assert.equal(primary.label, '예약하기');

    // TenantPageContent is the single body renderer used by hosted /s and render-static.
    const markup = renderToStaticMarkup(createElement(TenantPageContent, {
      config: stored,
      pageSlug: '',
      siteId: 'site_action_path',
      interactive: true,
      animate: false,
      privacyHref: './privacy.html',
      termsHref: './terms.html',
    }));
    const root = parse(markup);
    const reservation = root.querySelector(`a[href="${RESERVATION_URL}"]`);
    assert.ok(reservation, '정적/호스팅 공용 마크업에 실제 예약 링크가 없음');
    assert.equal(reservation?.text.trim(), '예약하기');
    assert.equal(classifyTrackableHref(reservation?.getAttribute('href') ?? '', 'https://shop.example'), 'reserve');
    assert.equal(root.querySelectorAll('[data-daboim-action]').length, 0);

    const phone = root.querySelector('a[href="tel:0212345678"]');
    assert.ok(phone, '검증된 전화가 실제 tel 링크가 아님');
    assert.equal(phone?.text.trim(), '전화 02-1234-5678');
    assert.equal(classifyTrackableHref(phone?.getAttribute('href') ?? '', 'https://shop.example'), 'tel');

    const directionsHref = businessDirectionsHref('서울특별시 마포구 월드컵북로 1');
    assert.ok(directionsHref);
    const directions = root.querySelector(`a[href="${directionsHref}"]`);
    assert.ok(directions, '검증된 주소가 실제 지도 링크가 아님');
    assert.equal(classifyTrackableHref(directions?.getAttribute('href') ?? '', 'https://shop.example'), 'directions');
  });

  test('잘못된 예약 extras는 기존 내부 CTA를 바꾸지 않고 전화·주소 변환도 fail-closed한다', () => {
    const generated = buildSiteConfigFromSurvey(reservationSurvey(), candidate, {
      heroImageUrl: '/mock/hero.svg',
      imagePool: ['/mock/a.svg'],
    });
    const before = JSON.stringify(generated);
    const invalid = applyExtraFeatures(generated, { reservationLink: { url: 'https://example.com/book' } });
    const hero = invalid.pages.find((page) => page.slug === '')?.sections.find((section) => section.type === 'hero');
    const primary = hero?.elements.find(
      (element) => element.kind === 'button' && element.id.includes('hero-cta') && !element.id.includes('cta2'),
    );
    assert.ok(primary?.kind === 'button');
    assert.equal(
      classifyTrackableHref(primary.href, 'https://shop.example'),
      null,
      '내부 contact 이동은 완료된 외부 행동으로 분류하면 안 됨',
    );
    assert.equal(JSON.stringify(generated), before, '입력 config를 변이하면 안 됨');
    assert.equal(businessPhoneHref('연락주세요'), undefined);
    assert.equal(businessDirectionsHref('   '), undefined);
  });

  test('generate/regenerate 모두 공용 injector를 호출하고 export는 같은 TenantPageContent를 사용한다', () => {
    const generate = readFileSync(new URL('../../../app/api/onboarding/generate/route.ts', import.meta.url), 'utf8');
    const regenerate = readFileSync(new URL('../../../app/api/onboarding/regenerate/route.ts', import.meta.url), 'utf8');
    const staticRenderer = readFileSync(new URL('../../export/render-static.ts', import.meta.url), 'utf8');
    const extrasUi = readFileSync(new URL('../../../components/dashboard/onboarding/extras-step.tsx', import.meta.url), 'utf8');
    for (const route of [generate, regenerate]) {
      assert.match(route, /applyExtraFeatures\(generated, body\.data\.extras, body\.data\.extrasOptions \?\? \{\}\)/);
    }
    assert.match(staticRenderer, /createElement\(TenantPageContent/);
    assert.match(extrasUi, /isRecognizedReservationUrl/);
    assert.match(extrasUi, /건너뛰기/);
    assert.match(extrasUi, /survey\.siteGoal === 'reserve'/, '예약 목표에서만 기본 추천해야 함');
  });
});
