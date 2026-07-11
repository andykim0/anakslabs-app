/**
 * [마케팅] 공유 푸터 — 회사소개·고객센터·이용약관·개인정보처리방침·이메일·저작권.
 * 순수 링크(서버 컴포넌트). 법적 문구는 별도 페이지(약관/개인정보)에서 상수 재사용.
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
    <footer className="border-t border-neutral-900">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-neutral-300">
              {l.label}
            </Link>
          ))}
          <a href={`mailto:${COMPANY_EMAIL}`} className="transition-colors hover:text-neutral-300">
            {COMPANY_EMAIL}
          </a>
        </div>
        <p className="mt-4 text-xs text-neutral-700">© 2026 아낙스랩스 (Anaks Labs)</p>
      </div>
    </footer>
  );
}
