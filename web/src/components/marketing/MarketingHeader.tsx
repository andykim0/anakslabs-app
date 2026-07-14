'use client';

/**
 * [마케팅] 공유 헤더 내비 — 로고 | 기능·가격·고객사례 | 로그인.
 * 현재 경로 강조(usePathname). 스크롤 시 얕은 그림자. 모바일: flex-wrap.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand/BrandLogo';

const NAV = [
  { href: '/features', label: '기능' },
  { href: '/pricing', label: '가격' },
  { href: '/cases', label: '고객사례' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  // 히어로(진단기)가 화면 밖으로 스크롤되면 헤더에 "무료 진단" 버튼 fade-in (§2)
  const [heroPassed, setHeroPassed] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setHeroPassed(window.scrollY > 480);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const showScannerCta = pathname !== '/' || heroPassed;

  return (
    <header
      className={`sticky top-0 z-40 border-b border-[#DCE4F0] bg-white/88 text-[#0B1736] backdrop-blur-xl transition-shadow ${
        scrolled ? 'shadow-[0_12px_36px_rgba(11,23,54,0.09)]' : ''
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-7 px-5 sm:px-8">
        <Link href="/" aria-label="Daboim 다보임 홈" className="shrink-0">
          <BrandLogo />
        </Link>

        <nav aria-label="주요 메뉴" className="hidden items-center gap-6 text-sm md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={
                isActive(item.href)
                  ? 'font-medium text-[#174DDA]'
                  : 'text-[#5F6B7C] transition-colors hover:text-[#0B1736]'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <AnimatePresence>
            {showScannerCta ? (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
                <Link
                  href="/#hero-scanner"
                  className="rounded-lg bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03BFA9] px-4 py-2 text-sm font-semibold text-white transition-shadow hover:shadow-[0_8px_22px_rgba(8,175,197,.24)]"
                >
                  무료 진단
                </Link>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <Link
            href="/login"
            className="rounded-lg border border-[#CAD5E5] px-4 py-2 text-sm text-[#3F4A5A] transition-colors hover:border-[#174DDA] hover:text-[#174DDA]"
          >
            로그인
          </Link>
        </div>
      </div>
    </header>
  );
}
