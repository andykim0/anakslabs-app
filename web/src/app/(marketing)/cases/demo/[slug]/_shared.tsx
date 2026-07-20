import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  LegalFooter,
  SemanticOutline,
  SiteRenderer,
  TenantHeader,
} from '@/components/site-renderer';
import { findPage } from '@/lib/types/site';
import {
  configForFictionalDemoPreview,
  fictionalDemoForSlug,
  fictionalDemoHref,
  FICTIONAL_DEMO_PROFILES,
} from '@/lib/marketing/fictional-demo-sites';

export function fictionalDemoMetadata(slug: string, pageSlug = ''): Metadata {
  const demo = fictionalDemoForSlug(slug);
  if (!demo) notFound();
  const page = findPage(demo.config, pageSlug);
  if (!page) notFound();
  const profile = FICTIONAL_DEMO_PROFILES[demo.slug];
  return {
    title: `${pageSlug ? `${page.title} · ` : ''}${profile.businessName} — 가상 시네마틱 데모`,
    description: profile.metaDescription,
    robots: { index: false, follow: false },
  };
}

export function FictionalDemoScreen({ slug, pageSlug = '' }: { slug: string; pageSlug?: string }) {
  const demo = fictionalDemoForSlug(slug);
  if (!demo) notFound();
  const page = findPage(demo.config, pageSlug);
  if (!page) notFound();
  const previewConfig = configForFictionalDemoPreview(demo);
  const businessInfo = previewConfig.businessInfo;
  if (!businessInfo) notFound();

  return (
    <article data-fictional-demo-shell className="relative bg-[#F8FBFF]">
      {/* The parent route-group owns the document main. Hide only its marketing chrome so this
          route can demonstrate the same tenant shell without nested main landmarks. */}
      <style>{'.daboim-marketing>header,.daboim-marketing>footer{display:none!important}'}</style>

      <TenantHeader
        config={previewConfig}
        currentSlug={pageSlug}
        hrefForSlug={(targetSlug) => fictionalDemoHref(demo.slug, targetSlug)}
      />
      <aside
        aria-label="가상 데모 안내"
        className="relative z-[40] mx-3 my-3 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-[#174DDA]/15 bg-[#07162D] p-1.5 pl-3 text-white shadow-[0_12px_40px_rgba(7,22,45,.20)] sm:fixed sm:bottom-4 sm:left-4 sm:z-[90] sm:m-0 sm:max-w-[calc(100vw-2rem)] sm:border-white/25 sm:bg-[#07162D]/88 sm:shadow-[0_12px_40px_rgba(7,22,45,.28)] sm:backdrop-blur-xl"
      >
        <span className="mkt-type-eyebrow whitespace-nowrap font-semibold tracking-[0.06em] text-[#7DE7DA]">
          {demo.label}
        </span>
        {pageSlug === '' ? (
          <span className="mkt-type-support hidden whitespace-nowrap text-white/70 sm:inline">
            스크롤해서 영상을 움직여 보세요
          </span>
        ) : null}
        <span className="h-4 w-px bg-white/20" aria-hidden />
        <span className="mkt-type-support hidden whitespace-nowrap text-white/58 lg:inline">
          실제 고객·매장·제품·성과가 아닙니다
        </span>
        <Link
          href="/cases"
          className="mkt-type-control inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 font-semibold text-[#174DDA] transition-colors hover:bg-[#E8F0FF]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="sm:hidden">사례</span>
          <span className="hidden sm:inline">사례 목록</span>
        </Link>
      </aside>

      <SemanticOutline config={previewConfig} pageSlug={pageSlug} />
      <div data-fictional-demo-renderer={demo.slug} data-fictional-demo-page={pageSlug || 'home'}>
        <SiteRenderer
          config={previewConfig}
          pageSlug={pageSlug}
          tier="premium"
          interactive
          animate
        />
      </div>
      <LegalFooter info={businessInfo} theme={previewConfig.theme} disableActions />
    </article>
  );
}
