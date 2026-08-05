import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Clinic website delivery',
  description: 'A source-grounded, multi-page clinic website program from Anaks Labs.',
  alternates: { canonical: '/clinic' },
};

const STEPS = [
  ['01', 'Review the clinic source', 'We map the clinic\'s public pages, service information, provider details, and contact paths without inventing missing facts.'],
  ['02', 'Build content-led variants', 'The same verified material is composed into distinct design directions. Empty sections are not manufactured to fill a template.'],
  ['03', 'Approve and publish', 'Your team reviews the complete website before it is published. Unsupported medical claims remain blocked.'],
] as const;

export default function ClinicPage() {
  return (
    <article className="bg-white text-[#16202b]">
      <section className="px-5 py-24 sm:px-8 md:py-32">
        <div className="mx-auto max-w-6xl">
          <p className="mkt-type-eyebrow font-semibold uppercase tracking-[0.14em] text-[#2d63f0]">For clinics</p>
          <h1 className="mkt-type-page-title mt-5 max-w-4xl font-semibold tracking-[-0.055em]">A clinic website that starts with evidence, not filler.</h1>
          <p className="mkt-type-body mt-6 max-w-2xl text-[#545c70]">Anaks Labs rebuilds verified clinic information into clear service pages, provider pathways, structured data, and measurable inquiry routes.</p>
          <Link href="/login" className="mkt-type-control mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-[#2d63f0] px-6 font-semibold text-white">Open your workspace <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </section>
      <section className="bg-[#f4f7fa] px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-3">
          {STEPS.map(([number, title, body]) => (
            <section key={number} className="border-t border-[#cad5df] pt-6">
              <p className="mkt-type-eyebrow font-semibold text-[#2d63f0]">{number}</p>
              <h2 className="mkt-type-card-title mt-5 font-semibold">{title}</h2>
              <p className="mkt-type-body mt-3 text-[#545c70]">{body}</p>
            </section>
          ))}
        </div>
      </section>
      <section className="bg-[#132b3d] px-5 py-16 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-4"><ShieldCheck className="mt-1 h-6 w-6 text-[#8fc8ec]" aria-hidden /><div><h2 className="mkt-type-card-title font-semibold">Medical content stays accountable.</h2><p className="mkt-type-support mt-2 text-white/70">Source provenance and publication guardrails remain active throughout the workflow.</p></div></div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#8fc8ec]"><Check className="h-4 w-4" aria-hidden /> No unsupported claims</div>
        </div>
      </section>
    </article>
  );
}
