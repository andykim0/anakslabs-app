'use client';

import clsx from 'clsx';
import {
  Clapperboard,
  ClipboardCheck,
  FilePenLine,
  Globe2,
  LayoutDashboard,
  LogOut,
  Newspaper,
  ReceiptText,
  Server,
  ShieldAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { LogoutConfirmDialog } from '@/components/auth/LogoutConfirmDialog';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { logout } from '@/components/dashboard/api';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/clients', label: 'Clients', icon: Users, exact: false },
  { href: '/admin/qa', label: 'QA queue', icon: ClipboardCheck, exact: false },
  { href: '/admin/video-queue', label: 'Video fulfillment', icon: Clapperboard, exact: false },
  { href: '/admin/subscriptions', label: 'Subscriptions & reports', icon: ReceiptText, exact: false },
  { href: '/admin/edit-queue', label: 'Edit requests', icon: FilePenLine, exact: false },
  { href: '/admin/content-queue', label: 'Content approval', icon: Newspaper, exact: false },
  { href: '/admin/us-demos', label: 'Clinic demos', icon: Globe2, exact: false },
  { href: '/admin/infra', label: 'Infrastructure', icon: Server, exact: false },
] as const;

/** 관리자 콘솔 셸 — Anaks Labs 라이트 앱 크롬. ADMIN 표기를 항상 노출한다. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 세션이 이미 없어도 로그인 화면으로 이동
    }
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen w-full bg-[#F6F7F9] text-[#141A3A]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-52 flex-col border-r border-[#DFE1E6] bg-white text-[#475467]">
        <div className="flex flex-col items-start gap-2 px-4 py-4">
          <Link
            href="/admin"
            aria-label="Administrator Dashboard Home"
            className="inline-flex shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D63F0]"
          >
            <BrandLogo />
          </Link>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
            ADMIN
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 pt-1" aria-label="Administrator Menu">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                  active
                    ? 'bg-gradient-to-r from-[#EAEFFE] to-[#F2F5FE] font-semibold text-[#2D63F0] ring-1 ring-inset ring-[#CBD8FB]'
                    : 'text-[#545C70] hover:bg-[#F1F6FC] hover:text-[#141A3A]',
                )}
              >
                <Icon size={15} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[#E8EEF6] px-2 py-3">
          <button
            type="button"
            onClick={() => setConfirmingLogout(true)}
            disabled={loggingOut}
            aria-busy={loggingOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-[#545C70] transition-colors hover:bg-[#F1F6FC] hover:text-[#141A3A] disabled:cursor-wait disabled:opacity-60"
          >
            <LogOut size={15} aria-hidden />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
          <p className="mt-2 flex items-center gap-1.5 px-2.5 text-[11px] text-[#6a7286]">
            <ShieldAlert size={12} aria-hidden />
            Administrator-only console
          </p>
        </div>
      </aside>

      <div className="ml-52 flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex h-11 items-center justify-between border-b border-[#DFE1E6] bg-white/90 px-5 backdrop-blur-xl">
          <p className="text-xs font-medium text-[#6a7286]">
            Internal operating systems — handle customer data with care
          </p>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
            ADMIN
          </span>
        </header>
        <main className="w-full flex-1 px-5 py-5">{children}</main>
      </div>
      <LogoutConfirmDialog
        open={confirmingLogout}
        pending={loggingOut}
        onCancel={() => setConfirmingLogout(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
