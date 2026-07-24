import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { GUARANTEE_CRITERIA_COPY, GUARANTEE_MARKETING_COPY } from '@/lib/guarantee';
import { guaranteeProgramEnabled } from '@/lib/guarantee/flags';

export function GuaranteeBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  if (!guaranteeProgramEnabled()) return null;
  const dark = tone === 'dark';
  return (
    <div
      data-guarantee-badge
      className={dark
        ? 'mt-6 rounded-2xl border border-[#5DE0D0]/30 bg-[#5DE0D0]/8 p-4'
        : 'mt-6 rounded-2xl border border-[#A8DDE2] bg-[#EAFBF7] p-4'}
    >
      <p className={`mkt-type-body flex items-start gap-2 font-semibold ${dark ? 'text-white' : 'text-[#0B1736]'}`}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#03A995]" aria-hidden />
        <span>{GUARANTEE_MARKETING_COPY}</span>
      </p>
      <p className={`mkt-type-support mt-2 ${dark ? 'text-white/58' : 'text-[#526174]'}`}>
        {GUARANTEE_CRITERIA_COPY}{' '}
        <Link href="/guarantee" className={`font-semibold underline underline-offset-2 ${dark ? 'text-[#5DE0D0]' : 'text-[#174DDA]'}`}>
          보장 조건 보기
        </Link>
      </p>
    </div>
  );
}
