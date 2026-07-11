/**
 * [마케팅] 공유 푸터 — 회사소개·고객센터·이용약관·개인정보처리방침·이메일·저작권.
 * 순수 링크(서버 컴포넌트). 라이트: #F6F5F1 배경 · #5C6068 텍스트.
 */
import Link from 'next/link';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';

const LINKS = [
  { href: '/about', label: '회사소개' },
  { href: '/faq', label: '고객센터' },
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-[#E8E6E0] bg-[#F6F5F1]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#5C6068]">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-[#17181C]">
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${COMPANY_EMAIL}`} className="transition-colors hover:text-[#17181C]">
            {COMPANY_EMAIL}
          </a>
        </div>
        <p className="mt-4 text-xs text-[#696E76]">© 2026 아낙스랩스 (Anaks Labs)</p>
      </div>
    </footer>
  );
}
