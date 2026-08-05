'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Coins, CreditCard, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import type { Tier } from '@/lib/types/domain';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LogoutConfirmDialog } from '@/components/auth/LogoutConfirmDialog';
import { getCredits, logout } from './api';
import { cn, Skeleton, Spinner, TierBadge } from './ui';
import styles from './dashboard-theme.module.css';
import {
  customerWorkspaceItemsForLocale,
  type CustomerWorkspaceItem,
} from '@/lib/operator-model/policy';

const NAV_ITEMS = [
  {
    id: 'sites' as const,
    href: '/dashboard',
    label: 'My sites',
    icon: LayoutDashboard,
    isActive: (path: string) =>
      path === '/dashboard' || path.startsWith('/dashboard/sites') || path.startsWith('/onboarding'),
  },
  {
    id: 'reports' as const,
    href: '/dashboard/reports',
    label: 'Reports',
    icon: BarChart3,
    isActive: (path: string) => path.startsWith('/dashboard/reports'),
  },
  {
    id: 'billing' as const,
    href: '/dashboard/billing',
    label: 'Billing',
    icon: CreditCard,
    isActive: (path: string) => path.startsWith('/dashboard/billing'),
  },
  {
    id: 'settings' as const,
    href: '/dashboard/settings',
    label: 'Settings',
    icon: Settings,
    isActive: (path: string) => path.startsWith('/dashboard/settings'),
  },
];

function CreditBadge() {
  const { data, isPending, isError } = useQuery({ queryKey: ['credits'], queryFn: getCredits });
  return (
    <Link
      href="/dashboard/credits"
      className="flex h-8 items-center gap-1.5 rounded-full border border-[#BBD0FA] bg-[#EAEFFE] px-3 text-xs font-semibold text-[#2D63F0] transition-colors hover:border-[#2D63F0] hover:bg-[#E5EFFF]"
      title="Credit balance"
    >
      <Coins className="h-3.5 w-3.5" />
      {isPending ? <Skeleton className="h-3 w-6 bg-[#C8D8F4]" /> : isError ? '—' : `${data.balance} items`}
    </Link>
  );
}

function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={loading}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[#6a7286] transition-colors hover:bg-[#EAEFFE] hover:text-[#2D63F0] disabled:opacity-60"
        title="Log out"
      >
        {loading ? <Spinner className="h-3.5 w-3.5" /> : <LogOut className="h-3.5 w-3.5" />}
        Log out
      </button>
      <LogoutConfirmDialog
        open={confirming}
        pending={loading}
        onCancel={() => setConfirming(false)}
        onConfirm={handleLogout}
      />
    </>
  );
}

export function DashboardShell({
  clientName,
  tier,
  creditsAvailable,
  locale,
  children,
}: {
  clientName: string;
  tier: Tier;
  creditsAvailable: boolean;
  locale: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const visibleItems = new Set<CustomerWorkspaceItem>(customerWorkspaceItemsForLocale(locale));

  const nav = (
    <nav className="flex gap-1 md:flex-col">
      {NAV_ITEMS.filter((item) => visibleItems.has(item.id)).map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-gradient-to-r from-[#EAEFFE] to-[#F2F5FE] font-semibold text-[#2D63F0] ring-1 ring-inset ring-[#CBD8FB]'
                : 'text-[#545C70] hover:bg-[#F1F6FC] hover:text-[#141A3A]',
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
    <div className="flex min-h-screen flex-col bg-[#F6F7F9] text-[#141A3A]">
      {/* 상단 바 */}
      <header className="sticky top-0 z-40 border-b border-[#DFE1E6] bg-white/90 shadow-[0_1px_0_rgba(20,26,58,0.02)] backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
          <Link
            href="/dashboard"
            aria-label="Dashboard Home"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[#141A3A]"
          >
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2.5">
            {creditsAvailable ? <CreditBadge /> : null}
            <TierBadge tier={tier} />
            <span className="hidden text-xs text-[#6a7286] sm:inline">{clientName}</span>
            <LogoutButton />
          </div>
        </div>
        {/* 모바일 네비 */}
        <div className="overflow-x-auto border-t border-[#E8EEF6] px-2 py-1.5 md:hidden">{nav}</div>
      </header>

      <div className="flex flex-1">
        {/* 사이드바 (데스크톱) */}
        <aside className="hidden w-52 shrink-0 border-r border-[#DFE1E6] bg-white/55 p-3 md:block">
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
