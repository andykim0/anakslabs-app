/**
 * [v4 #3a] URL 추출기 — SSRF 가드(리터럴+DNS) + HTML 파싱 + 리다이렉트 재검사. (네트워크 주입)
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlockedIp,
  isBlockedIpv4,
  isBlockedIpv6,
  assertUrlAllowed,
  extractFromUrl,
  normalizeTelHref,
  stripShortcodes,
  ImportError,
  parseHtml,
  type LookupFn,
} from '@/lib/import/extract';

describe('SSRF — isBlockedIp', () => {
  test('IPv4 사설·루프백·링크로컬·CGNAT·멀티캐스트 차단', () => {
    for (const ip of ['10.0.0.1', '172.16.5.4', '172.31.9.9', '192.168.1.1', '127.0.0.1', '0.0.0.0', '169.254.1.1', '100.64.0.1', '224.0.0.1']) {
      assert.equal(isBlockedIpv4(ip), true, ip);
    }
  });
  test('IPv4 공인 허용', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '93.184.216.34']) {
      assert.equal(isBlockedIpv4(ip), false, ip);
    }
  });
  test('IPv6 루프백·유니크로컬·링크로컬·매핑 차단', () => {
    for (const ip of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:10.0.0.1']) {
      assert.equal(isBlockedIpv6(ip), true, ip);
    }
    assert.equal(isBlockedIpv6('2606:4700:4700::1111'), false);
    assert.equal(isBlockedIp('::1'), true);
    assert.equal(isBlockedIp('8.8.8.8'), false);
  });
});

const publicLookup: LookupFn = async () => [{ address: '93.184.216.34' }];
const privateLookup: LookupFn = async () => [{ address: '10.0.0.5' }];

describe('assertUrlAllowed', () => {
  test('http/https 아닌 스킴 거부', async () => {
    await assert.rejects(() => assertUrlAllowed('ftp://x/y', publicLookup), (e) => (e as ImportError).code === 'BLOCKED_SCHEME');
    await assert.rejects(() => assertUrlAllowed('file:///etc/passwd', publicLookup), (e) => (e as ImportError).code === 'BLOCKED_SCHEME');
  });
  test('IP 리터럴이 사설이면 거부(DNS 조회 없이)', async () => {
    await assert.rejects(() => assertUrlAllowed('http://127.0.0.1/x', publicLookup), (e) => (e as ImportError).code === 'BLOCKED_HOST');
    await assert.rejects(() => assertUrlAllowed('http://169.254.169.254/latest', publicLookup), (e) => (e as ImportError).code === 'BLOCKED_HOST');
  });
  test('호스트가 사설 IP로 resolve되면 거부(DNS rebinding 방어)', async () => {
    await assert.rejects(() => assertUrlAllowed('https://evil.example.com/', privateLookup), (e) => (e as ImportError).code === 'BLOCKED_HOST');
  });
  test('공인 IP로 resolve되면 허용', async () => {
    const u = await assertUrlAllowed('https://example.com/path', publicLookup);
    assert.equal(u.hostname, 'example.com');
  });
});

// 가짜 Response (body:null → text() 경로)
function fakeRes(opts: { status?: number; headers?: Record<string, string>; body?: string }): Response {
  const status = opts.status ?? 200;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(opts.headers ?? {}),
    body: null,
    text: async () => opts.body ?? '',
    arrayBuffer: async () => new TextEncoder().encode(opts.body ?? '').buffer,
  } as unknown as Response;
}

describe('parseHtml', () => {
  test('title/desc/headings/text/이미지 추출 + 아이콘·svg 제외', () => {
    const html = `<html><head><title>가게 이름</title>
      <meta property="og:description" content="맛있는 카페">
      <meta property="og:image" content="/photo/hero.jpg"></head>
      <body><h1>대표 메뉴</h1><h2>영업시간</h2><p>연희동 카페입니다.</p>
      <img src="/img/logo.png"><img src="/img/coffee.jpg"><img src="/vec/art.svg"></body></html>`;
    const r = parseHtml(html, 'https://cafe.example.com/');
    assert.equal(r.sourceUrl, 'https://cafe.example.com/');
    assert.equal(r.title, '가게 이름');
    assert.equal(r.description, '맛있는 카페');
    assert.ok(r.headings.includes('대표 메뉴') && r.headings.includes('영업시간'));
    assert.ok(r.text.includes('연희동 카페입니다.'));
    assert.ok(r.imageUrls.includes('https://cafe.example.com/photo/hero.jpg'), 'og:image');
    assert.ok(r.imageUrls.includes('https://cafe.example.com/img/coffee.jpg'), '콘텐츠 이미지');
    assert.ok(!r.imageUrls.some((u) => u.includes('logo')), '로고 제외');
    assert.ok(!r.imageUrls.some((u) => u.includes('.svg')), 'svg 제외');
  });

  test('JSON-LD와 가시 원문에서 사실 필드·메뉴를 창작 없이 구조화한다', () => {
    const html = `<html><head><title>원문 제목</title>
      <script type="application/ld+json">{
        "@type":"CafeOrCoffeeShop",
        "name":"연남 커피실",
        "telephone":"02-123-4567",
        "address":{"@type":"PostalAddress","streetAddress":"서울 마포구 동교로 1","addressLocality":"연남동"},
        "openingHours":["Mo-Fr 09:00-18:00"],
        "description":"천천히 머무는 동네 커피집"
      }</script></head><body>
      <h1>오늘의 메뉴</h1><p>필터 커피 6,000원</p><p>바닐라 라테 6,500원</p>
      </body></html>`;
    const result = parseHtml(html, 'https://cafe.example.com/about');
    assert.deepEqual(result.structured, {
      businessName: '연남 커피실',
      description: '천천히 머무는 동네 커피집',
      phone: '02-123-4567',
      address: '서울 마포구 동교로 1 연남동',
      openingHours: 'Mo-Fr 09:00-18:00',
      commercialPhrases: ['천천히 머무는 동네 커피집', '오늘의 메뉴'],
      contentItems: [
        { name: '필터 커피', price: '6,000' },
        { name: '바닐라 라테', price: '6,500' },
      ],
    });
  });

  test('원문에 없는 전화·주소·영업시간은 구조화 결과에도 만들지 않는다', () => {
    const result = parseHtml(
      '<html><head><title>이름만 있는 가게</title></head><body><p>편안한 공간을 지향합니다.</p></body></html>',
      'https://minimal.example.com/',
    );
    assert.equal(result.structured.businessName, '이름만 있는 가게');
    assert.equal(result.structured.phone, undefined);
    assert.equal(result.structured.address, undefined);
    assert.equal(result.structured.openingHours, undefined);
    assert.deepEqual(result.structured.contentItems, []);
  });
});

describe('extractFromUrl (fetch/lookup 주입)', () => {
  test('정상 HTML → 파싱', async () => {
    const fetchFn = (async () => fakeRes({ headers: { 'content-type': 'text/html' }, body: '<title>테스트</title><p>본문</p>' })) as unknown as typeof fetch;
    const r = await extractFromUrl('https://ok.example.com/', { fetchFn, lookupFn: publicLookup });
    assert.equal(r.title, '테스트');
  });
  test('non-HTML content-type 거부', async () => {
    const fetchFn = (async () => fakeRes({ headers: { 'content-type': 'application/json' }, body: '{}' })) as unknown as typeof fetch;
    await assert.rejects(() => extractFromUrl('https://ok.example.com/', { fetchFn, lookupFn: publicLookup }), (e) => (e as ImportError).code === 'NOT_HTML');
  });
  test('리다이렉트가 사설 호스트를 가리키면 매 hop 재검사로 차단', async () => {
    // 1홉: 공인 도메인이 302로 내부 IP로 리다이렉트 → 2홉 assertUrlAllowed에서 BLOCKED_HOST
    const fetchFn = (async (url: string) =>
      /internal/.test(url)
        ? fakeRes({ headers: { 'content-type': 'text/html' }, body: 'x' })
        : fakeRes({ status: 302, headers: { location: 'http://127.0.0.1/internal' } })) as unknown as typeof fetch;
    await assert.rejects(
      () => extractFromUrl('https://start.example.com/', { fetchFn, lookupFn: publicLookup }),
      (e) => (e as ImportError).code === 'BLOCKED_HOST',
    );
  });
  test('리다이렉트 3회 초과 차단', async () => {
    const fetchFn = (async () => fakeRes({ status: 302, headers: { location: 'https://next.example.com/' } })) as unknown as typeof fetch;
    await assert.rejects(
      () => extractFromUrl('https://loop.example.com/', { fetchFn, lookupFn: publicLookup, maxRedirects: 3 }),
      (e) => (e as ImportError).code === 'TOO_MANY_REDIRECTS',
    );
  });
});

test('tel: href 의 퍼센트 인코딩을 풀어서 전화번호로 쓴다', () => {
  // 클레임 카드에 `+1%20773-…` 이 그대로 찍히던 결함. href 는 URI 라 공백이
  // %20 으로 적히는데, 스킴만 떼고 디코딩하지 않으면 이스케이프가 화면에 남는다.
  assert.equal(normalizeTelHref('tel:+1%20773-555-0123'), '+1 773-555-0123');
  assert.equal(normalizeTelHref('TEL:%2B1%20312%20555%200198'), '+1 312 555 0198');
  // 이미 디코딩된 값은 그대로 통과한다(기존 저장 데이터 정규화 경로).
  assert.equal(normalizeTelHref('tel:+1 773-555-0123'), '+1 773-555-0123');
  // 깨진 이스케이프는 던지지 않고 원문으로 폴백한다 — 전화번호 하나로 import 를
  // 실패시키지 않는다.
  assert.equal(normalizeTelHref('tel:+1%ZZ773'), '+1%ZZ773');
  assert.equal(normalizeTelHref(undefined), undefined);
  assert.equal(normalizeTelHref('tel:'), undefined);
});

test('워드프레스 숏코드는 지우고 각주·치수 대괄호는 남긴다', () => {
  // 발행된 데모 본문에 `[wp_form id="8296"]` 이 그대로 찍힌 결함. 플러그인이
  // 렌더되지 않으면 숏코드는 평범한 텍스트 노드라 마크업 필터를 전부 통과한다.
  assert.equal(stripShortcodes('Book here [wp_form id="8296"] today'), 'Book here today');
  assert.equal(stripShortcodes('[contact-form-7 id="12" title="Contact"]'), '');
  assert.equal(stripShortcodes('[et_pb_section admin_label="x"]A[/et_pb_section]'), 'A');
  assert.equal(stripShortcodes('[vc_row][vc_column]B[/vc_column][/vc_row]'), 'B');
  assert.equal(stripShortcodes('[caption id="a" align="left"]Dr Lee[/caption]'), 'Dr Lee');

  // 실제 진료 카피에 나오는 대괄호는 살아남아야 한다 — 이름이 없거나(각주),
  // 공백이 없거나(치수), 알려진 플러그인이 아니면 건드리지 않는다.
  assert.equal(stripShortcodes('Implant success 98% [1]'), 'Implant success 98% [1]');
  assert.equal(stripShortcodes('A 10 [mm] post'), 'A 10 [mm] post');
  assert.equal(stripShortcodes('See figure [A-3]'), 'See figure [A-3]');
  assert.equal(stripShortcodes('no brackets at all'), 'no brackets at all');
  assert.equal(stripShortcodes(''), '');
});
