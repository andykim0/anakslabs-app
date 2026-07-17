'use client';

/**
 * 밝은 히어로 데이터 필드. 무료 진단의 가독성을 해치지 않으면서 발견 신호를 표현한다.
 * transform/opacity만 움직이며 reduced-motion에서는 정적 배경으로 남는다.
 */
import { useRef, useSyncExternalStore } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function HeroVideo() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const mounted = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerSnapshot);

  // 스크롤 시 영상이 살짝 줄며 가라앉는 시네마틱 전환 (transform/opacity만)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);
  const y = useTransform(scrollYProgress, [0, 1], [0, 40]);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute inset-0 bg-[#F8FBFF]"
        style={mounted && !reduce ? { scale, opacity, y, willChange: 'transform' } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_28%,rgba(8,184,232,.14),transparent_32%),radial-gradient(circle_at_14%_8%,rgba(23,77,218,.08),transparent_28%),radial-gradient(circle_at_88%_76%,rgba(3,209,184,.1),transparent_26%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(36,87,214,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(36,87,214,.055)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />
        <svg viewBox="0 0 1440 820" preserveAspectRatio="none" className="absolute inset-0 h-full w-full opacity-30">
          {[
            'M-80 150 C260 80 340 300 700 210 S1120 40 1520 180',
            'M-80 440 C220 300 470 590 760 420 S1180 230 1520 390',
            'M-80 680 C280 570 430 760 790 630 S1160 500 1520 620',
          ].map((d, i) => (
            <motion.path
              key={d}
              d={d}
              fill="none"
              stroke={i === 1 ? '#03BFA9' : '#2457D6'}
              strokeWidth="1"
              strokeDasharray="7 16"
              animate={reduce ? undefined : { strokeDashoffset: [0, -92] }}
              transition={{ duration: 9 + i * 2, repeat: Infinity, ease: 'linear' }}
            />
          ))}
          {[
            [245, 118], [515, 258], [790, 190], [1040, 292], [1220, 118],
            [330, 492], [690, 460], [980, 535], [1190, 420],
          ].map(([cx, cy], i) => (
            <motion.circle
              key={`${cx}-${cy}`}
              cx={cx}
              cy={cy}
              r={i % 3 === 0 ? 4 : 2.5}
              fill={i % 3 === 0 ? '#03BFA9' : '#2457D6'}
              animate={reduce ? undefined : { opacity: [0.25, 1, 0.25], scale: [0.8, 1.35, 0.8] }}
              transition={{ duration: 3.2, delay: i * 0.27, repeat: Infinity }}
            />
          ))}
        </svg>
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#F8FBFF] to-transparent" />
      </motion.div>
    </div>
  );
}
