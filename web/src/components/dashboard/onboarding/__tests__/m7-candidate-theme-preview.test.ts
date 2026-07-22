import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { heroVariantForSurvey, REFERENCE_GALLERY } from '@/lib/design/reference-gallery';
import { buildCandidatePreviewConfig } from '@/lib/onboarding/candidate-preview';
import { SiteRenderer } from '@/components/site-renderer';

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
    tagline: '검색에서 답이 되는 홈페이지',
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
    ...blueprint,
    heroImageUrl: HERO,
  }));
}

describe('M7 같은 사진, 다른 옷 후보 실렌더', () => {
  const input = survey();
  const candidates = actualCandidates(input);

  test('실제 후보 3안은 같은 사진·고객 콘텐츠를 production SiteRenderer에 입힌다', () => {
    for (const item of candidates) {
      const config = buildCandidatePreviewConfig(input, item, HERO);
      const html = renderToStaticMarkup(createElement(SiteRenderer, {
        config,
        mode: 'mobile',
        runtimeDelivery: 'client',
      }));
      assert.deepEqual(config.theme, item.theme);
      assert.equal(config.meta.title, '다보임 스튜디오 — SaaS · 서울');
      assert.match(html, new RegExp(`src="${HERO}"`));
      assert.match(html, /다보임 스튜디오/);
      assert.match(html, /검색에서 답이 되는 홈페이지/);
      assert.match(html, /class="anaks-site/);
    }
    assert.equal(candidates.length, 3);
    assert.equal(new Set(candidates.map((item) => item.theme.palette.primary)).size, 3);
  });

  test('레퍼런스 선택은 생성과 동일한 hero variant를 세 실렌더에 고정한다', () => {
    const reference = REFERENCE_GALLERY.find((item) => item.purpose === 'company_brand' && item.id.includes('-split-'))!;
    const pinnedInput = survey(reference.id);
    for (const item of actualCandidates(pinnedInput)) {
      const config = buildCandidatePreviewConfig(pinnedInput, item, HERO);
      const variant = heroVariantForSurvey(pinnedInput.referenceDesignId, pinnedInput.purposeId, item.id);
      const hero = config.pages[0]?.sections.find((section) => section.type === 'hero');
      const aligns = new Set(hero?.elements.flatMap((element) =>
        element.kind === 'text' && element.id.includes('hero-') && !element.id.includes('chip-label')
          ? [element.style.align]
          : []));
      assert.equal(variant, 'split');
      assert.deepEqual(aligns, new Set(['right']));
    }
  });

  test('후보 UI는 390px SitePreview를 재사용하고 중첩 버튼 없이 키보드 선택을 제공한다', () => {
    const step = read('src/components/dashboard/onboarding/candidate-step.tsx');
    const preview = read('src/components/dashboard/site-preview.tsx');
    assert.match(step, /<SitePreview[\s\S]*mode="mobile"[\s\S]*maxHeight=\{220\}/);
    assert.match(preview, /const MOBILE_PREVIEW_WIDTH = 390/);
    assert.match(step, /role="radiogroup"/);
    assert.match(step, /role="radio"/);
    assert.match(step, /event\.key !== 'Enter' && event\.key !== ' '/);
    assert.doesNotMatch(step, /CandidateThemePreview|@keyframes cand-/);
    assert.doesNotMatch(step, /@\/lib\/ai|gemini|generateImage|provider/iu);
  });

  test('긴 한글 상호도 실제 렌더러의 정적 HTML에 온전히 남는다', () => {
    const longName = '검색과 답변 엔진에서 고객에게 가장 먼저 발견되는 대한민국 대표 홈페이지 전문 최적화 스튜디오';
    const longInput = { ...input, businessName: longName };
    const item = actualCandidates(longInput)[2];
    const config = buildCandidatePreviewConfig(longInput, item, HERO);
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config,
      mode: 'mobile',
      runtimeDelivery: 'client',
    }));
    assert.match(html, new RegExp(longName));
  });
});
