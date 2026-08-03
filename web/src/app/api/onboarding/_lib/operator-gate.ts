import type { NextResponse } from 'next/server';
import { apiError } from '@/app/api/_lib/http';
import {
  onboardingAllowedForLocale,
  OPERATOR_PRODUCT_LOCALE,
} from '@/lib/operator-model/policy';

export const OPERATOR_MANAGED_ONBOARDING_ERROR_CODE = 'OPERATOR_MANAGED_ACCOUNT' as const;

/** Server boundary for every self-service onboarding endpoint in the US-only product. */
export function operatorManagedOnboardingApiGate(
  locale: string = OPERATOR_PRODUCT_LOCALE,
): NextResponse | null {
  if (onboardingAllowedForLocale(locale)) return null;
  return apiError(
    403,
    OPERATOR_MANAGED_ONBOARDING_ERROR_CODE,
    'This workspace is managed by Anaks Labs. Site creation is available to operators only.',
  );
}
