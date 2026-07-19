'use client';

/**
 * [마케팅] 업종마다 달라지는 사이트 구성을 한 개의 미니 브라우저 안에서 보여준다.
 * 화면은 opacity/scale로만 교차 전환하며, 뷰포트 밖·백그라운드 탭·hover/focus 중에는 멈춘다.
 * reduced-motion에서는 자동 전환 없이 선택한 한 화면을 즉시 표시한다.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const SITES = [
  {
    key: 'cafe',
    label: '카페',
    businessName: '하루의 온도',
    eyebrow: 'MENU · LOCATION',
    title: '오늘의 메뉴와\n오시는 길',
    body: '손님이 먼저 찾는 정보를 첫 화면에.',
    cta: '메뉴 보기',
    accent: '#174DDA',
    accentSoft: '#E8F0FF',
    secondary: '#03A995',
  },
  {
    key: 'clinic',
    label: '치과',
    businessName: '바른결 치과',
    eyebrow: 'CARE · BOOKING',
    title: '진료 안내와\n예약 방법',
    body: '방문 전에 궁금한 내용을 차분하게.',
    cta: '진료 안내',
    accent: '#11658F',
    accentSoft: '#E5F4FA',
    secondary: '#174DDA',
  },
  {
    key: 'academy',
    label: '학원',
    businessName: '다음 수학',
    eyebrow: 'CLASS · COUNSEL',
    title: '수업 과정과\n상담 신청',
    body: '과정과 상담 순서를 한눈에.',
    cta: '과정 보기',
    accent: '#4F46B8',
    accentSoft: '#EEECFF',
    secondary: '#174DDA',
  },
] as const;

type SiteExample = (typeof SITES)[number];

/** 한 화면의 체류와 교차 전환을 한 곳에서 조절한다. */
const SHOWCASE_TIMING = {
  holdMs: 3200,
  transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] as const },
} as const;

function CafeVisual({ site }: { site: SiteExample }) {
  return (
    <div className="relative h-full overflow-hidden rounded-[9px]" style={{ backgroundColor: site.accentSoft }}>
      <div className="absolute -top-4 -right-4 h-16 w-16 rounded-full bg-white/70" />
      <div className="absolute top-3 right-3 h-8 w-8 rounded-full" style={{ backgroundColor: site.secondary, opacity: 0.18 }} />
      <div className="absolute right-2 bottom-2 left-2 grid grid-cols-2 gap-1">
        <div className="h-8 rounded-[6px] border border-white/80 bg-white/75 p-1">
          <div className="h-1 w-5 rounded-full" style={{ backgroundColor: site.accent, opacity: 0.7 }} />
          <div className="mt-1 h-1 w-8 rounded-full bg-[#CBD7E8]" />
        </div>
        <div className="h-8 rounded-[6px] border border-white/80 bg-white/75 p-1">
          <div className="h-1 w-4 rounded-full" style={{ backgroundColor: site.secondary, opacity: 0.75 }} />
          <div className="mt-1 h-1 w-7 rounded-full bg-[#CBD7E8]" />
        </div>
      </div>
    </div>
  );
}

