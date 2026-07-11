'use client';

/**
 * [마케팅] 업종별 미니 사이트 썸네일 3장(카페·치과·학원)을 겹쳐 배치.
 * hover 시 부채꼴로 펼침, 비호버 시 3초 주기로 맨 앞 카드 교체. transform/opacity만.
 * reduced-motion: 자동 순환 정지 + 펼침만(hover) 유지.
 */
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const SITES = [
  { key: 'cafe', label: '카페', accent: '#8A6A4B', bg: '#F6EEE4' },
  { key: 'clinic', label: '치과', accent: '#3E6E8E', bg: '#E9F0F5' },
  { key: 'academy', label: '학원', accent: '#7A5EA8', bg: '#F0EAF6' },
];

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

  useEffect(() => {
    if (reduce || hover) return;
    const id = window.setInterval(() => setFront((f) => (f + 1) % SITES.length), 3000);
    return () => window.clearInterval(id);
  }, [reduce, hover]);

  // 카드별 위치: hover면 부채꼴로 펼침, 아니면 겹침(front가 맨 앞)
  const transformFor = (i: number) => {
    const rel = (i - front + SITES.length) % SITES.length; // 0=front
    if (hover) {
      const spread = [-118, 0, 118][i];
      const rot = [-7, 0, 7][i];
      return { x: spread, y: 0, rotate: rot, scale: 1, zIndex: 10, opacity: 1 };
    }
    return {
      x: rel * 14,
      y: rel * 10,
      rotate: rel * 4,
      scale: 1 - rel * 0.04,
      zIndex: 10 - rel,
      opacity: 1 - rel * 0.12,
    };
  };

  return (
    <div
      className={`relative mx-auto h-[168px] w-[236px] ${className ?? ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {SITES.map((site, i) => (
        <motion.div
          key={site.key}
          className="absolute inset-x-0 mx-auto h-[150px] w-[188px] shadow-[0_8px_24px_rgba(23,24,28,0.08)]"
          animate={transformFor(i)}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{ top: 8 }}
        >
          <Thumb site={site} />
        </motion.div>
      ))}
    </div>
  );
}
