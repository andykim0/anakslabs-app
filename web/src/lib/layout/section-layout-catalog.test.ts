import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';
import {
  ABOUT_LAYOUT_CATALOG,
  ABOUT_LAYOUT_VARIANT_IDS,
  FEATURE_LAYOUT_CATALOG,
  FEATURE_LAYOUT_VARIANT_IDS,
  GALLERY_LAYOUT_CATALOG,
  GALLERY_LAYOUT_VARIANT_IDS,
  resolveAboutLayoutVariant,
  resolveFeatureLayoutVariant,
  resolveGalleryLayoutVariant,
} from '@/lib/layout';
import type {
  AboutLayoutContent,
  FeatureLayoutContent,
  GalleryLayoutContent,
} from '@/lib/layout';
import type {
  CanvasElement,
  ImageElement,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';

const theme: SiteTheme = {
  fonts: { heading: 'serif', body: 'sans-serif' },
  palette: {
    background: '#ffffff',
    surface: '#f4f4f4',
    text: '#111111',
    muted: '#666666',
    primary: '#173fca',
    accent: '#03a998',
  },
  radius: 16,
};

function text(id: string, value: string): TextElement {
  return {
    id,
    kind: 'text',
    text: value,
    frame: { x: 0, y: 0, w: 100, h: 20 },
    z: 1,
    style: { fontSize: 18, fontFamily: 'body', lineHeight: 1.5 },
  };
}

function image(id: string): ImageElement {
  return {
    id,
    kind: 'image',
    src: `/customer/${id}.webp`,
    alt: '',
    frame: { x: 0, y: 0, w: 100, h: 100 },
    z: 1,
    style: { objectFit: 'cover' },
  };
}

const featureContent: FeatureLayoutContent = {
  intro: { eyebrowId: 'feature-kicker', titleId: 'feature-heading', leadId: 'feature-lead' },
  items: Array.from({ length: 6 }, (_, index) => ({
    id: `feature-${index}`,
    markerId: `feature-marker-${index}`,
    titleId: `feature-title-${index}`,
    bodyId: `feature-body-${index}`,
    ...(index % 2 === 0 ? { mediaId: `feature-image-${index}` } : {}),
  })),
};

const featureElements: CanvasElement[] = [
  text('feature-kicker', '소개'),
  text('feature-heading', '서비스와 강점을 한눈에 살펴보세요'),
  text('feature-lead', '사장님이 직접 알려주신 내용만 담았습니다.'),
  ...featureContent.items.flatMap((item, index) => [
    text(item.markerId!, String(index + 1).padStart(2, '0')),
    text(item.titleId, `서비스 ${index + 1}`),
    text(item.bodyId!, '실제 입력한 설명이 길어져도 다음 항목과 겹치지 않습니다.'),
    ...(item.mediaId ? [image(item.mediaId)] : []),
  ]),
];

const aboutContent: AboutLayoutContent = {
  intro: { eyebrowId: 'about-kicker', titleId: 'about-heading' },
  about: {
    id: 'about-story',
    statementId: 'about-statement',
    bodyIds: ['about-body-1', 'about-body-2'],
    factIds: ['about-fact'],
    mediaId: 'about-image',
  },
};

const aboutElements: CanvasElement[] = [
  text('about-kicker', '우리의 이야기'),
  text('about-heading', '처음의 마음을 오늘까지 이어갑니다'),
  text('about-statement', '편안히 머무는 시간을 생각합니다'),
  text('about-body-1', '고객이 직접 입력한 브랜드 스토리 첫 번째 문단입니다.'),
  text('about-body-2', '실제 이야기가 길어져도 섹션 높이가 함께 늘어납니다.'),
  text('about-fact', '고객이 확인한 사실'),
  image('about-image'),
];

const galleryContent: GalleryLayoutContent = {
  intro: { eyebrowId: 'gallery-kicker', titleId: 'gallery-heading', leadId: 'gallery-lead' },
  items: Array.from({ length: 5 }, (_, index) => ({
    id: `gallery-${index}`,
    mediaId: `gallery-image-${index}`,
    ...(index % 2 === 0 ? { captionId: `gallery-caption-${index}` } : {}),
    sourceWidth: index % 3 === 0 ? 900 : index % 3 === 1 ? 1200 : 1600,
    sourceHeight: index % 3 === 0 ? 1400 : index % 3 === 1 ? 1200 : 900,
  })),
};

const galleryElements: CanvasElement[] = [
  text('gallery-kicker', '사진'),
  text('gallery-heading', '사진으로 둘러보기'),
  text('gallery-lead', '사용 권리를 확인한 사진입니다.'),
  ...galleryContent.items.flatMap((item) => [
    image(item.mediaId),
    ...(item.captionId ? [text(item.captionId, '고객이 직접 입력한 사진 설명입니다.')] : []),
  ]),
];

describe('LIB2 M2 — section layout catalog', () => {
  test('9 feature + 4 about + 4 gallery ID를 스펙 순서로 고정한다', () => {
    assert.deepEqual(FEATURE_LAYOUT_CATALOG.map((item) => item.id), FEATURE_LAYOUT_VARIANT_IDS);
    assert.deepEqual(ABOUT_LAYOUT_CATALOG.map((item) => item.id), ABOUT_LAYOUT_VARIANT_IDS);
    assert.deepEqual(GALLERY_LAYOUT_CATALOG.map((item) => item.id), GALLERY_LAYOUT_VARIANT_IDS);
    assert.equal(
      FEATURE_LAYOUT_CATALOG.length + ABOUT_LAYOUT_CATALOG.length + GALLERY_LAYOUT_CATALOG.length,
      17,
    );
  });

  test('ordered fallback ladder와 atmosphere/figure 의미 축을 catalog가 소유한다', () => {
    const all = [
      ...FEATURE_LAYOUT_CATALOG,
      ...ABOUT_LAYOUT_CATALOG,
      ...GALLERY_LAYOUT_CATALOG,
    ];
    for (const variant of all) {
      const contract = variant.mediaContract;
      if (contract.role === 'referential-figure') {
        if (contract.categoricalEligible) {
          assert.deepEqual(
            contract.fallbackLadder,
            ['customer-referential', 'categorical-stock', 'collapse-slot'],
          );
        } else {
          assert.deepEqual(contract.fallbackLadder, ['customer-referential', 'collapse-slot']);
        }
        assert.ok(!contract.fallbackLadder.includes('system-atmospheric'));
      }
    }
    assert.ok(
      ABOUT_LAYOUT_CATALOG.find((item) => item.id === 'about.fullbleed-overlay')
        ?.mediaContract.fallbackLadder.includes('system-atmospheric'),
    );
    for (const variant of GALLERY_LAYOUT_CATALOG) {
      assert.equal(variant.mediaContract.categoricalEligible, false);
      assert.deepEqual(variant.mediaContract.fallbackLadder, ['customer-referential', 'collapse-slot']);
    }
  });

  test('17종 resolver는 3밴드 프레임과 실제 콘텐츠 기반 높이를 결정적으로 컴파일한다', () => {
    const projections = [
      ...FEATURE_LAYOUT_CATALOG.map((variant) => resolveFeatureLayoutVariant({
        requestedId: variant.id,
        elements: featureElements,
        theme,
        content: {
          ...featureContent,
          items: featureContent.items.slice(0, variant.content.maximumItems),
        },
      })),
      ...ABOUT_LAYOUT_VARIANT_IDS.map((requestedId) => resolveAboutLayoutVariant({
        requestedId,
        elements: aboutElements,
        theme,
        content: aboutContent,
        availableMedia: { referential: true, atmospheric: true },
      })),
      ...GALLERY_LAYOUT_VARIANT_IDS.map((requestedId) => resolveGalleryLayoutVariant({
        requestedId,
        elements: galleryElements,
        theme,
        content: galleryContent,
      })),
    ];
    assert.equal(projections.length, 17);
    for (const projection of projections) {
      assert.ok(projection);
      assert.equal(JSON.stringify(projection), JSON.stringify(structuredClone(projection)));
      assert.deepEqual(Object.keys(projection.bands), ['wide', 'compact', 'mobile']);
      for (const band of Object.values(projection.bands)) {
        assert.ok(band.sectionHeight > 0);
        for (const frame of Object.values(band.frames)) {
          assert.ok(frame.x >= 0 && frame.y >= 0 && frame.w > 0 && frame.h > 0);
          assert.ok(frame.x + frame.w <= band.width + 0.001);
          assert.ok(frame.y + frame.h <= band.sectionHeight + 0.001);
        }
      }
    }
  });

  test('gallery는 0~1장과 13장을 resolver 데이터 경계에서도 거부한다', () => {
    for (const requestedId of GALLERY_LAYOUT_VARIANT_IDS) {
      assert.equal(resolveGalleryLayoutVariant({
        requestedId,
        elements: galleryElements,
        theme,
        content: { ...galleryContent, items: galleryContent.items.slice(0, 1) },
      }), null);
      assert.equal(resolveGalleryLayoutVariant({
        requestedId,
        elements: galleryElements,
        theme,
        content: {
          ...galleryContent,
          items: Array.from({ length: 13 }, (_, index) => ({
            id: `over-${index}`,
            mediaId: `over-image-${index}`,
          })),
        },
      }), null);
    }
  });

  test('신규 모델 노출 타입·catalog에는 임의 hex/px 입력 필드가 없다', () => {
    const source = [
      'section-layout-types.ts',
      'feature-catalog.ts',
      'about-catalog.ts',
      'gallery-catalog.ts',
    ].map((file) => readFileSync(resolve(process.cwd(), 'src/lib/layout', file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /\b[\w$]*(?:hex|px)[\w$]*\??\s*:/iu);
    assert.doesNotMatch(source, /#[\da-f]{3,8}\b/iu);
  });
});
