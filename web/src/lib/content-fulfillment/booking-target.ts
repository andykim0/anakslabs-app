/**
 * Where the blog's "book" button sends a reader.
 *
 * The rule: never invent a destination. Every candidate below is something the practice already
 * published on its own site — a button it approved, a page it has, a phone number that cleared
 * `resolvePublicContact` — and the label travels with it. A blog article is the page a stranger
 * lands on from a search result, so a CTA pointing at a booking system this clinic does not use,
 * or a phone number nobody answers, is worse than no CTA at all. When nothing qualifies the
 * template renders no button, which is a supported outcome and not a hole.
 */
import type { SiteConfig } from '@/lib/types/site';
import { resolvePublicContact } from '@/lib/seo/public-contact';

export interface BlogBookingTarget {
  href: string;
  label: string;
  /** Which surface the target came from, for the tests and for the ops doc. */
  source: 'button' | 'phone' | 'page';
}

/**
 * Product-owned English labels, identical to the strings `lib/connectors/catalog.ts` already
 * ships for the same two actions. Used only when the derived target has no label of its own.
 */
const BOOKING_LABEL = 'Book an appointment';
const CALL_LABEL = 'Call the practice';

/** Slugs a practice's own contact page is published under by the newbuild compiler. */
const CONTACT_SLUGS = ['contact', 'appointments', 'appointment', 'booking', 'book'];

function isAbsoluteHttps(href: string): boolean {
  try {
    return new URL(href).protocol === 'https:';
  } catch {
    return false;
  }
}

function isTel(href: string): boolean {
  return /^tel:\+?[0-9][0-9-]{5,}$/u.test(href);
}

function buttonCandidates(config: SiteConfig) {
  return config.pages.flatMap((page) =>
    page.sections
      .filter((section) => !section.hidden)
      .flatMap((section) => section.elements)
      .flatMap((element) => element.kind === 'button'
        ? [{ href: element.href.trim(), label: element.label.trim() }]
        : []));
}

/**
 * The site's own booking destination, or null.
 *
 * Order is deliberate. An external HTTPS button is the practice's real scheduling system and beats
 * everything. A `tel:` button beats a bare phone number because the practice chose to put it on a
 * button. A contact page beats a raw phone number because it is a page the practice maintains.
 * In-page anchors (`#services`) are excluded outright: they do not resolve from `/blog/<slug>`,
 * and a CTA that scrolls nowhere is a broken promise on the page that has to earn the visit.
 */
export function resolveBlogBookingTarget(
  config: SiteConfig,
  hrefForSlug: (slug: string) => string = (slug) => (slug === '' ? '/' : `/${slug}`),
): BlogBookingTarget | null {
  const buttons = buttonCandidates(config);

  const external = buttons.find((button) => isAbsoluteHttps(button.href));
  if (external) {
    return { href: external.href, label: external.label || BOOKING_LABEL, source: 'button' };
  }

  const telButton = buttons.find((button) => isTel(button.href));
  if (telButton) {
    return { href: telButton.href, label: telButton.label || CALL_LABEL, source: 'button' };
  }

  const contactPage = config.pages.find((page) =>
    CONTACT_SLUGS.includes(page.slug.toLowerCase()));
  if (contactPage) {
    return {
      href: hrefForSlug(contactPage.slug),
      label: contactPage.navLabel?.trim() || contactPage.title.trim() || BOOKING_LABEL,
      source: 'page',
    };
  }

  // Last resort: the number the legal/contact surfaces already print on every page of the site.
  const phone = resolvePublicContact(config)?.phone?.trim();
  const compact = phone?.replace(/(?!^\+)[^0-9]/gu, '') ?? '';
  if (phone && compact.replace(/\D/gu, '').length >= 7) {
    return { href: `tel:${compact}`, label: phone, source: 'phone' };
  }
  return null;
}
