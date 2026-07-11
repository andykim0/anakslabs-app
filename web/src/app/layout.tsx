import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ROOT_DOMAIN } from "@/lib/env";
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
  title: "아낙스랩스 — 검색과 AI가 찾아오는 홈페이지",
  description:
    "검색과 생성형 AI가 읽을 수 있는 사이트를 AI가 처음부터 짓습니다. 무료 SEO·AEO·GEO 진단으로 시작하세요.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
