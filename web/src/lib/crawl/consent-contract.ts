import { z } from 'zod';

export const US_MEDICAL_DEMO_CONSENT_SCOPE = 'demo-by-email' as const;

export const usMedicalDemoConsentInputSchema = z.object({
  prospectId: z.string().trim().min(1).max(100),
  consenterName: z.string().trim().min(1).max(120),
  consenterTitle: z.string().trim().min(1).max(120),
  consentedAt: z.iso.datetime({ offset: true }),
  scope: z.literal(US_MEDICAL_DEMO_CONSENT_SCOPE),
  notes: z.string().trim().max(2_000).default(''),
}).strict();

export interface UsMedicalDemoConsentRecord {
  id: string;
  prospectId: string;
  consenterName: string;
  consenterTitle: string;
  consentedAt: string;
  scope: typeof US_MEDICAL_DEMO_CONSENT_SCOPE;
  recordedBy: string;
  notes: string;
  createdAt: string;
}

export function consentedDemoEmailEvidenceLine(
  record: Pick<UsMedicalDemoConsentRecord, 'consentedAt'>,
): string {
  const date = record.consentedAt.slice(0, 10);
  return `as discussed on our call on ${date}, this private demo uses your practice content for your review.`;
}
