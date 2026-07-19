import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SiteRenderer } from '@/components/site-renderer';
import {
  FICTIONAL_DEMO_PROFILES,
  FICTIONAL_DEMO_SLUGS,
  fictionalDemoForSlug,
} from '@/lib/marketing/fictional-demo-sites';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FICTIONAL_DEMO_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const demo = fictionalDemoForSlug(slug);
  if (!demo) notFound();
  const profile = FICTIONAL_DEMO_PROFILES[demo.slug];
  return {
    title: `${profile.businessName} — 가상 시네마틱 데모`,
    description: profile.metaDescription,
    robots: { index: false, follow: false },
  };
}

export default async function FictionalDemoPage({ params }: Props) {
  const { slug } = await params;
  const demo = fictionalDemoForSlug(slug);
  if (!demo) notFound();

  return (
    <article className="bg-[#F8FBFF]">
      <header className="border-b border-[#DCE4F0] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mkt-type-eyebrow font-semibold tracking-[0.08em] text-[#174DDA]">
              {demo.label}
            </p>
            <h1 className="mkt-type-card-title mt-1 font-semibold text-[#0B1736]">
              {demo.survey.businessName} · {FICTIONAL_DEMO_PROFILES[demo.slug].motionLabel}
            </h1>
            <p className="mkt-type-support mt-1 text-[#66728A]">
              실제 고객·매장·제품·성과가 아닌, 다보임 연출을 설명하기 위한 코드 소유 데모입니다.
            </p>
          </div>
          <Link
            href="/cases"
            className="mkt-type-control inline-flex items-center gap-1.5 rounded-full border border-[#C9D7EB] px-4 py-2 font-semibold text-[#174DDA] transition-colors hover:bg-[#E8F0FF]"
          >
            <ArrowLeft className="h-4 w-4" />
            사례 목록
          </Link>
        </div>
      </header>

      <div data-fictional-demo-renderer={demo.slug}>
        <SiteRenderer
          config={demo.config}
          tier="premium"
          interactive={false}
          animate
        />
      </div>
    </article>
  );
}
