import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { caseIndustries, casesByIndustry, industryLabelOf } from '@/lib/marketing/cases';
import { CaseCard } from '@/components/marketing/CaseCard';
import { ScannerCta } from '@/components/marketing/ui';

interface Props {
  params: Promise<{ industry: string }>;
}

/** 데이터 파일 기준 정적 생성 — 업종별 검색 유입 페이지 */
export function generateStaticParams() {
  return caseIndustries().map((i) => ({ industry: i.key }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry } = await params;
  const label = industryLabelOf(industry);
  if (!label) return { title: '고객사례 — 아낙스랩스', robots: { index: false } };
  return {
    title: `${label} 홈페이지 제작 사례`,
    description: `${label} 홈페이지 제작 사례 — 검색·AI가 읽을 수 있게 태어난 ${label} 사이트의 구성과 개편 전후를 확인해 보세요.`,
    alternates: { canonical: `/cases/${industry}` },
  };
}

export default async function CaseIndustryPage({ params }: Props) {
  const { industry } = await params;
  const label = industryLabelOf(industry);
  if (!label) notFound();
  const items = casesByIndustry(industry);

  return (
    <>
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-10">
        <Link
          href="/cases"
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 전체 사례
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-neutral-50 sm:text-4xl">
          {label} 홈페이지 제작 사례
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-400">
          {label} 업종에 맞춘 페이지 구성과 개편 전후입니다. 현재는 데모 사례로 구성돼 있습니다.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <CaseCard key={c.slug} item={c} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-50">
          {label} 사이트, 무료 진단부터
        </h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#scanner">내 가게 무료 진단받기</ScannerCta>
        </div>
      </section>
    </>
  );
}
