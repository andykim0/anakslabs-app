/**
 * US customer-facing legal notices remain unavailable until counsel approves final language.
 * These status messages are not contractual terms and must not be presented as such.
 */
export const US_LEGAL_NOTICES_REVIEWED = false as const;

export const DYNAMIC_FEATURE_NOTICE =
  'Subscription and export terms are pending counsel review and are not available for publication.';

export const HOSTING_ONLY_FOOTNOTE =
  'Hosting and export terms are pending counsel review.';

export const PAYMENT_CONSENT_LABEL =
  'Payment terms are pending counsel review. Live payment is unavailable.';

export const EXPORT_NOTICE_HEADING = 'Export terms pending review';

export const OWNERSHIP_SUMMARY =
  'Ownership terms are pending counsel review and are not available for publication.';

export const REFUND_NOTICE =
  'Refund and renewal terms are pending counsel review. Live payment is unavailable.';

/**
 * Educational disclaimer carried by every published content post.
 *
 * Fixed text with one slot, never AI-generated: this is the sentence that tells a reader the
 * article is not clinical advice, and a model paraphrasing it could weaken exactly the clause
 * that matters. The wording stays industry-neutral because the content pipeline classifies these
 * businesses generically as medical — naming a specialty here would assert something the site
 * data does not establish.
 */
export function contentPostEducationalNotice(businessName: string): string {
  const name = businessName.trim() || 'this clinic';
  return `This article is general information provided by ${name} and is not a substitute for `
    + 'professional medical advice. For questions about your own care, contact the clinic.';
}
