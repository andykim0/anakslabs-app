import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, test } from 'node:test';
import TemplatesPage from '@/app/(marketing)/templates/page';
import sitemap from '@/app/sitemap';
import { buildZeroCostCandidates } from '@/lib/billing/prepublish-cost-policy';
import {
  pagePlanFromTemplate,
  planFromTemplate,
  resolveTemplate,
} from '@/lib/data/site-blueprints';
import type { SurveyInput } from '@/lib/types/domain';
import {
  INTERIOR_NAMED_TEMPLATE_CATALOG as NAMED_TEMPLATE_CATALOG,
} from '.';

const source = (path: string): string => readFileSync(join(process.cwd(), path), 'utf8');

function survey(
  industry = '건설·인테리어 시공',
  imageDirectionId: SurveyInput['imageDirectionId'] = 'abstract_editorial',
): SurveyInput {
  const template = resolveTemplate('company_brand', industry);
  return {
    businessName: '다온 공간',
    purposeId: 'company_brand',
    purpose: template.label,
    industry,
    tone: ['차분한'],
    colorPreference: '#7b6952',
    referenceImageUrls: [],
    sectionPlan: planFromTemplate(template),
    pagePlan: pagePlanFromTemplate(template),
    templateId: template.id,
    imageDirectionId,
    highlights: ['공간의 목적', '재료의 균형', '분명한 과정'],
    contentItems: [
      { name: '주거 공간 설계', description: '고객 입력 업무' },
      { name: '상업 공간 설계', description: '고객 입력 업무' },
      { name: '현장 관리', description: '고객 입력 업무' },
    ],
    contentDepth: {
      version: 2,
      facts: [{ key: 'phone', value: '02-1234-5678', source: 'customer' }],
      faqAnswers: [],
      imports: [],
      mainStorytelling: { version: 1, brandStory: '고객이 직접 입력한 이야기' },
      surveyBrief: {
        version: 1,
        conversionDestination: { kind: 'phone_fact' },
      },
    },
  } as SurveyInput;
}

