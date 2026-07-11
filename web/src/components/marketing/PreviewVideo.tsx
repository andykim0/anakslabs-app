'use client';

/**
 * [마케팅] 지연 로드 프리뷰 영상 (Premium 데모 섹션·가격 카드 티저 공용).
 *  - mode 'inview': 뷰포트 진입 시에만 재생, 이탈 시 pause (preload="none" → 진입 전 미전송)
 *  - mode 'hover' : 데스크톱 hover 시 재생, 이탈 시 pause + 첫 프레임 복귀
 * 성능: preload="none"로 히어로 외 인스턴스는 자동 로드 안 함. 모바일·reduced-motion은 poster만.
 * CLS 0: aspect-video 고정 컨테이너. 에셋 부재 시 그라데이션 placeholder + onError 폴백.
 * (에셋 스펙·TODO는 HeroVideo.tsx 참고)
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const POSTER_GRADIENT =
  'bg-[radial-gradient(120%_100%_at_50%_0%,#F4E7C8_0%,#FBF3E2_40%,#FDFDFB_85%)]';

export function PreviewVideo({ mode, className }: { mode: 'inview' | 'hover'; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const canVideo = mounted && isDesktop && !reduce && !failed;

  // inview 모드: 진입 시에만 로드(play가 preload:none을 트리거)·재생, 이탈 시 pause
  useEffect(() => {
    if (!canVideo || mode !== 'inview') return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        const v = videoRef.current;
        if (!v) return;
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canVideo, mode]);

  const onEnter = () => {
    if (canVideo && mode === 'hover') void videoRef.current?.play().catch(() => {});
  };
  const onLeave = () => {
    if (mode !== 'hover') return;
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={`relative aspect-video w-full overflow-hidden ${POSTER_GRADIENT} ${className ?? ''}`}
    >
      {canVideo ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster="/hero-poster.webp"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src="/hero.webm" type="video/webm" />
          <source src="/hero.mp4" type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
