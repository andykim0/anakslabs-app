/**
 * [T3 · 제품 확정] PURPOSE_CAPABILITIES — 소개형 6종, 약속 = 배선된 것 (금칙어·완전성 불변식).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { LivePurposeId } from '@/lib/types/domain';
import { PURPOSE_CAPABILITIES } from '@/lib/onboarding/purpose-capabilities';

const ALL: Record<LivePurposeId, true> = {
  local_store: true, booking_service: true, company_brand: true,
  portfolio: true, edu_membership: true, one_page: true,
};

/** 제거된 백엔드 기능 금칙어 — features/summary에 등장하면 제품이 안 지키는 약속 */
const BANNED = ['장바구니', '재고', '결제', '게이팅', '회원 등급', '게시판', '포인트', '자체', 'CMS', '수강 관리', '진도'];

describe('PURPOSE_CAPABILITIES (소개형 6종)', () => {
  test('6종 전부 항목 존재 + summary/features 비어있지 않음', () => {
    const keys = Object.keys(PURPOSE_CAPABILITIES);
    assert.equal(keys.length, 6, `6종이어야 함 (실제 ${keys.length})`);
    for (const id of Object.keys(ALL) as LivePurposeId[]) {
      const c = PURPOSE_CAPABILITIES[id];
      assert.ok(c, `${id} 누락`);
      assert.ok(c.summary.trim().length > 0, `${id} summary 빈 값`);
      assert.ok(c.features.length >= 3, `${id} features < 3`);
      for (const f of c.features) assert.ok(f.trim().length > 0);
    }
  });

  test('금칙어 — features·summary에 백엔드/미배선 단어 없음', () => {
    for (const id of Object.keys(ALL) as LivePurposeId[]) {
      const c = PURPOSE_CAPABILITIES[id];
      const promised = [c.summary, ...c.features].join(' / ');
      for (const word of BANNED) {
        assert.ok(!promised.includes(word), `${id}: 금칙어 '${word}' — "${promised}"`);
      }
    }
    // roadmap 필드 자체가 없어야 함(백엔드 로드맵 완전 제거)
    for (const id of Object.keys(ALL) as LivePurposeId[]) {
      assert.ok(!('roadmap' in PURPOSE_CAPABILITIES[id]), `${id}: roadmap 필드 잔존`);
    }
  });

  test('학원·교육 — 소개형(커리큘럼·수강 안내·상담)만 약속', () => {
    const joined = PURPOSE_CAPABILITIES.edu_membership.features.join(' ');
    assert.ok(/Curriculum|enrollment|inquiry/i.test(joined));
  });
});
