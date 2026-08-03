import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@/app/globals.css';
import {
  APP_ROOT_BODY_CLASS_NAME,
  APP_ROOT_HTML_CLASS_NAME,
  APP_ROOT_METADATA,
} from '@/app/root-layout-contract';

export const metadata: Metadata = APP_ROOT_METADATA;

export default function AuthRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={APP_ROOT_HTML_CLASS_NAME}>
      <body suppressHydrationWarning className={APP_ROOT_BODY_CLASS_NAME}>
        {children}
      </body>
    </html>
  );
}
