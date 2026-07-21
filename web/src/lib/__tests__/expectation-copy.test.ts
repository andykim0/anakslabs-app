import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import { parse } from 'node-html-parser';
import FaqPage from '@/app/(marketing)/faq/page';
import { CREDIT_CONTRACT_COPY } from '@/lib/credits/contract-copy';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import {
  EDIT_REQUEST_SLA_COPY,
  FULFILLMENT_SLA,
  FULFILLMENT_SLA_BUSINESS_DAYS,
  SITE_BUILD_SLA_COPY,
  VIDEO_FULFILLMENT_COPY,
  VIDEO_FULFILLMENT_STATUS_LABELS,
} from '@/lib/fulfillment-sla';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('EXP — 고객 기대 관리 단일 소스', () => {
  test('제작·영상·수정 기간과 운영 경고 기준이 한 계약에 고정된다', () => {
    assert.deepEqual(FULFILLMENT_SLA, {
      siteBuild: { maxBusinessDays: 3 },
      videoApplication: { minBusinessDays: 1, maxBusinessDays: 2 },
      assistedEdit: { minBusinessDays: 1, maxBusinessDays: 2 },
    });
    assert.equal(FULFILLMENT_SLA_BUSINESS_DAYS, 2);
    assert.equal(SITE_BUILD_SLA_COPY, '홈페이지 제작은 영업일 3일 이내 완료됩니다.');
    assert.equal(EDIT_REQUEST_SLA_COPY, '수정 대행은 접수 후 영업일 1~2일 안에 처리됩니다.');
    assert.equal(
      VIDEO_FULFILLMENT_COPY,
      '주문 후 영업일 1~2일 안에 적용됩니다. 사장님이 고르신 연출 방향대로 다보임 AI가 만들고, 한 편씩 직접 검수해 가게 분위기에 맞는 것만 올립니다.',
    );
  });

  test('기간 숫자는 앱의 단일 소스 밖에 하드코딩되지 않는다', () => {
    const offenders = sourceFiles('src')
      .filter((path) => path !== 'src/lib/fulfillment-sla.ts' && !path.includes('/__tests__/'))
      .filter((path) => /영업일\s*(?:1~2|3)일|당일에서 수일/u.test(read(path)));
    assert.deepEqual(offenders, []);
  });

  test('마케팅·주문 확인·대시보드·수정 요청이 같은 고객 약속을 소비한다', () => {
    const required: Record<string, readonly string[]> = {
      'src/app/(marketing)/pricing/page.tsx': ['VIDEO_FULFILLMENT_COPY'],
      'src/app/(marketing)/features/page.tsx': ['VIDEO_FULFILLMENT_COPY'],
      'src/app/(marketing)/faq/page.tsx': ['SITE_BUILD_SLA_COPY', 'VIDEO_FULFILLMENT_COPY'],
      'src/components/dashboard/onboarding/generate-step.tsx': [
        'SITE_BUILD_SLA_COPY',
        'VIDEO_FULFILLMENT_COPY',
        'VIDEO_FULFILLMENT_STATUS_LABELS',
      ],
      'src/app/(dashboard)/dashboard/page.tsx': ['SITE_BUILD_SLA_COPY'],
      'src/components/dashboard/site-detail.tsx': [
        'VIDEO_FULFILLMENT_COPY',
        'VIDEO_FULFILLMENT_STATUS_LABELS',
      ],
      'src/components/dashboard/edit-request-form.tsx': ['EDIT_REQUEST_SLA_COPY'],
    };
    for (const [path, symbols] of Object.entries(required)) {
      const source = read(path);
      for (const symbol of symbols) assert.match(source, new RegExp(symbol), `${path}: ${symbol}`);
    }
  });

  test('영상 상태는 접수·검수·적용 순서이고 고객 화면에 즉시 생성 우회가 없다', () => {
    assert.deepEqual(VIDEO_FULFILLMENT_STATUS_LABELS, {
      received: '접수됨',
      reviewing: '검수 중',
      applied: '적용 완료',
    });
    const customerVideoUi = [
      read('src/components/dashboard/onboarding/generate-step.tsx'),
      read('src/components/dashboard/site-detail.tsx'),
    ].join('\n');
    assert.doesNotMatch(customerVideoUi, /processApprovedHeroVideo|generateHeroVideoDrafts|applyHeroVideoDraft/u);
    assert.doesNotMatch(
      customerVideoUi,
      /실제 영상을 1개 생성해 바로 적용|마음에 드는 시안을 고르면 바로 적용|다보임 AI 영상 생성을 시작해요/u,
    );
  });

  test('FAQ의 영상 답변은 화면과 JSON-LD에서 같은 단일 문자열이다', () => {
    const document = parse(renderToStaticMarkup(createElement(FaqPage)));
    const visible = document.querySelectorAll('details').map((details) => ({
      question: details.querySelector('summary span')?.textContent.trim() ?? '',
      answer: details.querySelector(':scope > div')?.textContent.trim() ?? '',
    }));
    const structured = JSON.parse(
      document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}',
    ) as { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> };
    const visibleVideo = visible.find((item) => item.question === '영상은 언제 적용되나요?');
    const structuredVideo = structured.mainEntity.find((item) => item.name === '영상은 언제 적용되나요?');
    assert.equal(visibleVideo?.answer, VIDEO_FULFILLMENT_COPY);
    assert.equal(structuredVideo?.acceptedAnswer.text, VIDEO_FULFILLMENT_COPY);
  });

  test('크레딧 안내에 누락됐던 문구 재생성 비용이 실제 상수로 조립된다', () => {
    assert.match(CREDIT_CONTRACT_COPY, new RegExp(`문구 재생성 ${CREDIT_COSTS.text}크레딧`));
  });

  test('크몽 문안은 앱의 세 기간 약속과 일치하고 단일 소스를 명시한다', () => {
    const kmong = read('docs/kmong-product-copy.md');
    for (const copy of [SITE_BUILD_SLA_COPY, EDIT_REQUEST_SLA_COPY, VIDEO_FULFILLMENT_COPY]) {
      assert.ok(kmong.includes(copy), copy);
    }
    assert.match(kmong, /web\/src\/lib\/fulfillment-sla\.ts/);
  });
});
