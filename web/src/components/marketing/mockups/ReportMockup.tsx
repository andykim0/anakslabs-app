'use client';

/**
 * [마케팅] 진단 리포트 목업 — SEO/AEO/GEO 점수 링 3개(예시) + 진단 항목.
 * 셀프 데모: 진입 시 링이 0→목표치 차오름 + 숫자 count-up, 항목 순차 체크(once).
 * §정직성: 실 데이터 아님 — "예시 리포트" 캡션 병기.
 * SSR 가시성: 서버/첫 페인트·reduced-motion 시 최종 상태로 그대로 출력(opacity:0 SSR 금지) —
 *   하이드레이션(mounted) 후에만 애니메이션 전환. transform/opacity·stroke만(CLS 0).
 */
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, TriangleAlert, XCircle } from 'lucide-react';

const RINGS = [
  { label: 'SEO', score: 72, color: '#16a34a' },
  { label: 'AEO', score: 45, color: '#b45309' },
  { label: 'GEO', score: 12, color: '#dc2626' },
];

const ITEMS = [
  { icon: <Check className="h-3.5 w-3.5 text-[#16a34a]" />, text: '페이지 제목·설명 존재' },
  { icon: <TriangleAlert className="h-3.5 w-3.5 text-[#b45309]" />, text: 'FAQ 구조화 데이터 없음' },
  { icon: <XCircle className="h-3.5 w-3.5 text-[#dc2626]" />, text: 'AI가 읽을 본문 텍스트 부족' },
  { icon: <XCircle className="h-3.5 w-3.5 text-[#dc2626]" />, text: '사업자·연락 정보 미표기' },
];

const R = 26;
const C = 2 * Math.PI * R;

function Ring({ label, score, color, live }: { label: string; score: number; color: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(score);

  useEffect(() => {
    if (!live) {
      setN(score);
      return;
    }
    if (!inView) {
      setN(0);
      return;
    }
    const c = animate(0, score, { duration: 1, ease: 'easeOut', onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [live, inView, score]);

  const finalOffset = C * (1 - score / 100);
  return (
    <div ref={ref} className="flex flex-col items-center">
      <div className="relative h-[64px] w-[64px]">
        <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" stroke="#EDEBE4" strokeWidth="6" />
          <motion.circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: live ? C : finalOffset }}
            animate={{ strokeDashoffset: finalOffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums"
          style={{ color }}
        >
          {n}
        </span>
      </div>
      <span className="mt-1.5 text-[11px] font-medium text-[#5C6068]">{label}</span>
    </div>
  );
}

export function ReportMockup({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const live = mounted && !reduce; // 서버/첫 페인트·reduced-motion에선 정적(최종 상태)

  return (
    <div
      className={`rounded-2xl border border-[#E8E6E0] bg-white p-5 shadow-[0_10px_34px_rgba(23,24,28,0.07)] ${className ?? ''}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[#17181C]">진단 결과</p>
        <span className="rounded-md bg-[#F3ECD8] px-2 py-0.5 text-[10px] font-medium text-[#7A5E1E]">예시 리포트</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {RINGS.map((r) => (
          <Ring key={r.label} {...r} live={live} />
        ))}
      </div>
      <ul className="mt-4 space-y-2 border-t border-[#EDEBE4] pt-3">
        {ITEMS.map((it, i) => (
          <motion.li
            key={i}
            className="flex items-center gap-2 text-xs text-[#5C6068]"
            initial={live ? { opacity: 0, x: -6 } : false}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: 0.4 + i * 0.15 }}
          >
            {it.icon}
            {it.text}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
