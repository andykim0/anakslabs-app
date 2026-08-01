import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'node-html-parser';
import FaqPage from '@/app/(marketing)/faq/page';
import FeaturesPage from '@/app/(marketing)/features/page';
import { connectFaqHashOpener } from '@/components/marketing/FaqHashOpener';
import {
  formatKrw,
  PRICING,
  PUBLISH_PAYMENT_COPY,
  SUBSCRIPTION_BENEFIT_COPY,
} from '@/lib/pricing';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const implementationSource = (directory: string): string => readdirSync(join(ROOT, directory), { withFileTypes: true })
  .filter((entry) => entry.name !== '__tests__')
  .flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return implementationSource(relative);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [read(relative)] : [];
  })
  .join('\n');
const featuresSource = read('src/app/(marketing)/features/page.tsx');
const reportSource = read('src/components/marketing/MonthlyReportPreview.tsx');
const motionSource = read('src/components/marketing/PricingMotionComparison.tsx');
const marketingCopySource = [
  implementationSource('src/app/(marketing)'),
  implementationSource('src/components/marketing'),
].join('\n');
const featuresHtml = renderToStaticMarkup(createElement(FeaturesPage));
const faqHtml = renderToStaticMarkup(createElement(FaqPage));
const features = parse(featuresHtml);
const faq = parse(faqHtml);

