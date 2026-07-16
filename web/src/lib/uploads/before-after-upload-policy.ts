import type { MotionIndustryClass } from '@/lib/types/site';
import type { BeforeAfterApprovedIndustry } from '@/lib/assets/provenance-flags-core';
import type { CustomerAssetUsageContext } from './asset-provenance';

export type BeforeAfterUploadPolicyDecision =
  | { allowed: true; usageContext: 'beauty' | 'remodeling' }
  | {
      allowed: false;
      code:
        | 'MEDICAL_BEFORE_AFTER_DISABLED'
        | 'BEFORE_AFTER_DISABLED'
        | 'BEFORE_AFTER_SITE_REQUIRED'
        | 'BEFORE_AFTER_CONTEXT_NOT_ALLOWED'
        | 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED'
        | 'BEFORE_AFTER_CONTEXT_MISMATCH';
    };

/**
 * The multipart usageContext is only a consistency check. Eligibility comes
 * from the owned site's persisted, server-canonical industry classification.
 */
export function resolveBeforeAfterUploadPolicy(input: {
  enabled: boolean;
  approvedIndustries: readonly BeforeAfterApprovedIndustry[];
  siteId: string | null;
  industryClass: MotionIndustryClass | null;
  requestedUsageContext: CustomerAssetUsageContext;
}): BeforeAfterUploadPolicyDecision {
  if (input.industryClass === 'medical') {
    return { allowed: false, code: 'MEDICAL_BEFORE_AFTER_DISABLED' };
  }
  if (!input.enabled) return { allowed: false, code: 'BEFORE_AFTER_DISABLED' };
  if (!input.siteId || !input.industryClass) {
    return { allowed: false, code: 'BEFORE_AFTER_SITE_REQUIRED' };
  }
  if (input.industryClass !== 'beauty' && input.industryClass !== 'remodeling') {
    return { allowed: false, code: 'BEFORE_AFTER_CONTEXT_NOT_ALLOWED' };
  }
  if (!input.approvedIndustries.includes(input.industryClass)) {
    return { allowed: false, code: 'BEFORE_AFTER_INDUSTRY_NOT_APPROVED' };
  }
  if (input.requestedUsageContext !== input.industryClass) {
    return { allowed: false, code: 'BEFORE_AFTER_CONTEXT_MISMATCH' };
  }
  return { allowed: true, usageContext: input.industryClass };
}
