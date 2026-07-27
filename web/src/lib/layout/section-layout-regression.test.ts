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
  SectionLayoutBandProjection,
  SectionLayoutProjection,
} from '@/lib/layout';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type {
  CanvasElement,
  ImageElement,
  TextElement,
} from '@/lib/types/site';

const BANDS = ['wide', 'compact', 'mobile'] as const;
const theme = tokenSetToSiteTheme(expandTokens('dining-refined-contrast', 28));

function text(id: string, value: string, heading = false): TextElement {
  return {
    id,
    kind: 'text',
    text: value,
    frame: { x: 0, y: 0, w: 100, h: 20 },
    z: 2,
    style: {
      fontSize: heading ? 42 : 17,
      fontFamily: heading ? 'heading' : 'body',
      lineHeight: heading ? 1.25 : 1.7,
    },
  };
}

function image(id: string): ImageElement {
  return {
    id,
    kind: 'image',
    src: `/customer/${id}.webp`,
    alt: '고객이 사용 권리를 확인한 사진',
    frame: { x: 0, y: 0, w: 100, h: 100 },
    z: 1,
    style: { objectFit: 'cover' },
  };
}

function overlap(
  left: { x: number; y: number; w: number; h: number },
  right: { x: number; y: number; w: number; h: number },
): number {
  return Math.max(
    0,
    Math.min(left.x + left.w, right.x + right.w) - Math.max(left.x, right.x),
  ) * Math.max(
    0,
    Math.min(left.y + left.h, right.y + right.h) - Math.max(left.y, right.y),
  );
}

function assertBandGeometry(
  projection: SectionLayoutProjection,
  band: SectionLayoutBandProjection,
  label: string,
): void {
  const entries = Object.entries(band.frames);
  assert.ok(entries.length > 0, `${label}: frames missing`);
  for (const [id, frame] of entries) {
    assert.ok(frame.x >= 0, `${label}/${id}: left overflow`);
    assert.ok(frame.y >= 0, `${label}/${id}: top overflow`);
    assert.ok(frame.w > 0 && frame.h > 0, `${label}/${id}: empty frame`);
    assert.ok(frame.x + frame.w <= band.width + 0.001, `${label}/${id}: right overflow`);
    assert.ok(
      frame.y + frame.h <= band.sectionHeight + 0.001,
      `${label}/${id}: bottom overflow`,
    );
  }

  const atmosphericMediaIds = projection.mediaRole === 'atmospheric-background'
    ? new Set(projection.items.flatMap((item) => item.mediaElementId ? [item.mediaElementId] : []))
    : new Set<string>();
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const [leftId, leftFrame] = entries[left];
      const [rightId, rightFrame] = entries[right];
      if (atmosphericMediaIds.has(leftId) || atmosphericMediaIds.has(rightId)) continue;
      assert.equal(
        overlap(leftFrame, rightFrame),
        0,
        `${label}: ${leftId} overlaps ${rightId}`,
      );
    }
  }
}

function featureFixture(count: number): {
  elements: CanvasElement[];
  content: FeatureLayoutContent;
} {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `feature-${index}`,
    markerId: `feature-marker-${index}`,
    titleId: `feature-title-${index}`,
    bodyId: `feature-body-${index}`,
    ...(index % 2 === 0 ? { mediaId: `feature-image-${index}` } : {}),
  }));
  return {
    content: {
      intro: {
        eyebrowId: 'feature-kicker',
        titleId: 'feature-heading',
        leadId: 'feature-lead',
      },
      items,
    },
    elements: [
      text('feature-kicker', '강점'),
      text('feature-heading', '고객이 알려주신 강점을 차분하게 살펴보세요', true),
      text('feature-lead', '검증 가능한 입력만 사용해 항목을 구성합니다.'),
      ...items.flatMap((item, index) => [
        text(item.markerId, String(index + 1).padStart(2, '0')),
        text(item.titleId, `${index + 1}번째 실제 서비스 안내`, true),
        text(
          item.bodyId,
          '설명이 길어져도 다음 항목과 겹치지 않도록 실제 글자 수로 높이를 계산합니다.',
        ),
        ...('mediaId' in item && item.mediaId ? [image(item.mediaId)] : []),
      ]),
    ],
  };
}

