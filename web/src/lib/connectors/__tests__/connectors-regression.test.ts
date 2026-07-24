import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import {
  SITE_FORM_SUCCESS_EVENT,
  buildSiteBeaconRuntime,
  classifySiteClick,
} from '@/lib/analytics/site-beacon';
import { getMockStore, resetMockStore } from '@/lib/data/mock/store';
import { MockSiteEventsRepo } from '@/lib/data/mock/site-events';
import { HWARODAM_SITE_ID } from '@/lib/data/mock/seed';
import { buildMonthlyReportEmail } from '@/lib/reporting/email';
import { buildMonthlyPerformanceReport } from '@/lib/reporting/monthly-report';
import type { KstMonthRange } from '@/lib/reporting/types';
import { emptySiteConfig } from '@/lib/types/site';
import { applyConnectorManifest } from '../application';
import type { ExtraFeatureSelection, SurveyInput } from '@/lib/types/domain';

const LEGACY_CONNECTORLESS_HTML_SHA256 =
  '97447bc8e24c3d0ad605ffcc76234fc64b8fc8e8df5f359a93fa3a50d3cf7771';

const root = process.cwd();
const source = (relative: string) => readFileSync(`${root}/${relative}`, 'utf8');

const JULY_2026: KstMonthRange = {
  month: '2026-07',
  startDate: '2026-07-01',
  endExclusiveDate: '2026-08-01',
  startIso: '2026-06-30T15:00:00.000Z',
  endExclusiveIso: '2026-07-31T15:00:00.000Z',
};
const JUNE_2026: KstMonthRange = {
  month: '2026-06',
  startDate: '2026-06-01',
  endExclusiveDate: '2026-07-01',
  startIso: '2026-05-31T15:00:00.000Z',
  endExclusiveIso: '2026-06-30T15:00:00.000Z',
};

function connectorSurvey(): SurveyInput {
  return {
    businessName: '온결 인테리어',
    purposeId: 'company_brand',
    purpose: '회사 소개',
    industry: '인테리어',
    tone: ['차분한'],
    colorPreference: '#174DDA',
    referenceImageUrls: [],
    sectionPlan: [],
    pagePlan: [{ slug: '', title: '홈' }],
    templateId: 'company_brand.default',
    contentDepth: {
      version: 2,
      facts: [
        { key: 'phone', value: '02-1234-5678', source: 'customer' },
        { key: 'address', value: '서울특별시 성동구 연무장길 1', source: 'customer' },
      ],
      faqAnswers: [],
      imports: [],
      mainStorytelling: { version: 1 },
      surveyBrief: {
        version: 1,
        conversionDestination: {
          kind: 'messenger_url',
          url: 'https://pf.kakao.com/_ongyeol',
        },
      },
    },
  };
}

function connectorExtras(): ExtraFeatureSelection {
  return {
    connectorCatalogVersion: 1,
    reservationLink: {
      url: 'https://booking.naver.com/booking/6/bizes/12345',
    },
    snsLinks: [
      { kind: 'kakao_channel', url: 'https://pf.kakao.com/_ongyeol' },
      { kind: 'instagram', url: 'https://www.instagram.com/ongyeol.interior/' },
    ],
  };
}

