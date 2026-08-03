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
  title: `${PUBLIC_BRAND_NAMES.brand} — Clinic website operations`,
  description:
    'Anaks Labs builds and operates source-grounded, multi-page websites for clinics.',
  category: 'Clinic website platform',
};
