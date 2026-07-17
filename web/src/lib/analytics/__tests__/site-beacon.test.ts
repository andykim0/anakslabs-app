import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SITE_BEACON_MAX_BYTES,
  SITE_FORM_SUCCESS_EVENT,
  absoluteSiteEventEndpoint,
  announceSuccessfulSiteForm,
  buildSiteBeaconRuntime,
  classifySiteClick,
  classifySiteReferrer,
} from '@/lib/analytics/site-beacon';
import { TenantPageContent } from '@/components/site-renderer/TenantPageContent';
import { emptySiteConfig } from '@/lib/types/site';

describe('RPT1 — aggregate-only first-party site beacon', () => {
  test('raw referrer는 브라우저에서 유한 source enum으로만 분류한다', () => {
    assert.equal(classifySiteReferrer('', 'shop.example.com'), 'direct');
    assert.equal(classifySiteReferrer('https://shop.example.com/menu', 'shop.example.com'), 'direct');
    assert.equal(classifySiteReferrer('https://search.naver.com/search.naver?query=x', 'shop.example.com'), 'naver');
    assert.equal(classifySiteReferrer('https://www.google.co.kr/search?q=x', 'shop.example.com'), 'google');
    assert.equal(classifySiteReferrer('https://l.instagram.com/?u=x', 'shop.example.com'), 'instagram');
    assert.equal(classifySiteReferrer('https://example.org/ref', 'shop.example.com'), 'other');
    assert.equal(classifySiteReferrer('not a url', 'shop.example.com'), 'other');
  });

  test('전화·예약·길찾기 링크만 결정적으로 분류하고 일반 링크는 버린다', () => {
    const base = 'https://shop.example.com/menu';
    assert.equal(classifySiteClick('tel:02-1234-5678', base), 'tel');
    assert.equal(classifySiteClick('https://booking.naver.com/booking/6/bizes/1', base), 'reserve');
    assert.equal(classifySiteClick('https://m.place.naver.com/restaurant/1/booking', base), 'reserve');
    assert.equal(classifySiteClick('https://pf.kakao.com/_channel', base), 'reserve');
    assert.equal(classifySiteClick('https://map.naver.com/p/directions/1', base), 'directions');
    assert.equal(classifySiteClick('https://www.google.co.kr/maps/dir/a/b', base), 'directions');
    assert.equal(classifySiteClick('/about', base), null);
    assert.equal(classifySiteClick('mailto:hello@example.com', base), null);
  });

  test('runtime은 2KB 이하이고 DOM 이후·sendBeacon 우선·keepalive fallback 계약을 지킨다', () => {
    const runtime = buildSiteBeaconRuntime({
      siteId: '2f9c0aa0-08e7-4ce5-a0b0-123456789abc',
      endpoint: 'https://anakslabs.com/api/site-events',
    });
    assert.ok(Buffer.byteLength(runtime, 'utf8') <= SITE_BEACON_MAX_BYTES);
    assert.match(runtime, /DOMContentLoaded/);
    assert.match(runtime, /sendBeacon/);
    assert.match(runtime, /keepalive:true/);
    assert.match(runtime, /credentials:'omit'/);
    assert.match(runtime, /addEventListener\('click',c,true\)/);
    assert.ok(runtime.includes(SITE_FORM_SUCCESS_EVENT));
    assert.doesNotMatch(runtime, /cookie|localStorage|sessionStorage|userAgent|performance|preventDefault|gtag|GoogleAnalyticsObject/i);
    assert.match(runtime, /JSON\.stringify\(\{siteId:I,event:e,source:S\}\)/);
  });

  test('endpoint와 public site id를 fail-closed 검증하고 ZIP endpoint는 절대 URL이다', () => {
    assert.equal(absoluteSiteEventEndpoint('anakslabs.com'), 'https://anakslabs.com/api/site-events');
    assert.equal(absoluteSiteEventEndpoint('localhost:3000'), 'http://localhost:3000/api/site-events');
    assert.throws(() => absoluteSiteEventEndpoint(''));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: '<\/script>', endpoint: '/api/site-events' }));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: 'site_1', endpoint: 'javascript:alert(1)' }));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: 'site_1', endpoint: '//evil.example/events' }));
  });

  test('hosted renderer는 siteId가 있을 때만 공용 inline beacon을 한 번 방출한다', () => {
    const config = emptySiteConfig('집계 테스트');
    const withBeacon = renderToStaticMarkup(createElement(TenantPageContent, {
      config,
      pageSlug: '',
      siteId: 'site_test',
      interactive: true,
      animate: true,
    }));
    const withoutBeacon = renderToStaticMarkup(createElement(TenantPageContent, {
      config,
      pageSlug: '',
      interactive: false,
      animate: false,
    }));
    assert.equal((withBeacon.match(/data-daboim-site-beacon/g) ?? []).length, 1);
    assert.match(withBeacon, /<script type="module" data-daboim-site-beacon="1">/);
    assert.ok(withBeacon.includes('/api/site-events'));
    assert.doesNotMatch(withBeacon, /<script[^>]+src=/i);
    assert.doesNotMatch(withoutBeacon, /data-daboim-site-beacon/);
  });

  test('성공 폼 seam은 detail 없는 단일 CustomEvent만 내보내고 실패를 전파하지 않는다', () => {
    const dispatched: Event[] = [];
    const target = {
      dispatchEvent(event: Event) {
        dispatched.push(event);
        return true;
      },
    };
    assert.equal(announceSuccessfulSiteForm(target), true);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0]?.type, SITE_FORM_SUCCESS_EVENT);
    assert.equal((dispatched[0] as CustomEvent).detail, null);
    assert.equal(announceSuccessfulSiteForm(undefined), false);
    assert.equal(announceSuccessfulSiteForm({ dispatchEvent: () => { throw new Error('listener'); } }), false);
  });

  test('static export도 공용 renderer에 절대 플랫폼 endpoint를 전달한다', () => {
    const exporter = readFileSync(new URL('../../export/exporter.ts', import.meta.url), 'utf8');
    const renderer = readFileSync(new URL('../../export/render-static.ts', import.meta.url), 'utf8');
    assert.match(exporter, /analyticsEndpoint:\s*absoluteSiteEventEndpoint\(ROOT_DOMAIN\)/);
    assert.match(renderer, /analyticsEndpoint:\s*opts\.analyticsEndpoint/);
  });
});
