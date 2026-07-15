'use client';

/**
 * [마케팅] 지연 로드 프리뷰 영상 (AI 영상 홈페이지 데모·가격 카드 티저 공용).
 *  - mode 'inview': 뷰포트 진입 시에만 재생, 이탈 시 pause (preload="none" → 진입 전 미전송)
 *  - mode 'hover' : 데스크톱 hover 시 재생, 이탈 시 pause + 첫 프레임 복귀
 * 성능: preload="none"로 히어로 외 인스턴스는 자동 로드 안 함. 모바일·reduced-motion은 poster만.
 * CLS 0: aspect-video 고정 컨테이너. 에셋 부재 시 그라데이션 placeholder + onError 폴백.
 * Daboim 1080p MP4/WebM과 정적 WebP 포스터를 공용으로 사용한다.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const POSTER_GRADIENT =
  'bg-[radial-gradient(circle_at_72%_28%,rgba(8,184,232,.2),transparent_28%),radial-gradient(circle_at_20%_82%,rgba(3,209,184,.12),transparent_32%),#F8FBFF]';

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
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(36,87,214,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(36,87,214,.06)_1px,transparent_1px)] bg-[size:32px_32px] opacity-45" />
        <motion.div
          className="absolute top-[18%] right-[12%] h-[58%] w-[42%] rounded-[42%_58%_52%_48%] border border-white/70 bg-gradient-to-br from-[#174DDA]/55 via-[#08B8E8]/45 to-[#03D1B8]/35 shadow-[0_0_70px_rgba(8,184,232,.24)]"
          animate={reduce ? undefined : { rotate: [0, 12, -4, 0], scale: [1, 1.08, 0.96, 1], borderRadius: ['42% 58% 52% 48%', '58% 42% 38% 62%', '46% 54% 60% 40%', '42% 58% 52% 48%'] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="absolute top-[20%] left-[9%] font-mono text-[8px] tracking-[0.18em] text-[#174DDA]">AI MOTION STUDY / 01</div>
        <div className="absolute bottom-[18%] left-[9%] text-[#0B1736]">
          <p className="text-lg font-semibold tracking-[-0.04em] sm:text-2xl">첫 장면부터<br />브랜드답게.</p>
          <p className="mt-2 text-[8px] tracking-[0.12em] text-[#667085]">CINEMATIC HERO · OPTIONAL</p>
        </div>
      </div>
      {canVideo ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="none"
          poster="/daboim-visibility-film-poster.webp"
          onError={() => setFailed(true)}
          className="absolute inset-0 z-10 h-full w-full object-cover"
        >
          <source src="/daboim-visibility-film.webm" type="video/webm" />
          <source src="/daboim-visibility-film.mp4" type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
