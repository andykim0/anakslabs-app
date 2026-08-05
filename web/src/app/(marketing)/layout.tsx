/**
 * [마케팅] 라우트 그룹 공유 레이아웃 — 다크 셸 + 헤더 내비 + 푸터.
 * (marketing)/* 전 페이지가 이 셸을 공유한다. 루트 URL은 그대로(라우트 그룹은 URL에 미반영).
 */
import type { Metadata } from 'next';
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
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING_TYPOGRAPHY_VARS } from '@/lib/design/typography-scale';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

// 마케팅 하위 페이지 제목에만 브랜드 접미 (테넌트/대시보드엔 미적용)
export const metadata: Metadata = {
  ...APP_ROOT_METADATA,
  title: {
    template: `%s | ${PUBLIC_BRAND_NAMES.brand}`,
    default: `${PUBLIC_BRAND_NAMES.brand} — Clinic website operations`,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${APP_ROOT_HTML_CLASS_NAME} ${APP_BRAND_FONT_CLASS_NAME}`}>
      <body suppressHydrationWarning className={`${APP_ROOT_BODY_CLASS_NAME} ${APP_BRAND_BODY_CLASS_NAME}`}>
        <div
          className="anakslabs-marketing flex min-h-screen flex-col bg-[#F6F7F9] text-[#141A3A] antialiased"
          style={MARKETING_TYPOGRAPHY_VARS}
        >
          <MarketingHeader />
          <main className="flex-1">{children}</main>
          <MarketingFooter />
        </div>
      </body>
    </html>
  );
}
