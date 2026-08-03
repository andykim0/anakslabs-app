import type { Metadata } from 'next';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';

export const metadata: Metadata = {
  title: 'Service Terms',
  description: 'Interim Anaks Labs clinic website service terms.',
  alternates: { canonical: '/terms' },
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">Service Terms</h1>
      <p className="mkt-type-support mt-3 text-[#5C6068]">
        These interim terms summarize the current product boundary while final terms and live Stripe checkout remain disabled. Questions may be sent to{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#174DDA] hover:underline">{COMPANY_EMAIL}</a>.
      </p>
      <div className="mkt-type-body mt-10 space-y-8 text-[#5C6068]">
        <section>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">Enterprise service</h2>
          <p className="mt-2">The current contract is $990 setup and $990 per month for one clinic website. It includes hosting and maintenance, self-service editing, monthly reporting, eight AEO/GEO blog posts per month, and PHI-free inquiry and booking action tracking.</p>
        </section>
        <section>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">Customer content</h2>
          <p className="mt-2">The customer retains rights in content it supplies and is responsible for having the rights and permissions needed to publish it. Anaks Labs retains rights in its platform, renderer, data structures, and service software.</p>
        </section>
        <section>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">Static export boundary</h2>
          <p className="mt-2">A static export reproduces publish-time HTML, CSS, and eligible image assets. Hosting, reporting, managed optimization, and server-backed editing are service functions and are not part of a static export.</p>
        </section>
        <section>
          <h2 className="mkt-type-card-title font-semibold text-[#17181C]">Payments and cancellation</h2>
          <p className="mt-2">Live payment is not enabled. Renewal, cancellation, tax, and refund terms will be presented consistently in the final agreement and verified Stripe checkout before any charge is made.</p>
        </section>
      </div>
    </section>
  );
}
