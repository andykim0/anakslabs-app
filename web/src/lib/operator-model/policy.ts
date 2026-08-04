import type { Site } from '@/lib/types/domain';

export const OPERATOR_PRODUCT_LOCALE = 'en-US' as const;

export type CustomerWorkspaceItem = 'sites' | 'reports' | 'billing' | 'credits' | 'settings';

/** This US-only product passes en-US at its call sites; the locale parameter preserves shared policy contracts. */
export function operatorManagedForLocale(locale: string | undefined): boolean {
  return locale === OPERATOR_PRODUCT_LOCALE;
}

export function selfSignupAllowedForLocale(locale: string | undefined): boolean {
  return !operatorManagedForLocale(locale);
}

export function onboardingAllowedForLocale(locale: string | undefined): boolean {
  return !operatorManagedForLocale(locale);
}

export function customerWorkspaceItemsForLocale(
  locale: string | undefined,
): readonly CustomerWorkspaceItem[] {
  return operatorManagedForLocale(locale)
    ? ['sites', 'reports', 'settings']
    : ['sites', 'reports', 'billing', 'credits', 'settings'];
}

/** A provisioned account without a site is still a US account in this US-only fork. */
export function customerLocaleFromSites(sites: readonly Site[]): string {
  const locale = sites
    .map((site) => site.draftConfig?.meta.locale ?? site.siteConfig?.meta.locale)
    .find((candidate) => Boolean(candidate));
  return locale ?? OPERATOR_PRODUCT_LOCALE;
}
