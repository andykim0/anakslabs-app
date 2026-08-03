export type OnboardingSiteLocale = 'en-US' | 'ko-KR';

export const US_FORM_PUBLICATION_LIMIT_NOTICE =
  'Publishing is currently unavailable while the inquiry form is enabled.';

/**
 * The US fork starts new sites without a first-party inquiry form. An explicit user toggle can
 * still enable it. Missing/KO locale retains the established recommendation-driven default.
 */
export function initialContactFormEnabled(input: {
  locale?: OnboardingSiteLocale;
  recommended: boolean;
  requestedByBrief: boolean;
}): boolean {
  if (input.locale === 'en-US') return false;
  return input.requestedByBrief || input.recommended;
}

export function contactFormPublicationNotice(input: {
  locale?: OnboardingSiteLocale;
  formOn: boolean;
}): string | null {
  return input.locale === 'en-US' && input.formOn
    ? US_FORM_PUBLICATION_LIMIT_NOTICE
    : null;
}
