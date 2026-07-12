/**
 * [온보딩] 이미지 스타일 업종 기본값 + 폴백.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultImageStyle, resolveImageStyle, IMAGE_STYLE_OPTIONS } from '@/lib/onboarding/image-style';

describe('defaultImageStyle — 업종 기반 기본값', () => {
  test('테크·앱류 → 3d_render', () => {
    for (const ind of ['테크 스타트업', '모바일 앱 서비스', 'IT 솔루션', '핀테크', '게임 스튜디오']) {
      assert.equal(defaultImageStyle(ind), '3d_render', ind);
    }
  });
  test('키즈·공방류 → illustration', () => {
    for (const ind of ['키즈 카페', '아동 미술', '수공예 공방', '핸드메이드 소품', '문구 브랜드']) {
      assert.equal(defaultImageStyle(ind), 'illustration', ind);
    }
  });
  test('음식점·뷰티·병원류 및 그 외 → photo(기본)', () => {
    for (const ind of ['카페·베이커리', '미용실·네일샵', '한식 파인다이닝', '병원·의원', '법률사무소', '', '꽃집']) {
      assert.equal(defaultImageStyle(ind), 'photo', ind);
    }
  });
});

describe('resolveImageStyle — 명시값 우선, 없으면 업종 폴백(기존 데이터 호환)', () => {
  test('imageStyle 명시 시 그대로', () => {
    assert.equal(resolveImageStyle({ imageStyle: 'illustration', industry: '카페' }), 'illustration');
  });
  test('imageStyle 미설정 시 업종 기본값', () => {
    assert.equal(resolveImageStyle({ industry: '테크 스타트업' }), '3d_render');
    assert.equal(resolveImageStyle({ industry: '카페' }), 'photo');
  });
});

describe('IMAGE_STYLE_OPTIONS', () => {
  test('3종(photo/3d_render/illustration) 라벨·설명 보유', () => {
    assert.deepEqual(IMAGE_STYLE_OPTIONS.map((o) => o.id), ['photo', '3d_render', 'illustration']);
    for (const o of IMAGE_STYLE_OPTIONS) assert.ok(o.label && o.description);
  });
});
