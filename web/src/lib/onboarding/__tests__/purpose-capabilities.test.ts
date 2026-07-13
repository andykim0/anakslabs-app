/**
 * [T3] PURPOSE_CAPABILITIES — 약속 = 배선된 것 (금칙어·완전성 불변식).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { SitePurposeId } from '@/lib/types/domain';
import { PURPOSE_CAPABILITIES, type PurposeCapability } from '@/lib/onboarding/purpose-capabilities';

const ALL: Record<SitePurposeId, true> = {
  local_store: true, booking_service: true, ecommerce: true, edu_membership: true,
  company_brand: true, portfolio: true, blog_media: true, community: true, event: true, one_page: true,
};

/** 미배선 기능 금칙어 — features/summary에 등장하면 v1이 안 지키는 약속 */
const BANNED = ['장바구니', '재고', '게이팅', '회원 등급', '게시판', '포인트', '자체 결제', 'CMS'];

describe('PURPOSE_CAPABILITIES', () => {
  test('모든 목적(10종)에 항목 존재 + summary/features 비어있지 않음', () => {
    for (const id of Object.keys(ALL) as SitePurposeId[]) {
      const c = PURPOSE_CAPABILITIES[id];
      assert.ok(c, `${id} 누락`);
      assert.ok(c.summary.trim().length > 0, `${id} summary 빈 값`);
      assert.ok(c.features.length >= 3, `${id} features < 3`);
      for (const f of c.features) assert.ok(f.trim().length > 0);
    }
  });

  test('금칙어 — features·summary에 미배선 단어 없음(roadmap은 허용, 단 "준비 중" 명시)', () => {
    for (const id of Object.keys(ALL) as SitePurposeId[]) {
      const c: PurposeCapability = PURPOSE_CAPABILITIES[id];
      const promised = [c.summary, ...c.features].join(' / ');
      for (const word of BANNED) {
        assert.ok(!promised.includes(word), `${id}: 미배선 약속 '${word}' — "${promised}"`);
      }
      for (const r of c.roadmap ?? []) {
        assert.ok(r.includes('준비 중'), `${id}: roadmap '${r}'에 '준비 중' 미명시`);
      }
    }
  });

  test('쇼핑몰 v1 — 외부 결제 연동 명시(스마트스토어/카페24/카카오톡)', () => {
    const joined = PURPOSE_CAPABILITIES.ecommerce.features.join(' ');
    assert.ok(/스마트스토어|카페24|카카오톡/.test(joined));
  });
});
