'use client';

/**
 * [마케팅] 공유 헤더 내비 — 로고 | 기능·가격·고객사례 | 로그인.
 * 현재 경로 강조(usePathname). 스크롤 시 얕은 그림자. 모바일: flex-wrap.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/features', label: '기능' },
  { href: '/pricing', label: '가격' },
  { href: '/cases', label: '고객사례' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-[#E8E6E0] bg-white/80 backdrop-blur-sm transition-shadow ${
        scrolled ? 'shadow-[0_1px_3px_rgba(0,0,0,0.06)]' : ''
      }`}
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#17181C]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#9A7B33] text-[11px] font-black text-white">
            A
          </span>
          아낙스랩스
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={
                isActive(item.href)
                  ? 'font-medium text-[#856A26]'
                  : 'text-[#5C6068] transition-colors hover:text-[#17181C]'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="ml-auto rounded-lg border border-[#D9D6CE] px-4 py-2 text-sm text-[#17181C] transition-colors hover:border-[#17181C]"
        >
          로그인
        </Link>
      </div>
    </header>
  );
}
