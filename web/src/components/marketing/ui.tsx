/**
 * [마케팅] 공유 프리미티브 — CTA 버튼·섹션 헤딩.
 * 진단기(#scanner)로 수렴하는 CTA 규약: 메인은 href="#scanner", 서브페이지는 "/#scanner".
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** 진단기로 보내는 골드 CTA. href로 메인(#scanner)/서브(/#scanner) 구분 */
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
    'inline-flex h-12 items-center gap-2 rounded-xl px-7 text-sm font-semibold transition-colors';
  const cls =
    variant === 'solid'
      ? `${base} bg-[#c8a96a] text-neutral-950 hover:bg-[#d9bc82]`
      : `${base} border border-neutral-700 text-neutral-100 hover:border-neutral-500`;
  return (
    <Link href={href} className={cls}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

/** 섹션 제목 + 부제 (가운데 정렬) */
export function SectionHeading({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-50 sm:text-3xl">{title}</h2>
      {subtitle ? (
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-neutral-400">{subtitle}</p>
      ) : null}
    </div>
  );
}
