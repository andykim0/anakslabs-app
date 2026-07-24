import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import FaqPage from '@/app/(marketing)/faq/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import PricingPage from '@/app/(marketing)/pricing/page';
import {
  AccountSiteLimitError,
  assertAccountCanCreateSite,
  SITE_LIMIT_ERROR_CODE,
  SITE_LIMIT_MESSAGE,
} from '@/lib/billing/site-limit';
import { MULTI_SITE_FAQ_ANSWER, SITE_PRICE_UNIT_COPY } from '@/lib/pricing';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('BILL$ one payment equals one site', () => {
  test('an account with one site cannot create a second site at the storage boundary', () => {
    const clientId = 'client-with-one-site';
    assert.throws(
      () => assertAccountCanCreateSite([{ clientId }], clientId),
      (error) => error instanceof AccountSiteLimitError
        && error.code === SITE_LIMIT_ERROR_CODE
        && error.message === SITE_LIMIT_MESSAGE,
    );
    const mockRepository = read('src/lib/data/mock/services.ts');
    assert.match(mockRepository, /assertAccountCanCreateSite\(\[\.\.\.store\.sites\.values\(\)\], input\.clientId\);/);
    assert.ok(
      mockRepository.indexOf('assertAccountCanCreateSite(') < mockRepository.indexOf('store.sites.set(site.id, site)'),
      'the second-site guard must run before the mock insert',
    );
  });

  test('generation route recovers an idempotent retry before the explicit no-cost site limit guard', () => {
    const source = read('src/app/api/onboarding/generate/route.ts');
    const dedupe = source.indexOf('recentGenerations.get(idemK)');
    const guard = source.indexOf('accountHasSite(await sites.listByClient(client.id)');
    const assetPolicy = source.indexOf('assetProvenanceConfig()');
    const standardBuild = source.indexOf('buildZeroCostSiteConfig(');
    assert.ok(dedupe >= 0 && dedupe < guard, 'same generation retry must return its first site');
    assert.ok(
      guard >= 0 && guard < assetPolicy && guard < standardBuild,
      'second-site guard must run before the deterministic build',
    );
    assert.equal(
      source.match(/apiError\(409, SITE_LIMIT_ERROR_CODE, SITE_LIMIT_MESSAGE\)/g)?.length,
      2,
      'early guard and concurrent-insert guard must share one response contract',
    );

    const migration = read('../supabase/migrations/0039_one_site_per_client.sql');
    assert.match(migration, /unique index if not exists sites_one_per_client_uidx/);
    assert.match(migration, /on public\.sites \(client_id\)/);
  });

  test('pricing, features and the Kmong copy use the one-site price unit notice', () => {
    assert.equal(SITE_PRICE_UNIT_COPY, '모든 가격은 홈페이지 1개 기준입니다.');
    for (const Page of [PricingPage, FeaturesPage]) {
      const html = parse(renderToStaticMarkup(createElement(Page)));
      const notices = html.querySelectorAll('[data-site-price-unit]');
      assert.ok(notices.length >= 1);
      assert.equal(notices.every((notice) => notice.textContent.trim() === SITE_PRICE_UNIT_COPY), true);
    }
    const kmong = read('docs/kmong-product-copy.md');
    assert.match(kmong, new RegExp(SITE_PRICE_UNIT_COPY));
    assert.match(kmong, /SITE_PRICE_UNIT_COPY/);
    assert.match(read('../docs/legal/terms-draft.md'), /법률검토 A-1 추가 요청.*요금은 사이트 1개 단위/);
  });

  test('the two-homepage FAQ uses one string for visible HTML and JSON-LD', () => {
    assert.equal(
      MULTI_SITE_FAQ_ANSWER,
      '가능합니다. 홈페이지마다 월 구독이 각각 적용됩니다. 두 번째 홈페이지는 문의 주시면 안내해 드립니다.',
    );
    const html = parse(renderToStaticMarkup(createElement(FaqPage)));
    const visible = html.querySelectorAll('details').map((details) => ({
      question: details.querySelector('summary span')?.textContent.trim(),
      answer: details.querySelector(':scope > div')?.textContent.trim(),
    })).find((item) => item.question === '홈페이지를 2개 만들 수 있나요?');
    assert.deepEqual(visible, {
      question: '홈페이지를 2개 만들 수 있나요?',
      answer: MULTI_SITE_FAQ_ANSWER,
    });
    const json = JSON.parse(
      html.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    ) as { mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> };
    const structured = json.mainEntity?.find((item) => item.name === visible?.question);
    assert.equal(structured?.acceptedAnswer.text, MULTI_SITE_FAQ_ANSWER);
  });
});
