/**
 * [마케팅] 라우트 그룹 공유 레이아웃 — 다크 셸 + 헤더 내비 + 푸터.
 * (marketing)/* 전 페이지가 이 셸을 공유한다. 루트 URL은 그대로(라우트 그룹은 URL에 미반영).
 */
import type { Metadata } from 'next';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MARKETING_TYPOGRAPHY_VARS } from '@/lib/design/typography-scale';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';
import { clinicAvailability } from '@/lib/industry/clinic-availability';

// 마케팅 하위 페이지 제목에만 브랜드 접미 (테넌트/대시보드엔 미적용)
export const metadata: Metadata = {
  title: {
    template: `%s | ${PUBLIC_BRAND_NAMES.brand}`,
    default: `${PUBLIC_BRAND_NAMES.brandBilingual} — 홈페이지 전문 최적화 AI`,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const clinicAvailable = clinicAvailability().available;
  return (
    <div
      className="daboim-marketing flex min-h-screen flex-col bg-[#F8FBFF] text-[#0B1736] antialiased"
      style={MARKETING_TYPOGRAPHY_VARS}
    >
      <MarketingHeader clinicAvailable={clinicAvailable} />
      <main className="flex-1">{children}</main>
      <MarketingFooter clinicAvailable={clinicAvailable} />
    </div>
  );
}
