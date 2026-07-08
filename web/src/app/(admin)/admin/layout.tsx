import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminQueryProvider } from '@/components/admin/query-provider';
import { isAdmin } from '@/lib/services/auth';

export const metadata: Metadata = {
  title: {
    default: '관리자 콘솔 — 아낙스랩스',
    template: '%s — 아낙스랩스 ADMIN',
  },
  robots: { index: false, follow: false },
};

/** /admin 전체 가드 — 관리자가 아니면 로그인으로 보낸다. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await isAdmin();
  if (!admin) redirect('/login');

  return (
    <AdminQueryProvider>
      <AdminShell>{children}</AdminShell>
    </AdminQueryProvider>
  );
}
