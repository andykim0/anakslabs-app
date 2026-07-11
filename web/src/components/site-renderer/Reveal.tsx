'use client';

/**
 * 뷰포트 진입 시 등장 애니메이션 래퍼 (IntersectionObserver + CSS transition).
 *
 * "JS 최소" 규약과의 절충:
 *  - SSR/정적 Export(renderToStaticMarkup) 마크업은 항상 보이는 상태로 출력 —
 *    JS가 없으면 애니메이션 없이 전부 표시된다 (콘텐츠/SEO/Export 무손실).
 *  - 하이드레이션 후에만 숨김→등장 전환을 건다 (framer-motion 없이 ~1KB).
 *  - prefers-reduced-motion 이면 전환 없이 즉시 표시.
 */
import { useEffect, useRef, useState } from 'react';
import type { Entrance, EntranceEffect } from '@/lib/types/site';
import { ENTRANCE_DEFAULT_DURATION } from './entrance';

/** 숨김 상태의 시작 transform — 'slide-left'는 왼쪽에서, 'slide-right'는 오른쪽에서 등장 */
const HIDDEN_TRANSFORM: Partial<Record<EntranceEffect, string>> = {
  'fade-up': 'translateY(26px)',
  'fade-down': 'translateY(-26px)',
  'slide-left': 'translateX(-36px)',
  'slide-right': 'translateX(36px)',
  'zoom-in': 'scale(0.94)',
};

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

type Phase = 'idle' | 'hidden' | 'shown';

export function Reveal({ entrance, children }: { entrance: Entrance; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // 'idle' = SSR/JS 미실행 (보임) → 'hidden' = 등장 대기 → 'shown' = 재생/완료
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      entrance.effect === 'none' ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setPhase('shown');
      return;
    }
    setPhase('hidden');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // 숨김 스타일이 페인트된 다음 프레임에 전환 시작 (transition 발화 보장)
        requestAnimationFrame(() => requestAnimationFrame(() => setPhase('shown')));
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.06 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [entrance.effect]);

  const duration = entrance.duration ?? ENTRANCE_DEFAULT_DURATION;
  const delay = entrance.delay ?? 0;
  const hidden = phase === 'hidden';

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        opacity: hidden ? 0 : undefined,
        transform: hidden ? HIDDEN_TRANSFORM[entrance.effect] : undefined,
        transition:
          phase === 'shown'
            ? `opacity ${duration}ms ${EASE} ${delay}ms, transform ${duration}ms ${EASE} ${delay}ms`
            : undefined,
        willChange: hidden ? 'opacity, transform' : undefined,
      }}
    >
      {children}
    </div>
  );
}