function aboutFixture(): {
  elements: CanvasElement[];
  content: AboutLayoutContent;
} {
  const bodyIds = Array.from({ length: 6 }, (_, index) => `about-body-${index}`);
  const factIds = ['about-fact'];
  return {
    content: {
      intro: { eyebrowId: 'about-kicker', titleId: 'about-heading' },
      about: {
        id: 'about-story',
        statementId: 'about-statement',
        bodyIds,
        factIds,
        mediaId: 'about-image',
      },
    },
    elements: [
      text('about-kicker', '우리의 이야기'),
      text('about-heading', '실제 이야기와 태도가 브랜드의 중심이 됩니다', true),
      text('about-statement', '편안히 머무는 순간부터 생각합니다', true),
      ...bodyIds.map((id, index) => text(
        id,
        `고객이 직접 입력한 긴 이야기 ${index + 1}번째 문단입니다. 문장이 여러 줄이 되어도 다음 문단과 자연스럽게 이어집니다.`,
      )),
      text('about-fact', '고객이 직접 확인한 사실만 표시합니다.'),
      image('about-image'),
    ],
  };
}

function galleryFixture(count: number): {
  elements: CanvasElement[];
  content: GalleryLayoutContent;
} {
  const items = Array.from({ length: count }, (_, index) => ({
    id: `gallery-${index}`,
    mediaId: `gallery-image-${index}`,
    captionId: `gallery-caption-${index}`,
    sourceWidth: index % 3 === 0 ? 900 : index % 3 === 1 ? 1200 : 1600,
    sourceHeight: index % 3 === 0 ? 1400 : index % 3 === 1 ? 1200 : 900,
  }));
  return {
    content: {
      intro: {
        eyebrowId: 'gallery-kicker',
        titleId: 'gallery-heading',
        leadId: 'gallery-lead',
      },
      items,
    },
    elements: [
      text('gallery-kicker', '사진'),
      text('gallery-heading', '사진으로 공간과 작업을 둘러보세요', true),
      text('gallery-lead', '사용 권리를 확인한 고객 사진만 보여드립니다.'),
      ...items.flatMap((item, index) => [
        image(item.mediaId),
        text(
          item.captionId,
          index % 2 === 0
            ? '고객이 직접 입력한 조금 긴 사진 설명입니다.'
            : '고객 사진 설명',
        ),
      ]),
    ],
  };
}

