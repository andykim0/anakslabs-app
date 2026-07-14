'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, CreditCard, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import type { Tier } from '@/lib/types/domain';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { getCredits, logout } from './api';
import { cn, Skeleton, Spinner, TierBadge } from './ui';
import styles from './dashboard-theme.module.css';

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: '내 사이트',
    icon: LayoutDashboard,
    isActive: (path: string) =>
      path === '/dashboard' || path.startsWith('/dashboard/sites') || path.startsWith('/onboarding'),
  },
  {
    href: '/dashboard/credits',
    label: '크레딧',
    icon: Coins,
    isActive: (path: string) => path.startsWith('/dashboard/credits'),
  },
  {
    href: '/dashboard/billing',
    label: '결제·구독',
    icon: CreditCard,
    isActive: (path: string) => path.startsWith('/dashboard/billing'),
  },
  {
    href: '/dashboard/settings',
    label: '설정',
    icon: Settings,
    isActive: (path: string) => path.startsWith('/dashboard/settings'),
  },
];

function CreditBadge() {
  const { data, isPending, isError } = useQuery({ queryKey: ['credits'], queryFn: getCredits });
  return (
    <Link
      href="/dashboard/credits"
      className="flex h-8 items-center gap-1.5 rounded-full border border-[#BBD0FA] bg-[#EDF4FF] px-3 text-xs font-semibold text-[#174DDA] transition-colors hover:border-[#174DDA] hover:bg-[#E5EFFF]"
      title="크레딧 잔액"
    >
      <Coins className="h-3.5 w-3.5" />
      {isPending ? <Skeleton className="h-3 w-6 bg-[#C8D8F4]" /> : isError ? '—' : `${data.balance}개`}
    </Link>
  );
}

function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const handleLogout = async () => {
    setLoading(true);
    try {
      await logout();
    } catch {
      // 세션이 이미 없어도 로그인 화면으로 이동
    }
    window.location.href = '/login';
  };
  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[#667085] transition-colors hover:bg-[#EDF4FF] hover:text-[#174DDA] disabled:opacity-60"
      title="로그아웃"
    >
      {loading ? <Spinner className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
      로그아웃
    </button>
  );
}

export function DashboardShell({
  clientName,
  tier,
  children,
}: {
  clientName: string;
  tier: Tier;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const nav = (
    <nav className="flex gap-1 md:flex-col">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-gradient-to-r from-[#EDF4FF] to-[#EAFBF7] font-semibold text-[#174DDA] ring-1 ring-inset ring-[#C9DDF7]'
                : 'text-[#5F6B7C] hover:bg-[#F1F6FC] hover:text-[#0B1736]',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F8FBFF] text-[#0B1736]">
      {/* 상단 바 */}
      <header className="sticky top-0 z-40 border-b border-[#DCE4F0] bg-white/90 shadow-[0_1px_0_rgba(11,23,54,0.02)] backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#0B1736]"
          >
            <BrandLogo />
          </button>
          <div className="flex items-center gap-2.5">
            <CreditBadge />
            <TierBadge tier={tier} />
            <span className="hidden text-xs text-[#667085] sm:inline">{clientName}님</span>
            <LogoutButton />
          </div>
        </div>
        {/* 모바일 네비 */}
        <div className="overflow-x-auto border-t border-[#E8EEF6] px-2 py-1.5 md:hidden">{nav}</div>
      </header>

      <div className="flex flex-1">
        {/* 사이드바 (데스크톱) */}
        <aside className="hidden w-52 shrink-0 border-r border-[#DCE4F0] bg-white/55 p-3 md:block">
          <div className="sticky top-[68px]">{nav}</div>
        </aside>
        <main
          className={cn(
            'min-w-0 flex-1 px-4 py-6 md:px-8',
            pathname.startsWith('/dashboard') && !pathname.endsWith('/editor') && styles.theme,
          )}
        >
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
