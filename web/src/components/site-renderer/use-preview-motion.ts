'use client';

/**
 * [G1] 클라 전용 프리뷰(에디터 CanvasStage·대시보드 SitePreview)에서 모션 런타임을 실제 실행한다.
 * SiteRenderer는 MOTION_RUNTIME을 <script dangerouslySetInnerHTML>로 넣지만 React는 CSR에서
 * 그 <script>를 실행하지 않는다(SSR/정적 export HTML만 브라우저가 파싱 시 실행). 그 결과 프리뷰에서
 * ken-burns/marquee(순수 CSS)만 보이고 reveal/mask/video-hero(런타임 JS 의존)는 재생되지 않았다.
 * 이 훅이 프리뷰 DOM 마운트 후 런타임 IIFE를 1회 실행해 발행본과 동일하게 재생시킨다.
 * prefers-reduced-motion은 런타임 자체가 early-return으로 존중한다.
 */
import { useEffect } from 'react';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';

/** active(모션 방출 중)일 때 resetKey가 바뀌면 런타임을 재실행 — 토글/설정 변경 시 처음부터 재생 */
export function usePreviewMotion(active: boolean, resetKey: unknown): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    // 요소 마운트/레이아웃 이후 실행(IntersectionObserver 초기 판정 정확도)
    const id = window.requestAnimationFrame(() => {
      try {
        // MOTION_RUNTIME은 자기호출 IIFE 문자열 — Function으로 감싸 1회 실행(reduced-motion은 내부 가드)
        new Function(MOTION_RUNTIME)();
      } catch {
        /* 모션 실패는 콘텐츠에 영향 없음 */
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [active, resetKey]);
}
