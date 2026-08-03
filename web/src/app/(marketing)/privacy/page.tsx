import type { Metadata } from 'next';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';

export const metadata: Metadata = {
  title: 'Privacy Notice',
  description: 'Interim Anaks Labs privacy notice for clinic website services and private previews.',
  alternates: { canonical: '/privacy' },
  robots: { index: false },
};

const sections = [
  ['Information we process', 'We process account identifiers, clinic business information, and content that a customer submits or selects for website production. We do not send passwords or payment credentials to content-generation providers.'],
  ['Service delivery', 'Information is used to authenticate accounts, prepare and host clinic websites, support self-service editing, provide reports, and respond to customer requests.'],
  ['External AI processing', 'When a customer explicitly requests an AI-assisted function, selected instructions, business content, images, or documents may be processed by the configured Google or Anthropic service for that request. Provider processing and retention are governed by the applicable provider agreement and settings.'],
  ['PHI-free measurement', 'Website reporting may store aggregate page views and completed action categories. Patient information, form contents, raw IP addresses, raw user-agent strings, and raw referrers are not stored in the reporting event store.'],
  ['Private demo views', 'Expiring private demos may record active time, scroll depth, page slug, device class, and privacy-preserving identifiers to assess demo quality and follow-up timing. Network and user-agent identifiers are derived with versioned HMAC-SHA-256 secrets; raw IP addresses, raw user-agent strings, and patient inquiry data are not stored. Demo-view rows and alerts are retained for up to 90 days. This measurement exception remains subject to final legal review and does not by itself authorize sharing, purchase, or public release.'],
  ['Designated public pages', 'When preparing a private migration proposal, Anaks Labs may review public pages selected for that project. We do not bypass authentication or explicit robots exclusions. Image publication remains gated on the applicable rights and compliance review.'],
] as const;

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mkt-type-page-title font-semibold tracking-tight text-[#17181C]">Privacy Notice</h1>
      <p className="mkt-type-support mt-3 text-[#5C6068]">
        This is an interim product notice pending final legal review. Questions and data requests may be sent to{' '}
        <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#174DDA] hover:underline">{COMPANY_EMAIL}</a>.
      </p>
      <div className="mkt-type-body mt-10 space-y-8 text-[#5C6068]">
        {sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="mkt-type-card-title font-semibold text-[#17181C]">{heading}</h2>
            <p className="mt-2">{body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
