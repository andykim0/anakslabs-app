'use client';

/**
 * [마케팅] 히어로 배경 시네마틱 영상 레이어 (Premium 데모 겸용).
 *
 * ⚠️ TODO(에셋): public/ 에 아래 3개를 추가해야 실제 영상이 재생됩니다 (없어도 빌드·렌더 안전 —
 *    현재는 골드/아이보리 그라데이션 placeholder가 poster를 대신함):
 *      • hero.mp4   (H.264, 720p, CRF~28, 무음, faststart, ≤3MB, 6~8초 심리스 루프, 16:9)
 *      • hero.webm  (VP9, 720p, ≤2.5MB)
 *      • hero-poster.webp (첫 프레임, q80, ≤60KB)
 *
 * 성능: 영상은 마운트 후 데스크톱에서만 로드 → LCP는 h1 텍스트/그라데이션(즉시). CLS 0(absolute inset-0).
 * 접근성/데이터: reduced-motion·모바일(<768px)은 그라데이션 poster만. iOS 자동재생 위해 muted+playsInline 필수.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

/** poster 에셋 부재 시 대체 그라데이션 (골드→아이보리→페이지배경). 영상 로드되면 그 위를 object-cover가 덮음 */
const POSTER_GRADIENT =
  'bg-[radial-gradient(120%_100%_at_50%_0%,#F4E7C8_0%,#FBF3E2_38%,#FDFDFB_80%)]';

export function HeroVideo() {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [failed, setFailed] = useState(false);

  // 디바이스 판정은 마운트 후에만 (SSR/첫 페인트는 poster로 시작 → hydration mismatch 방지)
  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const showVideo = mounted && isDesktop && !reduce && !failed;

  // 히어로가 뷰포트를 벗어나면 pause, 돌아오면 play (배터리·디코딩 절약)
  useEffect(() => {
    if (!showVideo) return;
    const el = ref.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [showVideo]);

  // 스크롤 시 영상이 살짝 줄며 가라앉는 시네마틱 전환 (transform/opacity만)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <motion.div
        className={`absolute inset-0 ${POSTER_GRADIENT}`}
        // 패럴럭스도 video와 동일하게 mounted 게이팅 — SSR·클라 첫 렌더 모두 style undefined(동일) →
        // reduced-motion 사용자 하이드레이션 불일치 방지. 마운트 이후에만 스크롤 트랜스폼 적용.
        style={mounted && !reduce ? { scale, opacity, y, willChange: 'transform' } : undefined}
      >
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/hero-poster.webp"
            onError={() => setFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source src="/hero.webm" type="video/webm" />
            <source src="/hero.mp4" type="video/mp4" />
          </video>
        ) : null}
        {/* 오버레이 1: 하단으로 갈수록 페이지 배경(#FDFDFB)에 녹아듦 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#FDFDFB]/55 via-[#FDFDFB]/25 to-[#FDFDFB]" />
        {/* 오버레이 2: 전면 옅은 틴트 — 텍스트 대비 보강 (어두운 영상이면 /30까지 상향 검토) */}
        <div className="absolute inset-0 bg-[#FDFDFB]/20" />
      </motion.div>
    </div>
  );
}
