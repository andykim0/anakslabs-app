import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { runInNewContext } from 'node:vm';
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
import { isRecognizedReservationUrl } from '@/lib/analytics/trackable-actions';
import { isRecognizedChatUrl } from '@/lib/analytics/trackable-actions';

async function executeBeaconClicks(
  runtime: string,
  hrefs: readonly string[],
  pageHref = 'https://clinic.example.com/',
): Promise<string[]> {
  const listeners = new Map<string, (event: unknown) => void>();
  const events: string[] = [];
  const document = {
    referrer: '',
    readyState: 'complete',
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, listener);
    },
  };
  const fetch = (_endpoint: string, init: { body?: string }) => {
    events.push(JSON.parse(String(init.body)).event as string);
    return Promise.resolve({ ok: true });
  };
  runInNewContext(runtime, {
    Blob,
    URL,
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000000' },
    document,
    fetch,
    location: new URL(pageHref),
    navigator: { sendBeacon: () => false },
    setTimeout,
  });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const click = listeners.get('click');
  assert.ok(click, 'click listener must be installed after DOM readiness');
  for (const href of hrefs) {
    click({
      target: {
        closest: () => ({ getAttribute: (name: string) => (name === 'href' ? href : null) }),
      },
    });
  }
  await Promise.resolve();
  return events;
}

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

  test('실제 전환 종착점을 결정적으로 분류하고 일반 링크는 버린다', () => {
    const base = 'https://shop.example.com/menu';
    assert.equal(classifySiteClick('tel:02-1234-5678', base), 'tel');
    assert.equal(classifySiteClick('https://booking.naver.com/booking/6/bizes/1', base), 'reserve');
    assert.equal(classifySiteClick('https://m.place.naver.com/restaurant/1/booking', base), 'reserve');
    assert.equal(classifySiteClick('https://pf.kakao.com/_channel', base), 'chat');
    assert.equal(classifySiteClick('https://pf.kakao.com/_channel/chat', base), 'chat');
    assert.equal(classifySiteClick('https://www.instagram.com/interior_studio/', base), 'instagram');
    assert.equal(classifySiteClick('https://map.naver.com/p/directions/1', base), 'directions');
    assert.equal(classifySiteClick('https://www.google.co.kr/maps/dir/a/b', base), 'directions');
    assert.equal(classifySiteClick('/about', base), null);
    assert.equal(classifySiteClick('#sec-contact', base), null);
    assert.equal(classifySiteClick('mailto:hello@example.com', base), null);
    assert.equal(isRecognizedReservationUrl('https://booking.naver.com/booking/6/bizes/1'), true);
    assert.equal(isRecognizedReservationUrl('https://m.place.naver.com/restaurant/1/booking'), true);
    assert.equal(isRecognizedReservationUrl('http://booking.naver.com/booking/1'), false, '신규 CTA는 HTTPS만');
    assert.equal(isRecognizedReservationUrl('https://example.com/booking.naver.com'), false);
    assert.equal(isRecognizedReservationUrl('https://pf.kakao.com/_channel'), false);
    assert.equal(isRecognizedChatUrl('https://pf.kakao.com/_channel'), true);
    assert.equal(isRecognizedChatUrl('https://example.com/_channel'), false);
  });

  test('runtime은 2KB 이하이고 DOM 이후·sendBeacon 우선·keepalive fallback 계약을 지킨다', () => {
    const runtime = buildSiteBeaconRuntime({
      siteId: '2f9c0aa0-08e7-4ce5-a0b0-123456789abc',
      endpoint: 'https://anakslabs.com/api/site-events',
    });
    assert.ok(Buffer.byteLength(runtime, 'utf8') <= SITE_BEACON_MAX_BYTES);
    assert.match(
      runtime,
      /d\.readyState==='complete'\?setTimeout\(i,0\):d\.addEventListener\('DOMContentLoaded',i,\{once:true\}\)/,
    );
    assert.doesNotMatch(runtime, /readyState==='loading'/);
    assert.match(runtime, /sendBeacon/);
    assert.match(runtime, /keepalive:true/);
    assert.match(runtime, /credentials:'omit'/);
    assert.match(runtime, /addEventListener\('click',c,true\)/);
    assert.doesNotMatch(runtime, /data-daboim-action/, '행동 이름 속성을 실제 외부 클릭으로 신뢰하면 안 됨');
    assert.ok(runtime.includes(SITE_FORM_SUCCESS_EVENT));
    assert.doesNotMatch(runtime, /cookie|localStorage|sessionStorage|userAgent|performance|preventDefault|gtag|GoogleAnalyticsObject/i);
    assert.match(runtime, /randomUUID/);
    assert.match(runtime, /v\.eventId=k/);
    assert.doesNotMatch(runtime, /localStorage|sessionStorage|visitorId|sessionId/);
  });

  test('KR runtime은 기존 호스팅·Export 바이트와 SHA를 그대로 유지한다', () => {
    const siteId = '2f9c0aa0-08e7-4ce5-a0b0-123456789abc';
    const hosted = buildSiteBeaconRuntime({ siteId, endpoint: '/api/site-events' });
    const exported = buildSiteBeaconRuntime({
      siteId,
      endpoint: 'https://anakslabs.com/api/site-events',
    });
    assert.deepEqual(
      {
        bytes: Buffer.byteLength(hosted, 'utf8'),
        sha256: createHash('sha256').update(hosted).digest('hex'),
      },
      {
        bytes: 1_915,
        sha256: '35bd1027006085ae4e989a20a3df71f12791e5e1331136278dbbd5a6c91bf9e1',
      },
    );
    assert.deepEqual(
      {
        bytes: Buffer.byteLength(exported, 'utf8'),
        sha256: createHash('sha256').update(exported).digest('hex'),
      },
      {
        bytes: 1_936,
        sha256: '62b5f2b609e32ebcf4cc86dc7a0689cd5bccf43b0a1ff27fcdd93b5c32ae324e',
      },
    );
  });

  test('US runtime은 선언된 booking 경계만 reserve로 세고 내부 링크·앵커를 버린다', async () => {
    const runtime = buildSiteBeaconRuntime({
      siteId: 'us_clinic',
      locale: 'en-US',
      bookingHref: 'https://booking.example.com/appointments?declared=ignored',
    });
    const events = await executeBeaconClicks(runtime, [
      'https://booking.example.com/appointments?campaign=summer',
      'https://booking.example.com/appointments/provider/7',
      'https://booking.example.com/appointments-other',
      'https://other.example.com/appointments',
      'tel:+13105550199',
      '/appointments',
      '#contact',
    ]);
    assert.deepEqual(events, ['pageview', 'reserve', 'reserve', 'tel']);
    assert.ok(Buffer.byteLength(runtime, 'utf8') <= SITE_BEACON_MAX_BYTES);
    assert.doesNotMatch(runtime, /booking\.naver|place\.naver|pf\.kakao|map\.naver|map\.kakao/u);
  });

  test('US runtime은 booking 선언이 없어도 tel·Google directions·Instagram만 정상 계상한다', async () => {
    const runtime = buildSiteBeaconRuntime({ siteId: 'us_without_booking', locale: 'en-US' });
    assert.deepEqual(
      await executeBeaconClicks(runtime, [
        'tel:+13105550199',
        'https://maps.google.com/?q=Los+Angeles',
        'https://maps.app.goo.gl/example',
        'https://instagram.com/example-clinic',
        'https://booking.naver.com/booking/1',
      ]),
      ['pageview', 'tel', 'directions', 'directions', 'instagram'],
    );
  });

  test('US booking 자체 origin과 root·200자 초과 선언은 매칭만 비활성하고 렌더는 유지한다', async () => {
    const sameOrigin = buildSiteBeaconRuntime({
      siteId: 'same_origin',
      locale: 'en-US',
      bookingHref: 'https://clinic.example.com/appointments',
    });
    assert.deepEqual(
      await executeBeaconClicks(sameOrigin, ['/appointments', '#contact']),
      ['pageview'],
    );

    const root = buildSiteBeaconRuntime({
      siteId: 'root_booking',
      locale: 'en-US',
      bookingHref: 'https://booking.example.com/',
    });
    assert.deepEqual(
      await executeBeaconClicks(root, ['https://booking.example.com/anything']),
      ['pageview'],
    );

    const origin = 'https://booking.example.com';
    const maxLength = `${origin}/${'a'.repeat(200 - origin.length - 1)}`;
    assert.equal(`${new URL(maxLength).origin}${new URL(maxLength).pathname}`.length, 200);
    for (const endpoint of ['/api/site-events', 'https://anakslabs.com/api/site-events']) {
      const atLimit = buildSiteBeaconRuntime({
        siteId: '2f9c0aa0-08e7-4ce5-a0b0-123456789abc',
        endpoint,
        locale: 'en-US',
        bookingHref: maxLength,
      });
      assert.ok(Buffer.byteLength(atLimit, 'utf8') <= SITE_BEACON_MAX_BYTES);
      assert.deepEqual(await executeBeaconClicks(atLimit, [maxLength]), ['pageview', 'reserve']);
    }
    const acceptedInputCeiling = buildSiteBeaconRuntime({
      siteId: 's'.repeat(80),
      endpoint: 'https://anakslabs.com/api/site-events',
      locale: 'en-US',
      bookingHref: maxLength,
    });
    assert.ok(Buffer.byteLength(acceptedInputCeiling, 'utf8') <= SITE_BEACON_MAX_BYTES);

    const tooLong = `${maxLength}a`;
    assert.equal(`${new URL(tooLong).origin}${new URL(tooLong).pathname}`.length, 201);
    const oversizedTarget = buildSiteBeaconRuntime({
      siteId: 'long_booking',
      locale: 'en-US',
      bookingHref: tooLong,
    });
    assert.ok(Buffer.byteLength(oversizedTarget, 'utf8') <= SITE_BEACON_MAX_BYTES);
    assert.deepEqual(await executeBeaconClicks(oversizedTarget, [tooLong]), ['pageview']);
  });

  test('endpoint와 public site id를 fail-closed 검증하고 ZIP endpoint는 절대 URL이다', () => {
    assert.equal(absoluteSiteEventEndpoint('anakslabs.com'), 'https://anakslabs.com/api/site-events');
    assert.equal(absoluteSiteEventEndpoint('localhost:3000'), 'http://localhost:3000/api/site-events');
    assert.throws(() => absoluteSiteEventEndpoint(''));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: '<\/script>', endpoint: '/api/site-events' }));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: 'site_1', endpoint: 'javascript:alert(1)' }));
    assert.throws(() => buildSiteBeaconRuntime({ siteId: 'site_1', endpoint: '//evil.example/events' }));
    assert.throws(
      () => buildSiteBeaconRuntime({
        siteId: 'site_1',
        endpoint: `https://example.com/${'a'.repeat(SITE_BEACON_MAX_BYTES)}`,
      }),
      /SITE_BEACON_TOO_LARGE/,
    );
  });

  test('hosted renderer는 siteId와 고지 가능한 사업자 정보가 있을 때만 beacon을 한 번 방출한다', () => {
    const config = emptySiteConfig('집계 테스트');
    config.businessInfo = {
      isPersonal: true,
      ownerName: '테스트 운영자',
      phone: '02-0000-0000',
    };
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
    const undisclosed = structuredClone(config);
    delete undisclosed.businessInfo;
    const withoutDisclosure = renderToStaticMarkup(createElement(TenantPageContent, {
      config: undisclosed,
      pageSlug: '',
      siteId: 'legacy_site',
      interactive: true,
      animate: true,
    }));
    assert.equal((withBeacon.match(/data-daboim-site-beacon/g) ?? []).length, 1);
    assert.match(withBeacon, /<script type="module" data-daboim-site-beacon="1">/);
    assert.ok(withBeacon.includes('/api/site-events'));
    assert.doesNotMatch(withBeacon, /<script[^>]+src=/i);
    assert.doesNotMatch(withoutBeacon, /data-daboim-site-beacon/);
    assert.doesNotMatch(withoutDisclosure, /data-daboim-site-beacon/);

    const us = structuredClone(config);
    us.meta.locale = 'en-US';
    const usFailClosed = renderToStaticMarkup(createElement(TenantPageContent, {
      config: us,
      pageSlug: '',
      siteId: 'us_site',
      interactive: true,
      animate: true,
    }));
    assert.doesNotMatch(usFailClosed, /data-daboim-site-beacon/);
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