describe('CONN C4 — connector, tracking, and reporting round trip', () => {
  test('real connector hrefs become idempotent aggregates and report v2 customer metrics', async () => {
    resetMockStore();
    const repo = new MockSiteEventsRepo();
    const config = applyConnectorManifest(
      {
        ...emptySiteConfig('온결 인테리어'),
        publicContact: {
          version: 1,
          phone: '02-1234-5678',
          address: '서울특별시 성동구 연무장길 1',
        },
      },
      connectorSurvey(),
      connectorExtras(),
    );
    assert.equal(config.connectors?.items.length, 5);

    for (const [index, connector] of (config.connectors?.items ?? []).entries()) {
      const eventType = classifySiteClick(connector.href, 'https://ongyeol.example/');
      assert.ok(eventType, connector.id);
      const eventId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
      const input = {
        siteId: HWARODAM_SITE_ID,
        eventType,
        source: 'direct' as const,
        eventDate: '2026-07-24',
        eventId,
      };
      await repo.increment(input);
      await repo.increment(input);
    }
    await repo.increment({
      siteId: HWARODAM_SITE_ID,
      eventType: 'form',
      source: 'direct',
      eventDate: '2026-07-24',
      eventId: '00000000-0000-4000-8000-000000000099',
    });

    const rows = await repo.listBySiteRange({
      siteId: HWARODAM_SITE_ID,
      fromDate: JULY_2026.startDate,
      toDate: JULY_2026.endExclusiveDate,
    });
    assert.deepEqual(
      Object.fromEntries(rows.map((row) => [row.eventType, row.count])),
      {
        chat: 1,
        directions: 1,
        form: 1,
        instagram: 1,
        reserve: 1,
        tel: 1,
      },
    );
    assert.equal(getMockStore().siteEventReceipts?.size, 6);

    const report = buildMonthlyPerformanceReport({
      siteId: HWARODAM_SITE_ID,
      period: JULY_2026,
      comparisonPeriod: JUNE_2026,
      current: rows,
      previous: [],
    });
    assert.equal(report.schemaVersion, 2);
    assert.equal(report.metrics.consultationActions.current, 2);
    assert.equal(report.metrics.phoneClicks.current, 1);
    assert.equal(report.metrics.directionsClicks.current, 1);
    assert.equal(report.metrics.instagramClicks.current, 1);
    const email = buildMonthlyReportEmail({
      siteName: '온결 인테리어',
      dashboardUrl: 'https://daboim.com/dashboard/reports',
      report,
    });
    assert.match(email.text, /상담 행동: 2건/);
    assert.match(email.text, /카카오 상담 클릭 1건/);
    assert.doesNotMatch(email.text, /상담 완료/);
  });

  test('first HTML is native and static; every heavy integration waits for interaction or visibility', () => {
    const config = applyConnectorManifest(
      {
        ...emptySiteConfig('온결 인테리어'),
        publicContact: {
          version: 1,
          phone: '02-1234-5678',
          address: '서울특별시 성동구 연무장길 1',
        },
      },
      connectorSurvey(),
      connectorExtras(),
    );
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'auto',
      siteId: HWARODAM_SITE_ID,
      interactive: true,
      animate: false,
    }));
    const dom = parse(html);
    assert.equal(dom.querySelectorAll('.anaks-connector').length, 5);
    assert.equal(dom.querySelectorAll('iframe').length, 0);
    assert.equal(dom.querySelectorAll('script[src]').length, 0);
    assert.equal(dom.querySelectorAll('img[src^="http"]').length, 0);
    assert.ok(dom.querySelector('a[href^="https://map.naver.com/"]'));
    const instagram = dom.querySelector('a[href^="https://www.instagram.com/"]');
    assert.ok(instagram);
    assert.equal(instagram.getAttribute('target'), '_blank');
    assert.equal(instagram.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(dom.querySelectorAll('[data-instagram-feed-endpoint]').length, 0);

    const runtime = source('src/components/site-renderer/ConnectorRuntime.tsx');
    assert.match(runtime, /script\.async = true/u);
    assert.match(runtime, /script\.defer = true/u);
    assert.doesNotMatch(runtime, /IntersectionObserver|instagram|fetch\(/iu);
    assert.doesNotMatch(runtime, /document\.write|<iframe/iu);
  });

  test('only successful forms are counted and internal anchors never become conversion events', () => {
    const runtime = buildSiteBeaconRuntime({
      siteId: 'published-site',
      endpoint: 'https://daboim.com/api/site-events',
    });
    assert.match(runtime, new RegExp(SITE_FORM_SUCCESS_EVENT));
    assert.doesNotMatch(runtime, /addEventListener\(['"]submit/iu);
    assert.equal(classifySiteClick('#contact', 'https://example.com/'), null);
    assert.equal(classifySiteClick('/about', 'https://example.com/'), null);
  });

  test('connectorless published HTML remains byte-identical', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: emptySiteConfig('기존 발행 사이트'),
      mode: 'auto',
      interactive: true,
      animate: false,
    }));
    assert.equal(
      createHash('sha256').update(html).digest('hex'),
      LEGACY_CONNECTORLESS_HTML_SHA256,
    );
  });
});
