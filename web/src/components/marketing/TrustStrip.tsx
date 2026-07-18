'use client';

/**
 * [마케팅] 히어로 아래 신뢰 지표 스트립 — 실제 제공 기능 기반 (§4 정직성 가드).
 * 성과 수치(노출·순위 등) 금지 — 제품 사실만: 무료 진단, AI 디자인 3안, 코딩 0, 즉시 호스팅.
 * 숫자는 진입 시 count-up(0.8s, once). reduced-motion: 최종값 즉시.
 *
 * TODO(사용자 제공): 실측 성과 지표(예: 평균 진단 소요, 발행까지 시간)는 데이터 확보 후
 *   여기에 "예시" 병기와 함께 추가. 현재는 실측 없는 수치를 넣지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: 30, suffix: '초', label: '무료 진단' },
  { value: 3, suffix: '안', label: 'AI 디자인 후보' },
  { value: 0, suffix: '', label: '필요한 코딩' },
];

function CountUp({ to, reduce }: { to: number; reduce: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce || !inView) return;
    const c = animate(0, to, { duration: 0.8, ease: 'easeOut', onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, to, reduce]);
  return <span ref={ref}>{reduce ? to : n}</span>;
}

export function TrustStrip() {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-3 gap-4 border-y border-[#E8E6E0] py-6 sm:gap-8">
      {STATS.map((s) => (
        <div key={s.label} className="text-center">
          <p className="text-2xl font-semibold tracking-tight text-[#17181C] tabular-nums sm:text-3xl">
            <CountUp to={s.value} reduce={reduce} />
            <span className="text-[#856A26]">{s.suffix}</span>
          </p>
          <p className="mkt-type-support mt-1 text-[#5C6068]">{s.label}</p>
        </div>
      ))}
      <div className="col-span-3 text-center sm:col-span-3">
        <p className="mkt-type-support text-[#696E76]">서브도메인 · SSL 즉시 호스팅 포함</p>
      </div>
    </div>
  );
}
