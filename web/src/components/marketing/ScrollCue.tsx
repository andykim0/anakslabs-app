'use client';

/**
 * [마케팅] 히어로 하단 스크롤 유도 표시 — 골드 ChevronDown, 2초 주기 부드러운 bounce.
 * transform만(CLS 0). reduced-motion: 정지(정적 표시). 장식이라 aria-hidden.
 */
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export function ScrollCue() {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center text-[#9A7B33]"
      animate={reduce ? undefined : { y: [0, 8, 0] }}
      transition={reduce ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <ChevronDown className="h-6 w-6" />
    </motion.div>
  );
}
