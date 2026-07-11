'use client';

/**
 * [마케팅] 섹션 아이브로우 — 등장 시 좌측 언더라인 0→100% (§6.7).
 * 텍스트는 움직이지 않음(언더라인만). reduced-motion: 언더라인 즉시 100%.
 */
import { motion, useReducedMotion } from 'framer-motion';

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span
      className={`relative inline-block text-xs font-semibold tracking-[0.2em] text-[#856A26] uppercase ${className ?? ''}`}
    >
      {children}
      <motion.span
        aria-hidden
        className="absolute -bottom-1 left-0 block h-px bg-[#9A7B33]"
        initial={reduce ? { width: '100%' } : { width: 0 }}
        whileInView={{ width: '100%' }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </span>
  );
}
