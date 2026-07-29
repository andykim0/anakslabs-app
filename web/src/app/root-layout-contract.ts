import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import { ROOT_DOMAIN } from '@/lib/env';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const APP_ROOT_HTML_CLASS_NAME =
  `${geistSans.variable} ${geistMono.variable} h-full antialiased`;

export const APP_ROOT_BODY_CLASS_NAME = 'min-h-full flex flex-col';

// Each route-group root inherits the metadata that lived in app/layout.tsx.
// Marketing may replace only the title with its existing template.
export const APP_ROOT_METADATA: Metadata = {
  metadataBase: new URL(`https://${ROOT_DOMAIN}`),
  applicationName: PUBLIC_BRAND_NAMES.brand,
  title: `${PUBLIC_BRAND_NAMES.brandBilingual} — 홈페이지 전문 최적화 AI`,
  description:
    `${PUBLIC_BRAND_NAMES.brand}이 업종에 맞는 홈페이지를 AI로 설계하고 SEO·AEO·GEO 기반부터 호스팅·관리까지 제공합니다. 무료 홈페이지 진단으로 시작하세요.`,
  category: 'AI website builder',
};
