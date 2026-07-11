/**
 * [마케팅] 공유 프리미티브 — CTA 버튼·섹션 헤딩 (라이트 테마).
 * 진단기(#scanner)로 수렴하는 CTA 규약: 메인 href="#scanner", 서브 "/#scanner".
 * CTA는 잉크색(#17181C) 배경 + 흰 텍스트 (골드 배경 버튼 금지 — 고급스러움 원칙).
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function ScannerCta({
  href,
  children,
  variant = 'solid',
}: {
  href: string;
  children: React.ReactNode;
  variant?: 'solid' | 'outline';
}) {
  const base =
    'group inline-flex h-12 items-center gap-2 rounded-xl px-7 text-sm font-semibold transition-all duration-200';
  const cls =
    variant === 'solid'
      ? `${base} bg-[#17181C] text-white hover:-translate-y-px hover:bg-black hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)]`
      : `${base} border border-[#D9D6CE] text-[#17181C] hover:-translate-y-px hover:border-[#17181C]`;
  return (
    <Link href={href} className={cls}>
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function SectionHeading({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-[#17181C] sm:text-3xl">{title}</h2>
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#5C6068]">{subtitle}</p>
      ) : null}
    </div>
  );
}
