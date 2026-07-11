/**
 * [마케팅] 라우트 그룹 공유 레이아웃 — 다크 셸 + 헤더 내비 + 푸터.
 * (marketing)/* 전 페이지가 이 셸을 공유한다. 루트 URL은 그대로(라우트 그룹은 URL에 미반영).
 */
import type { Metadata } from 'next';
import { MarketingHeader } from '@/components/marketing/MarketingHeader';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

// 마케팅 하위 페이지 제목에만 브랜드 접미 (테넌트/대시보드엔 미적용)
export const metadata: Metadata = {
  title: {
    template: '%s | 아낙스랩스',
    default: '아낙스랩스 — 검색과 AI가 찾아오는 홈페이지',
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FDFDFB] text-[#17181C] antialiased">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
