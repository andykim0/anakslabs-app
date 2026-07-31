const CTA_HEADING_RE =
  /^(?:ready to\b|book\b|schedule\b|request (?:an? )?appointment\b|call (?:us|today|now)\b|contact us\b|get started\b|find out\b)|\b(?:call now|call us)\b/iu;
const PHONE_TOKEN_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/u;
const EMAIL_TOKEN_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const OPENING_HOURS_TOKEN_RE =
  /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b[^.]{0,80}\b(?:am|pm|closed)\b/iu;
const HOURS_LABEL_RE = /\b(?:office|opening|business)\s+hours?\s*:/iu;
const ADDRESS_TOKEN_RE =
  /\b\d{2,6}\s+[A-Z0-9][^,\n]{2,80},?\s+(?:Los Angeles|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b[^.\n]{0,50}\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/u;

/**
 * Locale-neutral layout gate. Factual contact fields are extracted by the active profile before
 * accumulated CTA/navigation blobs are rejected from feature and FAQ layouts.
 */
export function sourceTextIsOperationalBlob(
  title: string,
  body?: string,
): boolean {
  if (CTA_HEADING_RE.test(title.trim())) return true;
  const combined = `${title} ${body ?? ''}`;
  const signals = [
    PHONE_TOKEN_RE.test(combined),
    EMAIL_TOKEN_RE.test(combined),
    OPENING_HOURS_TOKEN_RE.test(combined),
    HOURS_LABEL_RE.test(combined),
    ADDRESS_TOKEN_RE.test(combined),
    /\b(?:book|schedule|request)\b[^.]{0,40}\bappointment\b/iu.test(combined),
    /\b(?:home|about|services|contact)\b(?:[^.]{0,60}\b(?:home|about|services|contact)\b){2,}/iu
      .test(combined),
  ].filter(Boolean).length;
  return signals >= 2;
}
