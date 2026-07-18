import type { Metadata } from 'next';
import Link from 'next/link';
import { CASES, caseIndustries } from '@/lib/marketing/cases';
import { CaseCard } from '@/components/marketing/CaseCard';
import { ScannerCta } from '@/components/marketing/ui';
import { SiteExampleMockup } from '@/components/marketing/mockups/SiteExampleMockup';

export const metadata: Metadata = {
  title: '고객사례 — 업종별 홈페이지 제작 사례',
  description:
    '음식점·병원·학원·뷰티 등 업종마다 손님이 먼저 찾는 정보를 어떻게 홈페이지에 담는지 데모 사례로 확인해 보세요.',
  alternates: { canonical: '/cases' },
};

export default function CasesPage() {
  const industries = caseIndustries();
  return (
    <>
      <section className="mx-auto max-w-5xl px-6 pt-16 pb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[#17181C] sm:text-4xl">고객사례</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5C6068]">
          업종별로 어떤 구조의 사이트가 만들어지는지 살펴보세요. 현재는 데모 사례로 구성돼 있습니다.
        </p>
        <div className="mt-10 flex justify-center">
          <SiteExampleMockup />
        </div>
      </section>

      {/* 업종 필터 (링크형 — 업종별 페이지로 이동) */}
      <section className="mx-auto max-w-5xl px-6">
        <div className="flex flex-wrap justify-center gap-2">
          <span className="rounded-lg border border-[#E4D9BF] bg-[#F3ECD8] px-3 py-1.5 text-xs font-medium text-[#7A5E1E]">
            전체 {CASES.length}
          </span>
          {industries.map((ind) => (
            <Link
              key={ind.key}
              href={`/cases/${ind.key}`}
              className="rounded-lg border border-[#E8E6E0] px-3 py-1.5 text-xs text-[#5C6068] transition-colors hover:border-[#17181C] hover:text-[#17181C]"
            >
              {ind.label} {ind.count}
            </Link>
          ))}
        </div>
      </section>

      {/* 카드 그리드 */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CASES.map((c) => (
            <CaseCard key={c.slug} item={c} />
          ))}
        </div>
        <p className="mt-8 text-center text-[11px] text-[#696E76]">
          실고객 사례와 성과 지표는 실측이 확보되는 대로 데모를 대체합니다.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-[#17181C]">
          내 업종은 어떻게 나올까요?
        </h2>
        <div className="mt-8 flex justify-center">
          <ScannerCta href="/#hero-scanner">무료 진단으로 시작</ScannerCta>
        </div>
      </section>
    </>
  );
}
