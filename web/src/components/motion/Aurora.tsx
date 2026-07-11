'use client';

/**
 * [마케팅] 히어로 배경 Aurora — 골드/앰버/아이보리 radial blob이 느리게 drift.
 * transform·opacity만 사용(CLS 0). pointer-events-none·aria-hidden·콘텐츠 아래(-z-10).
 * prefers-reduced-motion: reduce면 정지(useReducedMotion).
 */
import { motion, useReducedMotion } from 'framer-motion';

const BLOBS = [
  { className: 'left-[6%] top-[-8%] h-[34rem] w-[34rem]', bg: 'radial-gradient(circle at center, #C9A94E, transparent 70%)', opacity: 0.22, dur: 26, dx: 40, dy: 28 },
  { className: 'right-[2%] top-[4%] h-[28rem] w-[28rem]', bg: 'radial-gradient(circle at center, #E7C77A, transparent 70%)', opacity: 0.2, dur: 30, dx: -32, dy: 40 },
  { className: 'left-[32%] top-[26%] h-[24rem] w-[24rem]', bg: 'radial-gradient(circle at center, #F1E7CE, transparent 70%)', opacity: 0.24, dur: 24, dx: 28, dy: -28 },
];

export function Aurora() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${b.className}`}
          style={{ background: b.bg, opacity: b.opacity }}
          animate={reduce ? undefined : { x: [0, b.dx, 0], y: [0, b.dy, 0], scale: [1, 1.1, 1] }}
          transition={reduce ? undefined : { duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* 미세 dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(23,24,28,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.4,
        }}
      />
      {/* 하단 페이드 — 콘텐츠 경계 부드럽게 */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#FDFDFB]" />
    </div>
  );
}
