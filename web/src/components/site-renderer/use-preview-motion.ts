'use client';

/**
 * [G1] 클라 전용 프리뷰(에디터 CanvasStage·대시보드 SitePreview)에서 모션 런타임을 실제 실행한다.
 * SiteRenderer는 MOTION_RUNTIME을 <script dangerouslySetInnerHTML>로 넣지만 React는 CSR에서
 * 그 <script>를 실행하지 않는다(SSR/정적 export HTML만 브라우저가 파싱 시 실행). 그 결과 프리뷰에서
 * ken-burns/marquee(순수 CSS)만 보이고 reveal/mask/video-hero(런타임 JS 의존)는 재생되지 않았다.
 * 이 훅이 프리뷰 DOM 마운트 후 런타임 IIFE를 1회 실행해 발행본과 동일하게 재생시킨다.
 * prefers-reduced-motion은 런타임 자체가 early-return으로 존중한다.
 *
 * [D1] 모션 토글 시 「이미지가 다시 안 나옴」 버그 수정.
 * 원인: MOTION_RUNTIME은 재실행마다 모든 reveal/mask/split/stack 요소에 .m-hide(opacity:0 /
 * mask는 clip-path)를 무조건 재부여한 뒤, IntersectionObserver(root=브라우저 뷰포트)로 '지금
 * 뷰포트 안'인 요소만 벗긴다. 프리뷰는 중첩 스크롤/스케일 컨테이너라 IO 뷰포트 밴드 밖 요소는
 * intersect 이벤트를 못 받아 .m-hide에 영구히 갇힌다(mask 이미지는 완전 소멸). 발행본(전체 페이지가
 * 뷰포트 루트)에선 없는 문제 → 프리뷰 전용으로만 보정한다(MOTION_RUNTIME·실서빙 무수정).
 * - OFF: 런타임이 남긴 .m-hide를 전부 해제 → 모든 콘텐츠 즉시 가시(opacity:1).
 * - ON: 런타임 실행(뷰포트 밴드 요소는 정상 등장) 후, 등장 창(window)이 지나면 밴드 밖에 갇힌
 *   요소를 안전 스윕으로 강제 노출 → 화면 밖 콘텐츠가 사라진 채 남지 않음.
 */
import { useEffect } from 'react';
import { MOTION_RUNTIME } from '@/lib/motion/runtime';

/** [D1] reveal 은닉 잔존(.m-hide) 전면 해제 — 최종 상태로 노출(m-show). 프리뷰 스코프(.anaks-site) 한정. */
export function clearMotionHidden(root: ParentNode): void {
  root.querySelectorAll('.m-hide').forEach((el) => {
    el.classList.remove('m-hide');
    // m-show = reveal opacity:1 / mask clip-path inset(0) → 등장 최종 상태로 확정
    el.classList.add('m-show');
  });
}

type MotionRuntimeWindow = Window & {
  __anaksProgressDispose?: () => void;
  __anaksCinematicDispose?: () => void;
};

/** 프리뷰 OFF/재마운트 시 sticky ready·진행도·영상 재생 잔존 제거. */
function clearCinematicRuntime(root: Element): void {
  root.classList.remove('m-cinematic-ready');
  root.querySelectorAll<HTMLElement>('[data-m-progress]').forEach((el) => {
    el.style.removeProperty('--scroll-progress');
  });
  root.querySelectorAll<HTMLVideoElement>('video[data-m-cinematic-video]').forEach((video) => {
    video.pause();
    video.style.opacity = '0';
  });
}

/** 등장 애니(≤680ms) + 여유. 이 시점까지 밴드에 안 걸린 요소는 프리뷰에선 영영 안 걸리므로 강제 노출. */
const PREVIEW_REVEAL_GRACE_MS = 1400;

/** active(모션 방출 중)일 때 resetKey가 바뀌면 런타임을 재실행 — 토글/설정 변경 시 처음부터 재생 */
export function usePreviewMotion(active: boolean, resetKey: unknown): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.querySelector('.anaks-site');
    if (!active) {
      // [D1] OFF: 런타임 은닉 잔존을 즉시 해제(리마운트로 data-m이 사라져도 잔존 클래스 방어).
      const runtimeWindow = window as MotionRuntimeWindow;
      runtimeWindow.__anaksProgressDispose?.();
      runtimeWindow.__anaksCinematicDispose?.();
      if (root) {
        clearMotionHidden(root);
        clearCinematicRuntime(root);
      }
      return;
    }
    // 요소 마운트/레이아웃 이후 실행(IntersectionObserver 초기 판정 정확도)
    const raf = window.requestAnimationFrame(() => {
      try {
        // MOTION_RUNTIME은 자기호출 IIFE 문자열 — Function으로 감싸 1회 실행(reduced-motion은 내부 가드)
        new Function(MOTION_RUNTIME)();
      } catch {
        /* 모션 실패는 콘텐츠에 영향 없음 */
      }
    });
    // [D1] ON 안전 스윕: 등장 창 이후 프리뷰 뷰포트 밴드 밖에 갇힌 reveal 요소를 강제 노출.
    // (뷰포트 안 요소는 이미 런타임 IO가 정상 등장시킴 — 스윕은 '안 나오는' 밴드 밖만 구제)
    const sweep = window.setTimeout(() => {
      const r = document.querySelector('.anaks-site');
      if (r) clearMotionHidden(r);
    }, PREVIEW_REVEAL_GRACE_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(sweep);
    };
  }, [active, resetKey]);
}
