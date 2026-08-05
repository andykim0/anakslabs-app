import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import '@/app/globals.css';
import {
  APP_ROOT_BODY_CLASS_NAME,
  APP_ROOT_HTML_CLASS_NAME,
  APP_ROOT_METADATA,
} from '@/app/root-layout-contract';
import {
  APP_BRAND_BODY_CLASS_NAME,
  APP_BRAND_FONT_CLASS_NAME,
} from '@/app/app-typography';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminQueryProvider } from '@/components/admin/query-provider';
import { isAdmin } from '@/lib/services/auth';

export const metadata: Metadata = {
  ...APP_ROOT_METADATA,
  title: {
    default: "Administrator Console — Anaks Labs",
    template: '%s — Anaks Labs ADMIN',
  },
  robots: { index: false, follow: false },
};

/** /admin 전체 가드 — 관리자가 아니면 로그인으로 보낸다. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await isAdmin();
  if (!admin) redirect('/login?next=/admin');

  return (
    <html lang="en" className={`${APP_ROOT_HTML_CLASS_NAME} ${APP_BRAND_FONT_CLASS_NAME}`}>
      <body suppressHydrationWarning className={`${APP_ROOT_BODY_CLASS_NAME} ${APP_BRAND_BODY_CLASS_NAME}`}>
        <AdminQueryProvider>
          <AdminShell>{children}</AdminShell>
        </AdminQueryProvider>
      </body>
    </html>
  );
}
