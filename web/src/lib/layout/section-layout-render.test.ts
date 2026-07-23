import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionCanvas } from '@/components/site-renderer/SectionCanvas';
import { SiteRenderer } from '@/components/site-renderer/SiteRenderer';
import { buildSiteConfigFromSurvey } from '@/lib/data/site-templates';
import { emptySiteConfig } from '@/lib/types/site';
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';

const theme = emptySiteConfig('LIB2').theme;
const candidate: DesignCandidate = {
  id: 'lib2-section-layout',
  label: 'LIB2',
  style: 'photo',
  heroImageUrl: '/mock/hero.svg',
  theme,
  description: '',
};

function survey(): SurveyInput {
  return {
    businessName: '온담',
    purposeId: 'local_store',
    purpose: '가게 소개',
    industry: '카페',
    tone: ['차분한'],
    colorPreference: '시스템 추천',
    referenceImageUrls: [],
    highlights: ['천천히 고르는 메뉴', '편안한 안내', '정돈된 경험'],
    sectionPlan: [
      { type: 'hero', name: '첫 화면', brief: '', source: 'template', pageSlug: '' },
    ],
    pagePlan: [{ slug: '', title: '홈' }],
    templateId: 'local_store.default',
    contentItems: [
      { name: '필터 커피', description: '고객이 적은 원두 안내' },
      { name: '온담 라테', description: '고객이 적은 라테 안내' },
      { name: '계절 타르트', description: '고객이 적은 디저트 안내' },
    ],
    storePhotoUrls: ['/customer/a.webp', '/customer/b.webp', '/customer/c.webp'],
    storePhotoAssetRefs: [
      { assetId: 'photo-a', url: '/customer/a.webp' },
      { assetId: 'photo-b', url: '/customer/b.webp' },
      { assetId: 'photo-c', url: '/customer/c.webp' },
    ],
    generalAssetAttestationId: 'attestation-lib2',
    contentDepth: {
      version: 1,
      imports: [],
      facts: [],
      faqAnswers: [],
      mainStorytelling: {
        version: 1,
        brandStory: '온담은 천천히 고르는 시간을 소중하게 생각합니다.',
        origin: '고객이 직접 적은 시작의 계기입니다.',
        philosophy: '메뉴를 고르는 순간부터 편안한 흐름을 지향합니다.',
      },
    },
  } as SurveyInput;
}

function build() {
  return buildSiteConfigFromSurvey(survey(), candidate, {
    heroImageUrl: '/mock/hero.svg',
    imagePool: [],
    sectionLayoutVariantIds: {
      features: 'features.numbered-list',
      about: 'about.fullbleed-overlay',
      gallery: 'gallery.carousel',
    },
  });
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('LIB2 M3a — 기존 렌더 경계의 섹션 projection 소비', () => {
  test('실제 MAIN 빌더의 about·features·gallery가 저장된 3밴드 projection을 받는다', () => {
    const config = build();
    const sections = config.pages.flatMap((page) => page.sections);
    const about = sections.find((section) => section.id === 'sec-about');
    const features = sections.find((section) => section.id === 'sec-features');
    const gallery = sections.find((section) => section.id === 'sec-gallery');
    assert.equal(about?.sectionLayout?.resolvedId, 'about.fullbleed-overlay');
    assert.equal(features?.sectionLayout?.resolvedId, 'features.numbered-list');
    assert.equal(gallery?.sectionLayout?.resolvedId, 'gallery.carousel');
    assert.ok(gallery?.sectionLayout?.fallbackBands);
    assert.deepEqual(Object.keys(gallery!.sectionLayout!.bands), ['wide', 'compact', 'mobile']);
  });

  test('carousel SSR은 전체 사진 정적 그리드이며 기존 runtime만 향상 마커를 소비한다', () => {
    const html = renderToStaticMarkup(createElement(SiteRenderer, {
      config: build(),
      mode: 'auto',
      interactive: false,
      animate: true,
    }));
    assert.match(html, /data-section-layout-carousel="true"/u);
    assert.doesNotMatch(html, /<section[^>]+data-layout-carousel-enhanced/u);
    for (const src of ['/customer/a.webp', '/customer/b.webp', '/customer/c.webp']) {
      assert.match(html, new RegExp(src.replaceAll('/', '\\/'), 'u'));
    }
    assert.match(html, /data-carousel-step="-1"/u);
    assert.match(html, /data-carousel-step="1"/u);
  });

  test('저장된 sectionLayout은 rollout 플래그와 무관하게 같은 HTML로 렌더된다', () => {
    const config = build();
    const previous = process.env.LAYOUT_VARIANTS_ENABLED;
    try {
      process.env.LAYOUT_VARIANTS_ENABLED = '1';
      const on = renderToStaticMarkup(createElement(SiteRenderer, { config, mode: 'auto' }));
      process.env.LAYOUT_VARIANTS_ENABLED = '0';
      const off = renderToStaticMarkup(createElement(SiteRenderer, { config, mode: 'auto' }));
      assert.equal(sha(on), sha(off));
    } finally {
      if (previous === undefined) delete process.env.LAYOUT_VARIANTS_ENABLED;
      else process.env.LAYOUT_VARIANTS_ENABLED = previous;
    }
  });

  test('신규 figure 히어로는 시스템 추상을 패널에 넣지 않고 무미디어 흐름으로 접힌다', () => {
    const systemCandidate = { ...candidate, heroPresentation: 'system' as const };
    const config = buildSiteConfigFromSurvey(survey(), systemCandidate, {
      heroImageUrl: '/mock/hero.svg',
      imagePool: [],
      heroLayoutVariantId: 'hero.split-left',
    });
    const hero = config.pages[0].sections.find((section) => section.type === 'hero')!;
    assert.equal(hero.heroLayout?.mediaSlotRole, 'referential-figure');
    assert.equal(hero.heroLayout?.mediaKind, 'none');
    assert.equal(hero.heroLayout?.bands.wide.mediaFrame, undefined);
    const html = renderToStaticMarkup(createElement(SectionCanvas, {
      section: hero,
      theme,
      proceduralHero: true,
    }));
    assert.doesNotMatch(html, /data-site-cine-procedural-hero/u);
  });
});
