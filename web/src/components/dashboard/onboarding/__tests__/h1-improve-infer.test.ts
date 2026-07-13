/**
 * [H1] 개선 모드 import — 순수 추출 추론 헬퍼 회귀(모듈 무결성). StrictMode 마운트 전이(loading→ready)는
 * RTL/jsdom 부재로 단위 테스트 불가 — 수정은 startedRef(1회 가드) 제거로 mount2가 실제 fetch를 수행하게
 * 하는 것(무한 스피너 원인 제거). 여기선 import 흐름이 소비하는 순수 추론을 고정한다.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { inferPurpose, inferRegion } from '@/components/dashboard/onboarding/improve-step';
import type { ImproveExtractResult } from '@/components/dashboard/api';

const R = (over: Partial<ImproveExtractResult>): ImproveExtractResult =>
  ({ title: '', description: '', text: '', contentItems: [], imageUrls: [], paletteSeed: null, ...over }) as ImproveExtractResult;

describe('H1 — 개선 모드 추론 헬퍼', () => {
  test('inferPurpose: 키워드 규칙', () => {
    assert.equal(inferPurpose(R({ text: '오늘의 메뉴 아메리카노' })), 'local_store');
    assert.equal(inferPurpose(R({ description: '예약 시술 안내' })), 'booking_service');
    assert.equal(inferPurpose(R({ title: '코딩 학원' })), 'edu_membership');
    assert.equal(inferPurpose(R({ text: '디자이너 포트폴리오' })), 'portfolio');
    assert.equal(inferPurpose(R({ title: '주식회사 아낙스' })), 'company_brand'); // 폴백
  });

  test('inferRegion: 시/구/동 첫 매칭, 없으면 빈 문자열', () => {
    assert.equal(inferRegion('서울 서대문구 연희동 카페'), '서대문구');
    assert.equal(inferRegion('연희동 8평'), '연희동');
    assert.equal(inferRegion('특별한 지역 표기 없음'), '');
    assert.equal(inferRegion(''), '');
  });
});
