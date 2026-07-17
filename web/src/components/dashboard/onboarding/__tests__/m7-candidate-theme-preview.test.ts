import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { REFERENCE_GALLERY, heroVariantForSurvey } from '@/lib/design/reference-gallery';
import { CandidateThemePreview, candidateThemePreviewLayout } from '../CandidateThemePreview';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const HERO = '/customer/one-real-photo.webp';

function survey(referenceDesignId?: string): SurveyInput {
  return {
    businessName: '다보임 스튜디오',
    purposeId: 'company_brand',
    purpose: '회사·브랜드',
    industry: 'SaaS',
    region: '서울',
    tone: ['고급스러운', '모던한'],
    colorPreference: '네이비 블루',
    referenceImageUrls: [],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' },
      { type: 'about', name: '소개', brief: '', source: 'template' },
    ],
    templateId: 'company_brand.default',
    imageStyle: 'photo',
    ...(referenceDesignId ? { referenceDesignId } : {}),
  } as SurveyInput;
}

function actualCandidates(input: SurveyInput): DesignCandidate[] {
  return buildCandidateBlueprints(input).map((blueprint) => ({
    id: blueprint.id,
    label: blueprint.label,
    style: blueprint.style,
    heroImageUrl: HERO,
    description: blueprint.description,
    theme: blueprint.theme,
  }));
}

describe('M7 같은 사진, 다른 옷 후보 미니 히어로', () => {
  const input = survey();
  const candidates = actualCandidates(input);

  test('실제 후보 3안은 같은 사진 URL 위에 생성과 같은 copy anchor·palette·font를 렌더한다', () => {
    for (const item of candidates) {
      const variant = heroVariantForSurvey(input.referenceDesignId, input.purposeId, item.id);
      const expectedAlign = variant === 'centered' ? 'center' : variant === 'split' ? 'right' : 'left';
      const html = renderToStaticMarkup(
        createElement(CandidateThemePreview, {
          candidate: item,
          heroImageUrl: HERO,
          businessName: input.businessName,
          tagline: '검색에서 답이 되는 홈페이지',
          purposeId: input.purposeId,
          sectionPlan: input.sectionPlan,
          imageFailed: false,
          onImageError: () => {},
        }),
      );
      const config = buildSiteConfigFromSurvey(input, item, {
        heroImageUrl: HERO,
        imagePool: [HERO],
        heroVariant: variant,
      });
      const hero = config.pages[0].sections.find((section) => section.type === 'hero');
      const productionAligns = new Set(
        hero?.elements
          .filter((element) => element.kind === 'text' && element.id.includes('hero-') && !element.id.includes('chip-label'))
          .map((element) => element.kind === 'text' ? element.style.align : undefined),
      );
      assert.deepEqual(productionAligns, new Set([expectedAlign]));
      assert.match(html, new RegExp(`data-candidate-layout="${variant}"`));
      assert.match(html, new RegExp(`data-candidate-copy-align="${expectedAlign}"`));
      assert.match(html, new RegExp(`src="${HERO}"`));
      assert.ok(html.includes(item.theme.palette.background));
      assert.ok(html.includes(item.theme.fonts.heading.replaceAll("'", '&#x27;')) || html.includes(item.theme.fonts.heading));
      assert.match(html, /다보임 스튜디오/);
      assert.match(html, /검색에서 답이 되는 홈페이지/);
    }
    assert.equal(candidates.length, 3);
  });

  test('레퍼런스 선택 흐름은 실제 생성처럼 세 후보의 skeleton을 같은 variant로 고정한다', () => {
    const reference = REFERENCE_GALLERY.find((item) => item.purpose === 'company_brand' && item.id.includes('-split-'))!;
    const pinnedInput = survey(reference.id);
    const variants = actualCandidates(pinnedInput).map((item) =>
      candidateThemePreviewLayout(item.id, pinnedInput.purposeId, pinnedInput.referenceDesignId),
    );
    assert.deepEqual(new Set(variants), new Set(['split']));
  });

  test('이미지 실패 시에도 테마 표면·상호·태그라인·섹션 리듬이 남는다', () => {
    const html = renderToStaticMarkup(
      createElement(CandidateThemePreview, {
        candidate: candidates[0],
        heroImageUrl: HERO,
        businessName: '실패에도 남는 상호',
        tagline: '빈 흰 상자가 되지 않습니다',
        purposeId: 'company_brand',
        sectionPlan: [{ type: 'hero', name: '첫 화면', brief: '', required: true, source: 'template' }],
        imageFailed: true,
        onImageError: () => {},
      }),
    );
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /data-candidate-image-fallback/);
    assert.match(html, /실패에도 남는 상호/);
    assert.match(html, /빈 흰 상자가 되지 않습니다/);
    assert.match(html, /data-candidate-section-rhythm/);
  });

  test('후보 UI는 설명을 자르지 않고 생성·provider 계층을 import하지 않는다', () => {
    const step = read('src/components/dashboard/onboarding/candidate-step.tsx');
    const preview = read('src/components/dashboard/onboarding/CandidateThemePreview.tsx');
    assert.doesNotMatch(step, /line-clamp-2 text-xs leading-5 text-ob-muted/);
    assert.match(step, /heroImageUrl=\{heroImageUrl\}/);
    assert.match(step, /candidate=\{candidate\}/);
    assert.doesNotMatch(preview, /@\/lib\/ai|gemini|generateImage|generateCandidates|provider/i);
    assert.match(step, /motion-safe:group-hover:scale/);
    assert.match(step, /motion-reduce:transform-none/);
  });

  test('긴 한글 상호도 전체 SSR 텍스트를 보존하고 두 줄 안에서 충돌을 제한한다', () => {
    const longName = '검색과 답변 엔진에서 고객에게 가장 먼저 발견되는 대한민국 대표 홈페이지 전문 최적화 스튜디오';
    const html = renderToStaticMarkup(
      createElement(CandidateThemePreview, {
        candidate: candidates[2],
        heroImageUrl: HERO,
        businessName: longName,
        tagline: '긴 한국어 문구에서도 사진과 정보 리듬을 가리지 않도록 설계합니다.',
        purposeId: input.purposeId,
        sectionPlan: input.sectionPlan,
        imageFailed: false,
        onImageError: () => {},
      }),
    );
    assert.match(html, new RegExp(longName));
    assert.match(html, /line-clamp-2/);
  });
});
