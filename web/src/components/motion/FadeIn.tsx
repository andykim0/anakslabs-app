'use client';

/**
 * [마케팅] 스크롤 리빌 래퍼 — whileInView로 opacity 0→1 · y 24→0.
 *
 * SSR 가시성 보장(site-renderer/Reveal의 idle→hidden→shown 패턴 참고):
 *  - 서버/첫 페인트 마크업은 항상 보이는 상태(opacity:0 금지) → JS 없어도 콘텐츠·LCP 정상.
 *  - 하이드레이션(mounted) 후에만 motion으로 전환해 뷰포트 진입 시 리빌.
 *  - prefers-reduced-motion: reduce면 모션 없이 즉시 표시.
 * transform·opacity만 사용(CLS 0).
 */
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
