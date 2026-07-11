'use client';

/**
 * [마케팅] 공유 헤더 내비 — 로고 | 기능·가격·고객사례 | 로그인.
 * 현재 경로 강조(usePathname). 모바일: 항목 4개라 flex-wrap(별도 JS 훅 없음).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/features', label: '기능' },
  { href: '/pricing', label: '가격' },
  { href: '/cases', label: '고객사례' },
];

export function MarketingHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-900 bg-[#0a0a0b]/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-neutral-100">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#c8a96a] text-[11px] font-black text-neutral-950">
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
                  ? 'font-medium text-[#c8a96a]'
                  : 'text-neutral-400 transition-colors hover:text-neutral-100'
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/login"
          className="ml-auto rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white"
        >
          로그인
        </Link>
      </div>
    </header>
  );
}
