'use client';

import clsx from 'clsx';
import { ClipboardCheck, LayoutDashboard, Server, ShieldAlert, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';

const NAV_ITEMS = [
  { href: '/admin', label: '대시보드', icon: LayoutDashboard, exact: true },
  { href: '/admin/clients', label: '고객', icon: Users, exact: false },
  { href: '/admin/qa', label: 'QA 큐', icon: ClipboardCheck, exact: false },
  { href: '/admin/infra', label: '인프라', icon: Server, exact: false },
] as const;

/** 관리자 콘솔 셸 — 좌측 다크 네비 + 밝은 콘텐츠 영역. ADMIN 표기를 항상 노출한다. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen w-full bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-52 flex-col border-r border-slate-800 bg-slate-950 text-slate-300">
        <div className="flex items-center gap-2 px-4 py-4">
          <BrandLogo inverse />
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
            ADMIN
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 pt-1" aria-label="관리자 메뉴">
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
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200',
                )}
              >
                <Icon size={15} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldAlert size={12} aria-hidden />
            관리자 전용 콘솔
          </p>
        </div>
      </aside>

      <div className="ml-52 flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-20 flex h-11 items-center justify-between border-b border-slate-200 bg-white/90 px-5 backdrop-blur">
          <p className="text-xs font-medium text-slate-500">
            내부 운영 시스템 — 고객 데이터 취급 주의
          </p>
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-white">
            ADMIN
          </span>
        </header>
        <main className="w-full flex-1 px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
