import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ROOT_DOMAIN } from "@/lib/env";
import { PUBLIC_BRAND_NAMES } from "@/lib/brand/public-names";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 브랜드 기본 메타 (기존 "Create Next App" 교체). 여기엔 title.template을 두지 않는다 —
// 테넌트 서빙(/s/*)이 자체 title을 그대로 쓰도록. 마케팅 접미 브랜딩은 (marketing)/layout.
export const metadata: Metadata = {
  metadataBase: new URL(`https://${ROOT_DOMAIN}`),
  applicationName: PUBLIC_BRAND_NAMES.brand,
  title: `${PUBLIC_BRAND_NAMES.brandBilingual} — 홈페이지 전문 최적화 AI`,
  description:
    `${PUBLIC_BRAND_NAMES.brand}이 업종에 맞는 홈페이지를 AI로 설계하고 SEO·AEO·GEO 기반부터 호스팅·관리까지 제공합니다. 무료 홈페이지 진단으로 시작하세요.`,
  category: "AI website builder",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