describe('LIB2 M4 — 14종 × 3밴드 × 콘텐츠 가변 회귀', () => {
  test('피처 6종은 항목 2~6개에서 겹침·오버플로 없이 결정적으로 컴파일된다', () => {
    let checked = 0;
    for (const requestedId of FEATURE_LAYOUT_VARIANT_IDS) {
      for (let count = 2; count <= 6; count += 1) {
        const fixture = featureFixture(count);
        const projection = resolveFeatureLayoutVariant({
          requestedId,
          elements: fixture.elements,
          theme,
          content: fixture.content,
        });
        assert.ok(projection);
        assert.equal(JSON.stringify(projection), JSON.stringify(resolveFeatureLayoutVariant({
          requestedId,
          elements: fixture.elements,
          theme,
          content: fixture.content,
        })));
        for (const band of BANDS) {
          assertBandGeometry(projection, projection.bands[band], `${requestedId}/${count}/${band}`);
          checked += 1;
        }
      }
    }
    assert.equal(checked, 6 * 5 * 3);
  });

  test('about 4종은 장문 8개 블록에서 섹션 높이를 늘려 잘림·겹침을 막는다', () => {
    const fixture = aboutFixture();
    for (const requestedId of ABOUT_LAYOUT_VARIANT_IDS) {
      const projection = resolveAboutLayoutVariant({
        requestedId,
        elements: fixture.elements,
        theme,
        content: fixture.content,
        availableMedia: { referential: true, atmospheric: true },
      });
      assert.ok(projection);
      for (const band of BANDS) {
        assertBandGeometry(projection, projection.bands[band], `${requestedId}/long/${band}`);
      }
    }
  });

  test('갤러리 4종은 2~12장·혼합 비율·홀수에서 정적 프레임이 겹치지 않는다', () => {
    let checked = 0;
    for (const requestedId of GALLERY_LAYOUT_VARIANT_IDS) {
      for (let count = 2; count <= 12; count += 1) {
        const fixture = galleryFixture(count);
        const projection = resolveGalleryLayoutVariant({
          requestedId,
          elements: fixture.elements,
          theme,
          content: fixture.content,
        });
        assert.ok(projection);
        for (const band of BANDS) {
          const staticBand = projection.fallbackBands?.[band] ?? projection.bands[band];
          assertBandGeometry(projection, staticBand, `${requestedId}/${count}/${band}`);
          checked += 1;
        }
      }
    }
    assert.equal(checked, 4 * 11 * 3);
  });

  test('미디어 사다리 5개 계약을 데이터·resolver 경계에서 유지한다', () => {
    const figure = [
      ...FEATURE_LAYOUT_CATALOG.filter((variant) => variant.mediaContract.role === 'referential-figure'),
      ...ABOUT_LAYOUT_CATALOG.filter((variant) => variant.mediaContract.role === 'referential-figure'),
    ];
    assert.ok(figure.length > 0);
    assert.ok(figure.every((variant) => (
      variant.mediaContract.categoricalEligible
      && variant.mediaContract.fallbackLadder.join('>')
        === 'customer-referential>categorical-stock>collapse-slot'
    )));

    const atmospheric = ABOUT_LAYOUT_CATALOG.find(
      (variant) => variant.id === 'about.fullbleed-overlay',
    )!;
    assert.equal(atmospheric.mediaContract.role, 'atmospheric-background');
    assert.deepEqual(
      atmospheric.mediaContract.fallbackLadder,
      ['customer-referential', 'categorical-stock', 'system-atmospheric'],
    );

    assert.ok(GALLERY_LAYOUT_CATALOG.every((variant) => (
      variant.mediaContract.role === 'referential-figure'
      && variant.mediaContract.categoricalEligible === false
      && variant.mediaContract.fallbackLadder.join('>') === 'customer-referential>collapse-slot'
    )));
    const gallery = galleryFixture(1);
    assert.ok(GALLERY_LAYOUT_VARIANT_IDS.every((requestedId) => (
      resolveGalleryLayoutVariant({
        requestedId,
        elements: gallery.elements,
        theme,
        content: gallery.content,
      }) === null
    )));

    const about = aboutFixture();
    const collapsed = resolveAboutLayoutVariant({
      requestedId: 'about.split-left',
      elements: about.elements,
      theme,
      content: about.content,
      availableMedia: { referential: false, atmospheric: true },
    })!;
    assert.equal(collapsed.mediaRole, 'referential-figure');
    assert.ok(BANDS.every((band) => collapsed.bands[band].frames['about-image'] === undefined));
  });

  test('가로 넘겨보기는 no-JS·reduced-motion에서 전체 정적 그리드로 강등된다', () => {
    const renderer = readFileSync(
      resolve(process.cwd(), 'src/components/site-renderer/SectionLayoutProjectionRenderer.tsx'),
      'utf8',
    );
    assert.match(renderer, /@media\(prefers-reduced-motion:reduce\)/u);
    assert.match(renderer, /projection\.fallbackBands \?\? projection\.bands/u);
    assert.match(renderer, /data-section-layout-carousel/u);
    assert.doesNotMatch(renderer, /슬라이드/u);
  });
});
