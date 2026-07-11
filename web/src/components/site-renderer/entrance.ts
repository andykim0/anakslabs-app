/**
 * 등장 애니메이션 공용 헬퍼 — 서버 컴포넌트(SectionCanvas/SectionStack)와
 * 클라이언트(Reveal)가 함께 쓰는 순수 모듈. 'use client' 금지 (클라이언트 모듈의
 * export는 서버에서 호출 불가한 client reference가 된다).
 */
import type { Entrance } from '@/lib/types/site';

export const ENTRANCE_DEFAULT_DURATION = 700;
/** 미지정 요소 기본 연출의 순차 지연 간격/상한 (ms) — rank는 섹션 내 y순서 */
const STAGGER_MS = 90;
const STAGGER_MAX_MS = 450;

/** entrance 미지정 요소의 기본 연출 */
export function defaultEntrance(rank: number): Entrance {
  return {
    effect: 'fade-up',
    duration: ENTRANCE_DEFAULT_DURATION,
    delay: Math.min(Math.max(rank, 0) * STAGGER_MS, STAGGER_MAX_MS),
  };
}
