import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import FaqPage, { metadata as faqMetadata } from '@/app/(marketing)/faq/page';
import sitemap from '@/app/sitemap';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';
import { CREDIT_COSTS, CREDIT_EXPIRY_DAYS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const faqSource = read('src/app/(marketing)/faq/page.tsx');
const headerSource = read('src/components/marketing/MarketingHeader.tsx');
const footerHtml = renderToStaticMarkup(createElement(MarketingFooter));
const faq = parse(renderToStaticMarkup(createElement(FaqPage)));
const structured = JSON.parse(faq.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as {
  mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
};

function visibleFaq() {
  return faq.querySelectorAll('details').map((details) => ({
    name: details.querySelector('summary span')?.textContent.trim() ?? '',
    text: details.querySelector(':scope > div')?.textContent.trim() ?? '',
  }));
}

describe('FAQ$ 자주 묻는 질문 강화', () => {
  test('헤더의 단일 내비 소스가 데스크톱과 모바일에 FAQ를 제공하고 푸터도 같은 라벨을 쓴다', () => {
    assert.match(headerSource, /\{ href: '\/faq', label: '자주 묻는 질문' \}/);
    assert.equal(headerSource.match(/NAV\.map/g)?.length, 2, '데스크톱·모바일이 같은 NAV를 소비해야 합니다.');
    assert.match(headerSource, /id="marketing-mobile-nav"/);
    assert.match(headerSource, /aria-expanded=\{mobileOpen\}/);
    const footer = parse(footerHtml);
    assert.equal(footer.querySelectorAll('a[href="/faq"]').length, 1);
    assert.equal(footer.querySelector('a[href="/faq"]')?.textContent.trim(), '자주 묻는 질문');
    assert.match(read('src/app/globals.css'), /\.daboim-marketing \.mkt-type-control\s*\{[^}]*white-space:\s*nowrap;/);
  });

  test('/faq canonical과 sitemap 직접 경로가 이미 명시돼 있다', () => {
    assert.equal(faqMetadata.alternates?.canonical, '/faq');
    assert.equal(sitemap().some((entry) => new URL(entry.url).pathname === '/faq'), true);
  });

  test('SEO·AEO·GEO 답변은 3~5문장에 쉬운 정의·실제 작업·사장님 효익을 함께 담는다', () => {
    const requirements = {
      'SEO가 뭔가요?': [/검색 최적화/, /제목과 설명/, /구조화 데이터/, /사이트맵/, /사장님/],
      'AEO가 뭔가요?': [/답변 최적화/, /질문과 답 콘텐츠/, /FAQ 구조화 데이터/, /사장님/],
      'GEO가 뭔가요?': [/AI 검색 최적화/, /공식 채널/, /구조화 데이터/, /사장님/],
    } as const;
    const visible = visibleFaq();
    for (const [question, patterns] of Object.entries(requirements)) {
      const answer = visible.find((item) => item.name === question)?.text ?? '';
      const sentences = answer.split(/(?<=\.)\s+/u).filter(Boolean);
      assert.ok(sentences.length >= 3 && sentences.length <= 5, `${question}: ${sentences.length}문장`);
      for (const pattern of patterns) assert.match(answer, pattern, `${question}: ${pattern} 누락`);
      assert.doesNotMatch(answer, /보장합니다|반드시 노출|1위/u);
    }
  });

  test('보장 질문은 결정 주체를 밝히고 구조·콘텐츠·정보 일치·숫자 확인으로 설득한다', () => {
    const answer = visibleFaq().find((item) => item.name === '검색 순위나 AI 답변 노출을 보장하나요?')?.text ?? '';
    for (const copy of [
      '누구도 보장할 수 없습니다',
      '가능성을 구조적으로 높이는',
      '질문에 바로 답하는 콘텐츠',
      '공식 정보의 일치',
      '매달 성과 리포트',
    ]) assert.ok(answer.includes(copy), copy);
    assert.doesNotMatch(answer, /노출을 보장합니다|순위를 보장합니다/u);
  });

  test('/faq의 모든 화면 답변과 FAQ JSON-LD는 같은 문자열이다', () => {
    const visible = visibleFaq();
    assert.equal(faqSource.includes('plain:'), false);
    assert.deepEqual(
      structured.mainEntity.map((item) => ({ name: item.name, text: item.acceptedAnswer.text })),
      visible,
    );
  });

  test('무제한 직접 수정과 크레딧 재생성을 실제 가격 계약에서 조립해 세 마케팅 페이지가 공유한다', () => {
    for (const copy of [
      '문구를 고치고, 사진을 교체하고, 배치를 바꾸는 직접 수정',
      `이미지 재생성 ${CREDIT_COSTS.image}크레딧`,
      `구성 변경 ${CREDIT_COSTS.structure}크레딧`,
      `영상 재생성 ${CREDIT_COSTS.video}크레딧`,
      `매월 ${PRICING.subscription.creditsPerMonth}크레딧`,
      `${CREDIT_EXPIRY_DAYS.subscription_grant}일간 유효`,
    ]) assert.ok(CREDIT_CONTRACT_COPY.includes(copy), copy);

    for (const path of [
      'src/app/(marketing)/page.tsx',
      'src/app/(marketing)/features/page.tsx',
      'src/app/(marketing)/pricing/page.tsx',
    ]) {
      const source = read(path);
      assert.match(source, /@\/lib\/credits\/contract-copy/);
      assert.match(source, /CREDIT_CONTRACT_COPY/);
      assert.doesNotMatch(source, /이미지 재생성 1크레딧|구성 변경 2크레딧|영상 재생성 3크레딧/u);
    }
    assert.equal(visibleFaq().some((item) => item.name === '무제한 수정과 크레딧은 뭐가 다른가요?' && item.text === CREDIT_CONTRACT_COPY), true);
  });
});