function ClinicVisual({ site }: { site: SiteExample }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[9px] border border-[#D8E7F0] bg-white p-2">
      <div className="flex items-center justify-between">
        <span className="h-5 w-5 rounded-full" style={{ backgroundColor: site.accentSoft }} />
        <span className="h-1.5 w-8 rounded-full bg-[#D7E1EC]" />
      </div>
      <div className="space-y-1">
        {[0.9, 0.68, 0.82].map((width, index) => (
          <div key={width} className="flex items-center gap-1 rounded-[5px] bg-[#F5F9FC] px-1.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: index === 0 ? site.secondary : site.accent, opacity: 0.78 }} />
            <span className="h-1 rounded-full bg-[#AFC3D4]" style={{ width: `${width * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AcademyVisual({ site }: { site: SiteExample }) {
  return (
    <div className="grid h-full grid-cols-[1fr_.72fr] gap-1.5">
      <div className="flex flex-col justify-end rounded-[9px] p-2" style={{ backgroundColor: site.accent }}>
        <span className="h-1 w-7 rounded-full bg-white/55" />
        <span className="mt-1 h-1.5 w-10 rounded-full bg-white/85" />
      </div>
      <div className="grid gap-1.5">
        <div className="rounded-[7px]" style={{ backgroundColor: site.accentSoft }} />
        <div className="rounded-[7px] border border-[#DDE3F3] bg-white" />
      </div>
    </div>
  );
}

function SiteScreen({ site }: { site: SiteExample }) {
  return (
    <div
      className="grid h-full grid-cols-[1.08fr_.92fr] gap-2.5 p-3"
      style={{ background: `linear-gradient(135deg, #FFFFFF 0%, ${site.accentSoft} 145%)` }}
    >
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: site.accent }} />
          <span className="truncate text-[7px] font-bold tracking-[-0.02em] text-[#0B1736]">{site.businessName}</span>
        </div>
        <p className="mt-2 text-[5px] font-semibold tracking-[0.14em]" style={{ color: site.accent }}>
          {site.eyebrow}
        </p>
        <p className="mt-1 whitespace-pre-line text-[12px] leading-[1.08] font-bold tracking-[-0.045em] text-[#0B1736]">
          {site.title}
        </p>
        <p className="mt-1.5 max-w-[94px] text-[6px] leading-[1.45] text-[#647089]">{site.body}</p>
        <span
          className="mt-auto w-fit rounded-full px-2 py-1 text-[5px] font-bold text-white"
          style={{ backgroundColor: site.accent }}
        >
          {site.cta}
        </span>
      </div>
      <div className="min-w-0 py-0.5">
        {site.key === 'cafe' ? <CafeVisual site={site} /> : null}
        {site.key === 'clinic' ? <ClinicVisual site={site} /> : null}
        {site.key === 'academy' ? <AcademyVisual site={site} /> : null}
      </div>
    </div>
  );
}

export function SiteExampleMockup({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [inViewport, setInViewport] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(entry.isIntersecting),
      { rootMargin: '64px 0px', threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === 'visible');
    onVisibilityChange();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (reduce || !inViewport || !pageVisible || pointerPaused || focusPaused) return;
    const id = window.setTimeout(
      () => setActiveIndex((index) => (index + 1) % SITES.length),
      SHOWCASE_TIMING.holdMs,
    );
    return () => window.clearTimeout(id);
  }, [activeIndex, focusPaused, inViewport, pageVisible, pointerPaused, reduce]);

  return (
    <div
      ref={rootRef}
      className={`mx-auto flex h-[168px] w-[236px] flex-col gap-2 ${className ?? ''}`}
      role="group"
      aria-label="업종별 홈페이지 구성 예시"
      data-industry-showcase
      onMouseEnter={() => setPointerPaused(true)}
      onMouseLeave={() => setPointerPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusPaused(false);
      }}
    >
      <div className="overflow-hidden rounded-[14px] border border-[#C9D7EB] bg-white shadow-[0_18px_48px_rgba(23,77,218,0.13)]">
        <div className="flex h-6 items-center gap-1.5 border-b border-[#E4EBF5] bg-[#F8FBFF] px-2.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#AFC2DF]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#C6D5E9]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#D8E3F1]" />
          <span className="ml-1 flex h-3.5 flex-1 items-center rounded-full border border-[#D8E3F1] bg-white px-2 text-[5px] text-[#7C8CA5]">
            daboim.site/industry-demo
          </span>
        </div>
        <div className="relative h-[114px] overflow-hidden" aria-hidden="true">
          {SITES.map((site, index) => {
            const active = activeIndex === index;
            return (
              <motion.div
                key={site.key}
                className="absolute inset-0 origin-center"
                initial={false}
                animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.975 }}
                transition={reduce ? { duration: 0 } : SHOWCASE_TIMING.transition}
              >
                <SiteScreen site={site} />
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="grid h-5 grid-cols-3 gap-1" aria-label="업종 예시 선택">
        {SITES.map((site, index) => {
          const active = activeIndex === index;
          return (
            <button
              key={site.key}
              type="button"
              aria-pressed={active}
              aria-label={`${site.label} 홈페이지 예시 보기`}
              onClick={() => setActiveIndex(index)}
              className={`rounded-full border text-[7px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174DDA] ${
                active
                  ? 'border-[#174DDA] bg-[#E8F0FF] text-[#174DDA]'
                  : 'border-[#D8E3F1] bg-white text-[#718099] hover:border-[#9EB6DA] hover:text-[#174DDA]'
              }`}
            >
              {site.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
