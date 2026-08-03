import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import MarketingPrivacyPage from '@/app/(marketing)/privacy/page';
import {
  ANONYMOUS_SITE_EVENT_DISCLOSURE,
  US_TENANT_LEGAL_DOCUMENTS_ENABLED,
  US_TENANT_LEGAL_PLACEHOLDERS,
  UsTenantLegalDocumentsPendingError,
  assertUsTenantLegalDocumentsReady,
  pinUsTenantLocaleForNewSite,
  siteCollectsPersonalData,
  usPrivacyPolicy,
  usTermsOfService,
} from '@/lib/legal/templates';
import { emptySiteConfig, type BusinessInfo } from '@/lib/types/site';
import { checkPublish } from '@/lib/publish/preflight';

const BUSINESS_INFO: BusinessInfo = {
  businessName: '테스트 사업자',
  ownerName: '홍길동',
  phone: '02-0000-0000',
  isPersonal: false,
};

describe('US tenant legal publication boundary', () => {
  test('pending placeholders are non-publishable and both legal document builders fail closed', () => {
    const config = emptySiteConfig('US legal boundary');
    config.meta.locale = 'en-US';
    config.businessInfo = BUSINESS_INFO;

    assert.equal(US_TENANT_LEGAL_DOCUMENTS_ENABLED, false);
    assert.equal(US_TENANT_LEGAL_PLACEHOLDERS.privacy.publishable, false);
    assert.equal(US_TENANT_LEGAL_PLACEHOLDERS.terms.publishable, false);
    assert.throws(() => assertUsTenantLegalDocumentsReady(config), UsTenantLegalDocumentsPendingError);
    assert.throws(() => usPrivacyPolicy(config), UsTenantLegalDocumentsPendingError);
    assert.throws(() => usTermsOfService(config), UsTenantLegalDocumentsPendingError);
    const preflight = checkPublish(config, 'basic');
    assert.equal(preflight.ok, false);
    assert.ok(preflight.blockers.some((item) => /pending counsel review/iu.test(item)));
  });

  test('new-site issuance pins en-US without mutating a stored legacy config', () => {
    const legacy = emptySiteConfig('Stored legacy config');
    assert.equal(legacy.meta.locale, undefined);
    const issued = pinUsTenantLocaleForNewSite(legacy);
    assert.equal(legacy.meta.locale, undefined);
    assert.equal(issued.meta.locale, 'en-US');
    assert.throws(() => assertUsTenantLegalDocumentsReady({
      ...issued,
      businessInfo: BUSINESS_INFO,
    }), UsTenantLegalDocumentsPendingError);
  });

  test('aggregate measurement disclosure is operational copy, not a tenant legal document', () => {
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.heading, /Anonymous performance measurement/u);
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.excluded, /patient information/u);
    assert.match(ANONYMOUS_SITE_EVENT_DISCLOSURE.legalReview, /Pending final legal review/u);
  });

  test('Anaks Labs marketing privacy renders the equivalent aggregate-reporting boundaries in English', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    assert.match(html, /PHI-free measurement/u);
    assert.match(html, /aggregate page views and completed action categories/u);
    assert.match(html, /patient information, form contents, raw IP addresses, raw user-agent strings, and raw referrers/iu);
  });

  test('only a config with a form is classified as collecting visitor input', () => {
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
  });
});

describe('M2 — 외부 AI 처리 위탁 고지', () => {
  test('Anaks Labs discloses Google and Anthropic processing without exposing credentials', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    assert.match(html, /Google or Anthropic service/u);
    assert.match(html, /do not send passwords or payment credentials/u);
    assert.match(html, /pending final legal review/u);
  });
});

describe('CRAWL W4 — 지정 공개 페이지 처리 고지', () => {
  test('the fixed privacy page discloses designated-page limits, bearer measurement retention, and image rights', () => {
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    assert.match(html, /Designated public pages/u);
    assert.match(html, /do not bypass authentication or explicit robots exclusions/u);
    assert.match(html, /retained for up to 90 days/u);
    assert.match(html, /Image publication remains gated on the applicable rights and compliance review/u);
  });
});
