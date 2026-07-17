'use client';

/**
 * [마케팅] 업종별 미니 사이트 썸네일 3장(카페·치과·학원)을 겹쳐 배치.
 * hover 시 현재 앞 카드를 기준으로 부채꼴로 펼친다. 자동 교대는 hold → depart → hidden reorder
 * 순서로 진행해, 떠나는 카드가 완전히 숨은 뒤에만 정적 z-index를 바꾼다.
 * reduced-motion: 타이머·hover·motion 컴포넌트가 없는 정적 스택.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const SITES = [
  { key: 'cafe', label: '카페', accent: '#8A6A4B', bg: '#F6EEE4' },
  { key: 'clinic', label: '치과', accent: '#3E6E8E', bg: '#E9F0F5' },
  { key: 'academy', label: '학원', accent: '#7A5EA8', bg: '#F0EAF6' },
];

type DeckPhase = 'hold' | 'depart' | 'reorder';
type DeckPose = { x: number; y: number; rotate: number; scale: number; opacity: number };

/** 안무 시간의 단일 진실원 — 카드별 transition에 숫자를 흩뿌리지 않는다. */
const DECK_TIMING = {
  holdMs: 2400,
  departMs: 720,
  reorderMs: 240,
  settleMs: 560,
  ease: [0.22, 1, 0.36, 1] as const,
} as const;

const STACK_POSES = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
  { x: 12, y: 9, rotate: 2, scale: 0.965, opacity: 0.88 },
  { x: 22, y: 16, rotate: 4, scale: 0.93, opacity: 0.76 },
] as const satisfies readonly DeckPose[];

const FAN_POSES = [
  { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 },
  { x: 104, y: 0, rotate: 4, scale: 1, opacity: 1 },
  { x: -104, y: 0, rotate: -4, scale: 1, opacity: 1 },
] as const satisfies readonly DeckPose[];

const DEPARTING_POSE = {
  x: -52,
  y: -5,
  rotate: -3.5,
  scale: 0.98,
  opacity: 0,
} as const satisfies DeckPose;

function Thumb({ site }: { site: (typeof SITES)[number] }) {
  return (
    <div className="h-full w-full overflow-hidden rounded-lg border border-[#E8E6E0] bg-white">
      <div className="flex items-center gap-1 px-2 py-1.5" style={{ backgroundColor: site.bg }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: site.accent }} />
        <span className="text-[9px] font-semibold" style={{ color: site.accent }}>
          {site.label}
        </span>
      </div>
      <div className="space-y-1.5 p-2.5">
        <div className="h-2 w-3/4 rounded" style={{ backgroundColor: site.accent, opacity: 0.85 }} />
        <div className="h-1.5 w-1/2 rounded bg-[#EDEBE4]" />
        <div className="mt-1 grid grid-cols-3 gap-1">
          <div className="h-6 rounded" style={{ backgroundColor: site.bg }} />
          <div className="h-6 rounded" style={{ backgroundColor: site.bg }} />
          <div className="h-6 rounded" style={{ backgroundColor: site.bg }} />
        </div>
      </div>
    </div>
  );
}

export function SiteExampleMockup({ className }: { className?: string }) {
  const reduce = useReducedMotion() ?? false;
  const [front, setFront] = useState(0);
  const [hover, setHover] = useState(false);
  const [phase, setPhase] = useState<DeckPhase>('hold');

  useEffect(() => {
    if (reduce || hover) return;
    if (phase === 'hold') {
      const id = window.setTimeout(() => setPhase('depart'), DECK_TIMING.holdMs);
      return () => window.clearTimeout(id);
    }
    if (phase === 'depart') {
      const id = window.setTimeout(() => {
        // 떠나는 front는 이 시점에 opacity 0이다. 그 뒤에만 front/z-index 순서를 바꾼다.
        setFront((value) => (value + 1) % SITES.length);
        setPhase('reorder');
      }, DECK_TIMING.departMs);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setPhase('hold'), DECK_TIMING.reorderMs);
    return () => window.clearTimeout(id);
  }, [hover, phase, reduce]);

  const relativePosition = (index: number) => (index - front + SITES.length) % SITES.length;

  const poseFor = (index: number): DeckPose => {
    const relative = relativePosition(index);
    if (hover) return FAN_POSES[relative];
    if (phase === 'depart') {
      if (relative === 0) return DEPARTING_POSE;
      // front가 물러나는 동안 나머지 두 카드는 다음 슬롯으로 한 곡선에서 전진한다.
      return STACK_POSES[relative - 1];
    }
    if (phase === 'reorder' && relative === SITES.length - 1) {
      // z-index가 뒤로 바뀐 카드는 rear 좌표까지 보이지 않은 채 이동한다.
      return { ...STACK_POSES[relative], opacity: 0 };
    }
    return STACK_POSES[relative];
  };

  const transitionFor = () => ({
    duration: (phase === 'depart'
      ? DECK_TIMING.departMs
      : phase === 'reorder'
        ? DECK_TIMING.reorderMs
        : DECK_TIMING.settleMs) / 1000,
    ease: DECK_TIMING.ease,
  });

  const onEnter = () => {
    setPhase('hold');
    setHover(true);
  };

  if (reduce) {
    return (
      <div className={`relative mx-auto h-[168px] w-[236px] ${className ?? ''}`}>
        {SITES.map((site, index) => {
          const pose = STACK_POSES[index];
          return (
            <div
              key={site.key}
              className="absolute inset-x-0 mx-auto h-[150px] w-[188px] shadow-[0_8px_24px_rgba(23,24,28,0.08)]"
              style={{
                top: 8,
                zIndex: SITES.length - index,
                opacity: pose.opacity,
                transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rotate}deg) scale(${pose.scale})`,
              }}
            >
              <Thumb site={site} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`relative mx-auto h-[168px] w-[236px] ${className ?? ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={() => setHover(false)}
    >
      {SITES.map((site, i) => (
        <motion.div
          key={site.key}
          className="absolute inset-x-0 mx-auto h-[150px] w-[188px] shadow-[0_8px_24px_rgba(23,24,28,0.08)]"
          initial={false}
          animate={poseFor(i)}
          transition={transitionFor()}
          style={{ top: 8, zIndex: SITES.length - relativePosition(i) }}
        >
          <Thumb site={site} />
        </motion.div>
      ))}
    </div>
  );
}
