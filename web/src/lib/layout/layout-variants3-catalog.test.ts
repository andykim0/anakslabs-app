import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CTA_LAYOUT_CATALOG,
  CTA_LAYOUT_VARIANT_IDS,
  DIRECTIONS_LAYOUT_CATALOG,
  DIRECTIONS_LAYOUT_VARIANT_IDS,
  TESTIMONIAL_LAYOUT_CATALOG,
  TESTIMONIAL_LAYOUT_VARIANT_IDS,
  resolveCtaLayoutVariant,
  resolveDirectionsLayoutVariant,
  resolveTestimonialLayoutVariant,
} from '@/lib/layout';
import { expandTokens, tokenSetToSiteTheme } from '@/lib/design/dna';
import type {
  ButtonElement,
  CanvasElement,
  MapElement,
  TextElement,
} from '@/lib/types/site';

const theme = tokenSetToSiteTheme(expandTokens('cafe-warm-editorial', 32));
const text = (id: string, value: string, heading = false): TextElement => ({
  id,
  kind: 'text',
  text: value,
  frame: { x: 0, y: 0, w: 100, h: 30 },
  z: 2,
  style: {
    fontSize: heading ? 42 : 17,
    fontFamily: heading ? 'heading' : 'body',
    lineHeight: heading ? 1.25 : 1.7,
  },
});
const button = (id: string, label: string): ButtonElement => ({
  id,
  kind: 'button',
  label,
  href: '#contact',
  frame: { x: 0, y: 0, w: 180, h: 48 },
  z: 3,
  style: { variant: 'solid' },
});
const map = (id: string): MapElement => ({
  id,
  kind: 'map',
  embedUrl: 'https://www.google.com/maps/embed?pb=customer-confirmed',
  frame: { x: 0, y: 0, w: 640, h: 400 },
  z: 1,
  style: {},
});

describe('LIB3 L1 — CTA·후기·오시는길 카탈로그와 resolver', () => {
  test('카탈로그는 승인된 9개 ID와 3밴드 레시피를 정확히 소유한다', () => {
    assert.deepEqual(CTA_LAYOUT_CATALOG.map((entry) => entry.id), [...CTA_LAYOUT_VARIANT_IDS]);
    assert.deepEqual(
      TESTIMONIAL_LAYOUT_CATALOG.map((entry) => entry.id),
      [...TESTIMONIAL_LAYOUT_VARIANT_IDS],
    );
    assert.deepEqual(
      DIRECTIONS_LAYOUT_CATALOG.map((entry) => entry.id),
      [...DIRECTIONS_LAYOUT_VARIANT_IDS],
    );
    for (const entry of [
      ...CTA_LAYOUT_CATALOG,
      ...TESTIMONIAL_LAYOUT_CATALOG,
      ...DIRECTIONS_LAYOUT_CATALOG,
    ]) {
      assert.deepEqual(Object.keys(entry.bands), ['wide', 'compact', 'mobile']);
    }
  });

  test('CTA 3종은 검증된 primary action이 있을 때만 결정적으로 컴파일된다', () => {
    const elements: CanvasElement[] = [
      text('cta-title', '방문 전에 필요한 내용을 확인하고 문의해 주세요', true),
      text('cta-lead', '고객이 선택한 실제 목적지로 연결합니다.'),
      button('cta-primary', '상담 문의'),
      button('cta-secondary', '전화 문의'),
    ];
    for (const requestedId of CTA_LAYOUT_VARIANT_IDS) {
      const first = resolveCtaLayoutVariant({
        requestedId,
        elements,
        theme,
        content: {
          intro: { titleId: 'cta-title', leadId: 'cta-lead' },
          primaryActionId: 'cta-primary',
          secondaryActionId: 'cta-secondary',
        },
      });
      const second = resolveCtaLayoutVariant({
        requestedId,
        elements,
        theme,
        content: {
          intro: { titleId: 'cta-title', leadId: 'cta-lead' },
          primaryActionId: 'cta-primary',
          secondaryActionId: 'cta-secondary',
        },
      });
      assert.ok(first);
      assert.deepEqual(first, second);
    }
    assert.equal(resolveCtaLayoutVariant({
      requestedId: 'cta.split-action',
      elements: elements.filter((element) => element.id !== 'cta-primary'),
      theme,
      content: {
        intro: { titleId: 'cta-title' },
        primaryActionId: 'cta-primary',
      },
    }), null);
  });

  test('후기 건수와 proof↔사진 동의 부재는 승인된 강등 규칙을 따른다', () => {
    const elements: CanvasElement[] = [
      text('testimonial-title', '고객이 직접 전한 이야기', true),
      text('quote-1', '게시를 허락한 실제 후기입니다.'),
      text('source-1', '고객 제공 출처'),
    ];
    const content = {
      intro: { titleId: 'testimonial-title' },
      items: [{ id: 'proof-1', quoteId: 'quote-1', sourceId: 'source-1' }],
    } as const;
    assert.equal(resolveTestimonialLayoutVariant({
      requestedId: 'testimonial.card-grid',
      elements,
      theme,
      content,
    })?.resolvedId, 'testimonial.single-quote');
    assert.equal(resolveTestimonialLayoutVariant({
      requestedId: 'testimonial.quote-photo',
      elements,
      theme,
      content,
    })?.resolvedId, 'testimonial.single-quote');
  });

  test('지도 요구 변형은 extras 전 map 부재에서 정보 카드로 강등되고 map 주입 후 복원된다', () => {
    const base: CanvasElement[] = [
      text('directions-title', '오시는 길', true),
      text('directions-label', '주소'),
      text('directions-value', '서울시 고객 확인 주소'),
    ];
    const content = {
      intro: { titleId: 'directions-title' },
      mode: 'full' as const,
      rows: [{ id: 'address', labelId: 'directions-label', valueId: 'directions-value' }],
      mapId: 'directions-map',
    };
    assert.equal(resolveDirectionsLayoutVariant({
      requestedId: 'directions.map-info-split',
      elements: base,
      theme,
      content,
    })?.resolvedId, 'directions.info-card-stack');
    assert.equal(resolveDirectionsLayoutVariant({
      requestedId: 'directions.map-info-split',
      elements: [...base, map('directions-map')],
      theme,
      content,
    })?.resolvedId, 'directions.map-info-split');
  });
});