describe('TPL T2 — 기존 후보 흐름의 공급원 교체', () => {
  test('인테리어 ON은 최대 6개 명명 핀을, 미지원 업종은 기존 3안을 낸다', async () => {
    const interior = await buildZeroCostCandidates(survey(), {
      templateGalleryEnabled: true,
    });
    const unsupported = await buildZeroCostCandidates(survey('B2B 제조업'), {
      templateGalleryEnabled: true,
    });
    assert.equal(interior.length, 6);
    assert.ok(interior.every((candidate) => candidate.namedTemplate));
    assert.equal(unsupported.length, 3);
    assert.ok(unsupported.every((candidate) => candidate.namedTemplate === undefined));
  });

  test('후보 API는 신규 요청만 catalog version으로 dedup하고 기존 site는 3안 경로를 유지한다', () => {
    const route = source('src/app/api/onboarding/candidates/route.ts');
    assert.match(route, /templateGalleryEnabled\(\) && !siteId/u);
    assert.match(route, /`templates-v\$\{NAMED_TEMPLATE_CATALOG_VERSION\}`/u);
    assert.match(route, /templateGalleryEnabled\(\) && !targetSiteId/u);
    assert.match(route, /items\.slice\(0, NAMED_TEMPLATE_RECOMMENDATION_MAX\)/u);
    assert.match(route, /items\.slice\(0, HERO_CANDIDATE_LIMIT\)/u);
  });

  test('ON 설문은 레거시 36장을 숨기고 색·무드·참고 URL만 추천 신호로 보존한다', () => {
    const page = source('src/app/(dashboard)/onboarding/page.tsx');
    const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
    const surveyStep = source('src/components/dashboard/onboarding/survey-step.tsx');
    const moodStep = source('src/components/dashboard/onboarding/steps/step06-mood-color.tsx');

    assert.match(page, /templateGalleryReady=\{templateGalleryEnabled\(\)\}/u);
    assert.match(wizard, /templateGalleryReady && !existingSiteId/u);
    assert.match(surveyStep, /referenceDesignId: namedTemplatesEnabled \? undefined/u);
    assert.match(moodStep, /!namedTemplatesEnabled \? \([\s\S]*ReferenceGalleryPicker/u);
    assert.match(moodStep, /<ReferenceSiteSection \/>/u);
    assert.match(moodStep, /REFERENCE_SAMPLES\.map/u);
    assert.match(moodStep, /colorOverride/u);
  });

  test('CandidateStep은 실제 N개 카피·실콘텐츠 SitePreview를 쓰고 별도 선택 단계를 만들지 않는다', () => {
    const candidate = source('src/components/dashboard/onboarding/candidate-step.tsx');
    const wizard = source('src/components/dashboard/onboarding/wizard.tsx');
    assert.match(candidate, /업종에 맞춰 고른 \$\{candidates\.length\}가지/u);
    assert.match(candidate, /namedTemplates \? 'sm:grid-cols-2 lg:grid-cols-3'/u);
    assert.match(candidate, /<SitePreview/u);
    assert.equal((wizard.match(/<CandidateStep/g) ?? []).length, 1);
    assert.doesNotMatch(wizard, /Template(?:Picker|Step|GalleryStep)/u);
  });

  test('템플릿 모션은 MotionChoice 초기값일 뿐 고객의 돌아온 선택이 최종 권위다', () => {
    const motion = source('src/components/dashboard/onboarding/motion-choice-step.tsx');
    const initialIndex = motion.indexOf('initial?.signatureId');
    const recommendedIndex = motion.indexOf('candidate.recommendedMotionSignatureId');
    const fallbackIndex = motion.indexOf('previewOptions[0]?.spec.id');
    assert.ok(initialIndex >= 0 && recommendedIndex > initialIndex && fallbackIndex > recommendedIndex);
    assert.match(motion, /previewOptions\.some\(\(\{ spec \}\) => spec\.id === recommendedId\)/u);
  });
});

describe('TPL T2 — 정적 마케팅 갤러리', () => {
  const html = renderToStaticMarkup(createElement(TemplatesPage));

  test('실제 배열 길이 24를 표시하고 20개 이상일 때만 수십 가지 카피를 쓴다', () => {
    assert.equal(NAMED_TEMPLATE_CATALOG.length, 24);
    assert.match(html, /수십 가지 중 인테리어 업종에 맞춘 24가지를/u);
    for (const template of NAMED_TEMPLATE_CATALOG) {
      assert.ok(html.includes(template.name), template.id);
      assert.ok(
        html.includes(template.previewImage)
          || html.includes(encodeURIComponent(template.previewImage)),
        template.previewImage,
      );
    }
  });

  test('페이지는 정적 썸네일만 지연 로드하고 런타임 SiteRenderer를 import하지 않는다', () => {
    const page = source('src/app/(marketing)/templates/page.tsx');
    assert.doesNotMatch(page, /SiteRenderer|SitePreview/u);
    assert.match(page, /loading="lazy"/u);
    assert.match(page, /NAMED_TEMPLATE_CATALOG\.map/u);
    assert.doesNotMatch(html, /슬라이드/u);
  });

  test('24개 checked-in WebP가 모두 존재하고 카드 geometry를 예약할 만큼 작다', () => {
    for (const template of NAMED_TEMPLATE_CATALOG) {
      const path = join(process.cwd(), 'public', template.previewImage.replace(/^\//u, ''));
      assert.equal(existsSync(path), true, path);
      assert.ok(statSync(path).size <= 20 * 1024, `${template.id}: ${statSync(path).size}`);
    }
  });

  test('헤더·푸터·sitemap이 /templates를 직접 노출한다', () => {
    assert.match(source('src/components/marketing/MarketingHeader.tsx'), /href: '\/templates'/u);
    assert.match(source('src/components/marketing/MarketingFooter.tsx'), /href: '\/templates'/u);
    assert.equal(
      sitemap().some((entry) => new URL(entry.url).pathname === '/templates'),
      true,
    );
  });
});
