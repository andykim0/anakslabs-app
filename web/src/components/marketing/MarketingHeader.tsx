'use client';

/**
 * [마케팅] 공유 헤더 내비 — 로고 | 기능·가격·고객사례 | 로그인.
 * 현재 경로 강조(usePathname). 스크롤 시 얕은 그림자. 모바일: flex-wrap.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

const NAV = [
  { href: '/features', label: '기능' },
  { href: '/templates', label: '템플릿' },
  { href: '/pricing', label: '가격' },
  { href: '/cases', label: '고객사례' },
  { href: '/faq', label: '자주 묻는 질문' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
        <Link href="/" aria-label={`${PUBLIC_BRAND_NAMES.brand} 홈`} className="shrink-0">
          <BrandLogo />
        </Link>

        <nav aria-label="주요 메뉴" className="mkt-type-control hidden items-center gap-5 md:flex">
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
          {/* CTA가 나타날 때 로그인 버튼이 밀려 CLS가 생기지 않도록 폭을 항상 예약한다. */}
          <div className="hidden w-[100px] shrink-0 sm:block">
            <Link
              href="/#hero-scanner"
              aria-hidden={!showScannerCta}
              tabIndex={showScannerCta ? undefined : -1}
              className={`mkt-type-control inline-flex w-full justify-center rounded-lg bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03BFA9] px-4 py-2 font-semibold text-white transition-[opacity,transform,visibility,box-shadow] duration-300 hover:shadow-[0_8px_22px_rgba(8,175,197,.24)] ${
                showScannerCta
                  ? 'visible translate-y-0 opacity-100'
                  : 'invisible pointer-events-none -translate-y-1 opacity-0'
              }`}
            >
              무료 진단
            </Link>
          </div>
          <Link
            href="/login"
            className="mkt-type-control rounded-lg border border-[#CAD5E5] px-4 py-2 text-[#3F4A5A] transition-colors hover:border-[#174DDA] hover:text-[#174DDA]"
          >
            로그인
          </Link>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-nav"
            aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'}
            onClick={() => setMobileOpen((open) => !open)}
            className="mkt-type-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#CAD5E5] text-[#3F4A5A] md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>
      <nav
        id="marketing-mobile-nav"
        aria-label="모바일 주요 메뉴"
        hidden={!mobileOpen}
        className="mkt-type-control absolute inset-x-0 top-full border-t border-[#DCE4F0] bg-white px-5 py-3 shadow-[0_16px_30px_rgba(11,23,54,0.12)] md:hidden"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              onClick={() => setMobileOpen(false)}
              className={`rounded-lg px-3 py-2.5 text-center font-medium ${
                isActive(item.href) ? 'bg-[#EEF3FF] text-[#174DDA]' : 'text-[#4F5D70]'
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/#hero-scanner"
            onClick={() => setMobileOpen(false)}
            className="col-span-2 mt-1 rounded-lg bg-gradient-to-r from-[#174DDA] via-[#08AFC5] to-[#03BFA9] px-3 py-2.5 text-center font-semibold text-white sm:hidden"
          >
            무료 진단
          </Link>
        </div>
      </nav>
    </header>
  );
}
