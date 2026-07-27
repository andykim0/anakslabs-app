import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import MarketingPrivacyPage from '@/app/(marketing)/privacy/page';
import { US_DEMO_VIEW_DISCLOSURE } from '@/lib/legal/templates';
import {
  DEMO_VIEW_HEARTBEAT_MS,
  clampDemoViewTelemetry,
  type DemoViewClientPayload,
} from './view-tracking-contract';

const ROOT = process.cwd();
const MIGRATION = readFileSync(
  join(ROOT, '../supabase/migrations/0050_us_demo_views.sql'),
  'utf8',
);

interface ServerTrackingModule {
  createDemoQaCookieValue(now?: Date): string;
  isDemoQaCookieValue(value: string | undefined, now?: Date): boolean;
  hashDemoViewIdentity(input: {
    slug: string;
    clientVisitorId?: string;
    clientSessionId?: string;
    fallbackSessionSeed?: string;
    ip: string;
    userAgent: string;
  }): {
    visitorId: string;
    sessionId: string;
    ipHash: string;
    hashKeyVersion: number;
  };
  storedDemoViewInput(input: {
    previewId: string;
    payload: DemoViewClientPayload;
    request: Request;
    now?: Date;
  }): { openedAt: string };
}

async function loadServerTracking(): Promise<ServerTrackingModule> {
  const directory = mkdtempSync(join(tmpdir(), 'daboim-us-demo-p4-'));
  const outfile = join(directory, 'view-tracking-server.mjs');
  try {
    execFileSync(join(ROOT, 'node_modules/.bin/esbuild'), [
      'src/lib/us-demo/view-tracking-server.ts',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--conditions=default',
      '--alias:server-only=./scripts/_empty-server-only.ts',
      `--outfile=${outfile}`,
    ], { cwd: ROOT, stdio: 'pipe' });
    return await import(`${pathToFileURL(outfile).href}?p4=${Date.now()}`) as ServerTrackingModule;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function payload(overrides: Partial<DemoViewClientPayload> = {}): DemoViewClientPayload {
  return {
    slug: '11111111-1111-4111-8111-111111111111',
    eventId: '22222222-2222-4222-8222-222222222222',
    visitorId: '33333333-3333-4333-8333-333333333333',
    sessionId: '44444444-4444-4444-8444-444444444444',
    openedAt: '2026-07-27T00:00:00.000Z',
    localHour: 9,
    timezone: 'America/Los_Angeles',
    activeSeconds: 121,
    maxScrollPct: 82,
    sections: [{ id: 'structure-diff', activeSeconds: 31 }],
    clicks: { 'structure:compare': 1 },
    referrer: { class: 'email', origin: 'https://mail.example/path?secret=1' },
    isMobile: true,
    final: false,
    ...overrides,
  };
}

describe('US-DEMO P4 — first-party private-demo view ledger', () => {
  test('0050은 site_events와 분리된 service-role 전용 30일 원장·멱등 알림을 만든다', () => {
    assert.match(MIGRATION, /create table public\.demo_views/u);
    assert.match(MIGRATION, /create table public\.demo_view_alerts/u);
    assert.match(MIGRATION, /create index demo_views_slug_opened_idx[\s\S]*slug, opened_at desc/u);
    assert.match(MIGRATION, /create index demo_views_visitor_idx[\s\S]*visitor_id/u);
    assert.match(MIGRATION, /alter table public\.demo_views enable row level security/u);
    assert.match(MIGRATION, /revoke all on table public\.demo_views[\s\S]*public, anon, authenticated, service_role/u);
    assert.match(MIGRATION, /grant select, insert, update, delete on table public\.demo_views[\s\S]*service_role/u);
    assert.match(MIGRATION, /unique \(preview_id, visitor_id, session_id, signal_kind\)/u);
    assert.match(MIGRATION, /signal_kind in \('strong_reinterest_48h'\)/u);
    assert.match(MIGRATION, /p_hours_since_last|v_hours_since_last < 48/u);
    assert.match(MIGRATION, /received_at < p_before/u);
    assert.match(MIGRATION, /interval '30 days'/u);
    assert.doesNotMatch(MIGRATION, /create table public\.site_events|alter table public\.site_events/u);
    assert.doesNotMatch(MIGRATION, /\b(raw_ip|ip_address|user_agent|raw_referrer|token)\b/iu);
    assert.doesNotMatch(
      MIGRATION.split('\n').filter((line) => line.trimStart().startsWith('--')).join('\n'),
      /\$/u,
    );
    assert.doesNotMatch(MIGRATION, /\bif\b[^\n]*\bcase\b/iu);
  });

  test('서버 clamp는 경로가 있는 리퍼러를 origin만 남기고 수치·구간·클릭을 제한한다', () => {
    const result = clampDemoViewTelemetry(payload({
      activeSeconds: 99_999,
      maxScrollPct: 999,
      sections: [
        { id: 'safe-section', activeSeconds: 99_999 },
        { id: 'unsafe path', activeSeconds: 3 },
      ],
      clicks: { 'safe:click': 999, 'https://secret.example/path': 3 },
    }));
    assert.equal(result.activeSeconds, 7_200);
    assert.equal(result.maxScrollPct, 100);
    assert.deepEqual(result.sections, [{ id: 'safe-section', activeSeconds: 7_200 }]);
    assert.deepEqual(result.clicks, { 'safe:click': 100 });
    assert.deepEqual(result.referrer, { class: 'email', origin: 'https://mail.example' });
  });

  test('버전드 HMAC과 QA 쿠키는 결정적이며 원문 IP·UA·브라우저 식별자를 남기지 않는다', async () => {
    const server = await loadServerTracking();
    const identity = server.hashDemoViewIdentity({
      slug: payload().slug,
      clientVisitorId: payload().visitorId,
      clientSessionId: payload().sessionId,
      ip: '203.0.113.9',
      userAgent: 'Example Browser 1.0',
    });
    const repeated = server.hashDemoViewIdentity({
      slug: payload().slug,
      clientVisitorId: payload().visitorId,
      clientSessionId: payload().sessionId,
      ip: '203.0.113.9',
      userAgent: 'Example Browser 1.0',
    });
    assert.deepEqual(identity, repeated);
    assert.match(identity.ipHash, /^[0-9a-f]{64}$/u);
    assert.match(identity.visitorId, /^[0-9a-f]{64}$/u);
    assert.match(identity.sessionId, /^[0-9a-f]{64}$/u);
    assert.doesNotMatch(JSON.stringify(identity), /203\.0\.113\.9|Example Browser|33333333/u);

    const issuedAt = new Date('2026-07-27T00:00:00.000Z');
    const cookie = server.createDemoQaCookieValue(issuedAt);
    assert.equal(server.isDemoQaCookieValue(cookie, new Date('2026-07-27T01:00:00.000Z')), true);
    assert.equal(server.isDemoQaCookieValue(cookie, new Date('2026-07-27T03:00:00.000Z')), false);
    assert.equal(server.isDemoQaCookieValue(`${cookie}tampered`, issuedAt), false);
  });

  test('서버 수신 시각은 과거 24시간·미래 5분 범위로 제한한다', async () => {
    const server = await loadServerTracking();
    const now = new Date('2026-07-27T12:00:00.000Z');
    const stored = server.storedDemoViewInput({
      previewId: payload().slug,
      payload: payload({ openedAt: '2020-01-01T00:00:00.000Z' }),
      request: new Request('https://example.test/api/demo-track', {
        headers: {
          'user-agent': 'Example Browser 1.0',
          'x-forwarded-for': '203.0.113.9',
        },
      }),
      now,
    });
    assert.equal(stored.openedAt, '2026-07-26T12:00:00.000Z');
  });

  test('런타임은 20초 heartbeat·종료 sendBeacon·내부 QA/봇 선차단·제3자 스크립트 0을 고정한다', () => {
    const tracker = readFileSync(join(ROOT, 'src/components/us-demo/DemoViewTracker.tsx'), 'utf8');
    const ingest = readFileSync(join(ROOT, 'src/app/api/demo-track/route.ts'), 'utf8');
    const preview = readFileSync(
      join(ROOT, 'src/app/preview/[token]/[[...path]]/page.tsx'),
      'utf8',
    );
    assert.equal(DEMO_VIEW_HEARTBEAT_MS, 20_000);
    assert.match(tracker, /setInterval\(\(\) => transmit\(false\), DEMO_VIEW_HEARTBEAT_MS\)/u);
    assert.match(tracker, /visibilitychange/u);
    assert.match(tracker, /pagehide/u);
    assert.match(tracker, /navigator\.sendBeacon\('\/api\/demo-track'/u);
    assert.doesNotMatch(tracker, /google-analytics|googletagmanager|segment|mixpanel|amplitude/iu);
    assert.match(ingest, /isLikelyBotUserAgent[\s\S]*return accepted\(\)/u);
    assert.match(ingest, /isDemoQaCookieValue[\s\S]*return accepted\(\)/u);
    assert.match(ingest, /isInternalDemoIpHash[\s\S]*return accepted\(\)/u);
    assert.match(preview, /!internalQa \? <DemoViewTracker/u);
    assert.doesNotMatch(ingest, /console\.(?:log|warn|error)\([^)]*(?:userAgent|forwarded|requestIp)/u);
  });

  test('개인정보 예외 초안은 기존 익명 집계와 구분해 HMAC·30일·PHI 0·법무 확인을 고지한다', () => {
    const document = [
      US_DEMO_VIEW_DISCLOSURE.collected,
      US_DEMO_VIEW_DISCLOSURE.purpose,
      US_DEMO_VIEW_DISCLOSURE.excluded,
      US_DEMO_VIEW_DISCLOSURE.retention,
      US_DEMO_VIEW_DISCLOSURE.legalReview,
    ].join(' ');
    assert.match(document, /HMAC-SHA-256/u);
    assert.match(document, /30일/u);
    assert.match(document, /환자 정보/u);
    assert.match(document, /법무/u);
    const html = renderToStaticMarkup(createElement(MarketingPrivacyPage));
    assert.match(html, /미국 병원 비공개 데모 열람 측정 예외/u);
    assert.match(html, /공유·구매를 확정하지 않습니다/u);
  });
});
