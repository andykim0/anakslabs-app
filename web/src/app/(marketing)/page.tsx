import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, FileSearch, LayoutTemplate, ShieldCheck } from 'lucide-react';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

export const metadata: Metadata = {
  title: `${PUBLIC_BRAND_NAMES.brand} — Clinic websites built from your real content`,
  description:
    'Anaks Labs turns a clinic\'s verified content into a fast, structured website with clear service pages, measurable inquiries, and ongoing publishing support.',
  alternates: { canonical: '/' },
};

const DELIVERABLES = [
  'A complete multi-page clinic website',
  'Eight AEO and GEO-focused articles every month',
  'PHI-free inquiry and booking-path measurement',
  'Hosting, maintenance, and self-editing tools',
] as const;

export default function MarketingHome() {
  return (
    <article className="bg-[#f7f9fb] text-[#13202c]">
      <section className="relative overflow-hidden border-b border-[#dce4eb] bg-white px-5 py-24 sm:px-8 md:py-32">
        <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.08fr_.92fr] lg:items-center">
          <div>
            <p className="mkt-type-eyebrow font-semibold uppercase tracking-[0.14em] text-[#1466a5]">
              Clinic website operations
            </p>
            <h1 className="mkt-type-page-title mt-5 max-w-4xl font-semibold tracking-[-0.055em]">
              Your clinic’s real expertise, organized into a website patients can use.
            </h1>
            <p className="mkt-type-body mt-6 max-w-2xl text-[#586571]">
              We preserve your verified services, provider details, locations, and policies, then rebuild the information into clear pages for patients and search systems. No invented claims and no empty template sections.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="mkt-type-control inline-flex h-12 items-center gap-2 rounded-md bg-[#1466a5] px-6 font-semibold text-white">
                Open your workspace <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/clinic" className="mkt-type-control inline-flex h-12 items-center rounded-md border border-[#b9c7d2] px-6 font-semibold text-[#243443]">
                See how it works
              </Link>
            </div>
          </div>
          <div className="grid gap-4 border border-[#dce4eb] bg-[#f4f7fa] p-7 sm:grid-cols-2">
            {[
              { icon: FileSearch, title: 'Source-grounded', body: 'Every factual block remains tied to its source.' },
              { icon: LayoutTemplate, title: 'Content-led', body: 'The pages and layouts follow the material you have.' },
              { icon: ShieldCheck, title: 'Medical guardrails', body: 'Unsupported claims fail closed before publication.' },
              { icon: Check, title: 'Operational', body: 'Hosting, edits, reporting, and publishing stay in one system.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="border-t border-[#cbd6df] pt-5">
                <Icon className="h-5 w-5 text-[#1466a5]" aria-hidden />
                <h2 className="mkt-type-card-title mt-4 font-semibold">{title}</h2>
                <p className="mkt-type-support mt-2 text-[#65717c]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#132b3d] px-5 py-20 text-white sm:px-8 md:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="mkt-type-eyebrow font-semibold uppercase tracking-[0.14em] text-[#8fc8ec]">Enterprise delivery</p>
            <h2 className="mkt-type-section-title mt-4 font-semibold tracking-[-0.045em]">One accountable clinic website program.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {DELIVERABLES.map((item) => (
              <div key={item} className="flex gap-3 border-t border-white/15 py-4">
                <Check className="mt-1 h-4 w-4 shrink-0 text-[#8fc8ec]" aria-hidden />
                <span className="mkt-type-body text-white/82">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
