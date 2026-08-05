'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

const NAV = [{ href: '/clinic', label: 'Clinic websites' }] as const;

export function MarketingHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={`sticky top-0 z-40 border-b border-[#dfe1e6] bg-white/92 text-[#141a3a] backdrop-blur-xl transition-shadow ${scrolled ? 'shadow-[0_12px_36px_rgba(19,32,44,0.08)]' : ''}`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-8 px-5 sm:px-8">
        <Link href="/" aria-label={`${PUBLIC_BRAND_NAMES.brand} home`} className="shrink-0"><BrandLogo /></Link>
        <nav aria-label="Primary navigation" className="mkt-type-control hidden items-center gap-6 md:flex">
          {NAV.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} className={isActive(item.href) ? 'font-semibold text-[#2d63f0]' : 'text-[#545c70] hover:text-[#141a3a]'}>{item.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="mkt-type-control rounded-md border border-[#d9dae0] px-4 py-2 text-[#232c52] hover:border-[#2d63f0] hover:text-[#2d63f0]">Sign in</Link>
          <button type="button" aria-expanded={mobileOpen} aria-controls="marketing-mobile-nav" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen((open) => !open)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#d9dae0] text-[#232c52] md:hidden">{mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}</button>
        </div>
      </div>
      <nav id="marketing-mobile-nav" aria-label="Mobile navigation" hidden={!mobileOpen} className="absolute inset-x-0 top-full border-t border-[#dfe1e6] bg-white px-5 py-3 shadow-lg md:hidden">
        {NAV.map((item) => <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-3 font-medium text-[#232c52]">{item.label}</Link>)}
      </nav>
    </header>
  );
}
