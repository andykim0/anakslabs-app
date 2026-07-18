/**
 * [마케팅] 공유 푸터 — 회사소개·고객센터·이용약관·개인정보처리방침·이메일·저작권.
 * 순수 링크(서버 컴포넌트). 라이트: #F6F5F1 배경 · #5C6068 텍스트.
 */
import Link from 'next/link';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';
import { BrandLogo } from '@/components/brand/BrandLogo';

const LINKS = [
  { href: '/about', label: '회사소개' },
  { href: '/faq', label: '고객센터' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/8 bg-[#0B1736] text-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div>
            <BrandLogo inverse />
            <p className="mkt-type-body mt-5 max-w-sm text-white/52">
              검색과 AI가 읽을 수 있게, Daboim.
              <br />업종 설계부터 최적화·호스팅까지 하나로.
            </p>
            <p className="mkt-type-eyebrow mt-4 font-mono tracking-[0.12em] text-[#5DE0D0]">A PRODUCT BY ANAKS LABS</p>
          </div>
          <div className="mkt-type-control flex max-w-xl flex-wrap content-start gap-x-6 gap-y-3 text-white/52">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </Link>
            ))}
            <a href={`mailto:${COMPANY_EMAIL}`} className="transition-colors hover:text-white">
              {COMPANY_EMAIL}
            </a>
          </div>
        </div>
        <div className="mkt-type-support mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-5 font-mono tracking-[0.08em] text-white/30">
          <p>© 2026 ANAKS LABS · DABOIM</p>
          <p>SEO · AEO · GEO · WEBSITE GENERATION</p>
        </div>
      </div>
    </footer>
  );
}