describe('FT$ /features 전면 재구성 통합 회귀', () => {
  test('T1 서사는 제작부터 검색 등록·성과 증명·선택 영상·CTA까지 한 흐름이다', () => {
    assert.deepEqual(
      features.querySelectorAll('[data-features-section]').map((section) =>
        section.getAttribute('data-features-section')),
      ['website', 'discovery', 'registration', 'report', 'motion', 'cta'],
    );
    assert.match(features.textContent, /홈페이지는 기본입니다/);
    assert.equal(features.querySelector('a[href="/cases"]')?.textContent.trim(), '직접 보세요');
    assert.match(featuresSource, /<SiteExampleMockup/);
    assert.match(featuresSource, /<EditorMockup/);
    assert.doesNotMatch(featuresSource, /<GuaranteeBadge|data-features-section="guarantee"/);
    assert.equal(features.querySelector('a[href="/guarantee"]'), null);
  });

  test('T2 세 장은 쉬운 시나리오를 먼저 말하고 질문형 FAQ 앵커로 연결한다', () => {
    const discovery = features.querySelector('[data-features-section="discovery"]');
    assert.ok(discovery);
    assert.deepEqual(
      discovery.querySelectorAll('article').map((card) => ({
        lead: card.querySelector('h3')?.textContent.trim(),
        badge: card.querySelector('span')?.textContent.trim(),
        question: card.querySelector('a')?.textContent.trim(),
        href: card.querySelector('a')?.getAttribute('href'),
      })),
      [
        {
          lead: '손님이 네이버에 ‘근처 ○○’를 검색할 때 사장님 가게가 나오기 쉬운 구조로 만듭니다.',
          badge: 'SEO',
          question: 'SEO가 뭔가요?',
          href: '/faq#seo',
        },
        {
          lead: '“주차 되나요?” 같은 질문에 검색이 홈페이지의 답을 보여주기 쉽게 정리합니다.',
          badge: 'AEO',
          question: 'AEO가 뭔가요?',
          href: '/faq#aeo',
        },
        {
          lead: '요즘 손님은 AI에게 물어봅니다. AI가 사장님 가게를 인용할 공식 근거를 만듭니다.',
          badge: 'GEO',
          question: 'GEO가 뭔가요?',
          href: '/faq#geo',
        },
      ],
    );
    assert.match(discovery.textContent, /검색 순위나 AI 답변 노출을 보장하는 말이 아닙니다/);
    assert.doesNotMatch(marketingCopySource, /나오게\s*만듭니다|검색이[^\n.]*대신\s*답하게\s*합니다/u);
  });

  test('FAQ 딥링크는 실재하고 화면 질문·답변과 FAQ JSON-LD가 정확히 일치한다', () => {
    const deepLinks = features.querySelectorAll('a[href^="/faq#"]');
    assert.deepEqual(deepLinks.map((link) => link.getAttribute('href')), ['/faq#seo', '/faq#aeo', '/faq#geo']);
    for (const link of deepLinks) {
      const id = link.getAttribute('href')?.split('#')[1];
      assert.ok(id && faq.querySelector(`#${id}`), `FAQ 앵커 누락: ${id}`);
    }

    const visible = faq.querySelectorAll('details').map((details) => ({
      id: details.getAttribute('id'),
      name: details.querySelector('summary span')?.textContent.trim(),
      text: details.querySelector(':scope > div')?.textContent.trim(),
    }));
    const script = faq.querySelector('script[type="application/ld+json"]');
    assert.ok(script);
    const jsonLd = JSON.parse(script.textContent) as {
      '@type': string;
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    assert.equal(jsonLd['@type'], 'FAQPage');
    assert.deepEqual(
      jsonLd.mainEntity.map((item) => item.name),
      visible.map((item) => item.name),
    );
    assert.deepEqual(
      jsonLd.mainEntity.filter((item) => /^(?:SEO|AEO|GEO)가 뭔가요\?$/.test(item.name)).map((item) => item.name),
      ['SEO가 뭔가요?', 'AEO가 뭔가요?', 'GEO가 뭔가요?'],
    );
    for (const id of ['seo', 'aeo', 'geo']) {
      const visibleItem = visible.find((item) => item.id === id);
      const structuredItem = jsonLd.mainEntity.find((item) => item.name === visibleItem?.name);
      assert.ok(visibleItem && structuredItem);
      assert.equal(structuredItem.acceptedAnswer.text, visibleItem.text, `${id} 화면과 JSON-LD 답변 불일치`);
    }
  });

  test('FAQ 해시 opener는 첫 진입과 hashchange 모두 대상 details를 펼치고 해제한다', () => {
    const details = new Map([
      ['seo', { tagName: 'DETAILS', open: false }],
      ['aeo', { tagName: 'DETAILS', open: false }],
    ]);
    let hash = '#seo';
    let emitHashChange = () => {};
    let subscriptionRegistered = false;
    let disconnected = false;
    const disconnect = connectFaqHashOpener({
      readHash: () => hash,
      lookup: (id) => (details.get(id) ?? null) as HTMLElement | null,
      subscribe: (listener) => {
        emitHashChange = listener;
        subscriptionRegistered = true;
        return () => { disconnected = true; };
      },
    });

    assert.equal(details.get('seo')?.open, true, '하드 로드에 해당하는 첫 연결에서 열려야 합니다.');
    hash = '#aeo';
    assert.equal(subscriptionRegistered, true);
    emitHashChange();
    assert.equal(details.get('aeo')?.open, true, '해시 변경 대상도 열려야 합니다.');
    disconnect();
    assert.equal(disconnected, true);
  });

  test('T3 리포트는 실제 집계 항목만 쓰고 모든 가상 수치를 예시로 고지한다', () => {
    const report = features.querySelector('[data-report-preview]');
    assert.ok(report);
    for (const copy of [
      '예시 · 실제 고객 데이터 아님',
      '페이지 조회',
      '전화 클릭',
      '예약 클릭',
      '길찾기 클릭',
      '네이버',
      '구글',
      '인스타그램',
      '위 숫자는 화면 설명을 위한 가상 예시입니다.',
    ]) {
      assert.ok(report.textContent.includes(copy), `리포트 필수 카피 누락: ${copy}`);
    }
    assert.match(report.textContent, /고유한 사람 수가 아니라 홈페이지 페이지가 열린 횟수/);
    assert.doesNotMatch(report.textContent, /실제 고객 성과|실제 데이터/u);
    assert.match(reportSource, /data-report-preview/);
    const pageviews = Number(report.querySelector('[data-report-metric="pageviews"]')?.getAttribute('data-report-count'));
    const sources = report.querySelectorAll('[data-report-source]');
    assert.equal(
      sources.reduce((sum, source) => sum + Number(source.getAttribute('data-report-count')), 0),
      pageviews,
    );
    assert.equal(
      sources.reduce((sum, source) => sum + Number(source.getAttribute('data-report-share')), 0),
      100,
    );
  });

  test('베이직 유지비·운영·셀프 편집·영상 포함 계약은 단일 소스만 소비한다', () => {
    assert.match(featuresSource, /formatKrw\(PRICING\.subscription\.amountKrw\)/);
    assert.match(featuresSource, /PUBLISH_PAYMENT_COPY\.term/);
    assert.match(featuresSource, /SUBSCRIPTION_BENEFIT_COPY\.operations/);
    assert.match(featuresSource, /SUBSCRIPTION_BENEFIT_COPY\.selfEdit/);
    assert.match(featuresSource, /SUBSCRIPTION_BENEFIT_COPY\.videoHero/);
    assert.doesNotMatch(featuresSource, /CREDIT_CONTRACT_COPY|videoHeroAddon|(?:790[,_]?000|200[,_]?000|79만원|20만원)/u);
    assert.ok(featuresHtml.includes(formatKrw(PRICING.subscription.amountKrw)));
    assert.ok(featuresHtml.includes(PUBLISH_PAYMENT_COPY.term));
    assert.ok(featuresHtml.includes(SUBSCRIPTION_BENEFIT_COPY.operations));
    assert.ok(featuresHtml.includes(SUBSCRIPTION_BENEFIT_COPY.selfEdit));
    assert.ok(featuresHtml.includes(SUBSCRIPTION_BENEFIT_COPY.videoHero));
  });

  test('T4는 검증된 같은 장면 비교를 재사용하고 초기 HTML에서 영상을 내려받지 않는다', () => {
    assert.match(featuresSource, /<PricingMotionComparison \/>/);
    assert.match(motionSource, /const POSTER_SRC = '\/daboim-visibility-film-poster\.webp'/);
    const comparison = features.querySelector('[data-pricing-motion-comparison]');
    assert.ok(comparison);
    assert.equal(comparison.querySelectorAll('img').length, 2);
    assert.equal(
      comparison.querySelectorAll('img[width="1920"][height="1080"][loading="lazy"][decoding="async"]').length,
      2,
    );
    assert.equal(comparison.querySelectorAll('video').length, 0);
    assert.equal(features.querySelectorAll('script[src]').length, 0);
  });

  test('정적 HTML은 전 카피·유효 CTA를 보존하고 리드 전문용어·금지 표기를 노출하지 않는다', () => {
    for (const copy of [
      '홈페이지는 기본입니다.',
      '등록까지 저희가 대신합니다.',
      '매달 성과를 숫자로 보여드립니다.',
      '기본 움직임과 영상 첫 화면을 같은 장면으로 비교하세요.',
      '내 사이트 무료 진단',
    ]) {
      assert.ok(features.textContent.includes(copy), `정적 HTML 카피 누락: ${copy}`);
    }
    const jargon = /\b(?:SEO|AEO|GEO)\b|알고리즘|검색엔진|크롤러|스키마|구조화\s*데이터|시맨틱/iu;
    for (const section of features.querySelectorAll('section')) {
      const lead = section.querySelector('h1, h2, h3');
      if (lead) assert.doesNotMatch(lead.textContent, jargon);
    }
    assert.doesNotMatch(features.textContent, /\bVeo\b|슬라이드/iu);
    for (const action of features.querySelectorAll('a, button')) {
      assert.ok(action.textContent.trim().length >= 2, `고아 CTA 글자: ${action.textContent}`);
    }
  });
});
