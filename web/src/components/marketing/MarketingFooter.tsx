import Link from 'next/link';
import { COMPANY_EMAIL } from '@/lib/marketing/contact';
import { BrandLogo } from '@/components/brand/BrandLogo';

const LINKS = [
  { href: '/clinic', label: 'Clinic websites' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#141a3a] text-white">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div><BrandLogo inverse /><p className="mkt-type-body mt-5 max-w-sm text-white/55">Source-grounded websites for clinics, operated by Anaks Labs.</p></div>
          <div className="mkt-type-control flex flex-wrap content-start gap-x-6 gap-y-3 text-white/55">
            {LINKS.map((item) => <Link key={item.href} href={item.href} className="whitespace-nowrap hover:text-white">{item.label}</Link>)}
            <a href={`mailto:${COMPANY_EMAIL}`} className="hover:text-white">{COMPANY_EMAIL}</a>
          </div>
        </div>
        <div className="mkt-type-support mt-12 border-t border-white/10 pt-5 font-mono tracking-[0.08em] text-white/30">© 2026 ANAKS LABS</div>
      </div>
    </footer>
  );
}
