import { ROOT_DOMAIN } from '@/lib/env';

/**
 * The "View the full report" destination printed into every monthly report email.
 *
 * Shared so the cron delivery and an operator test send cannot drift apart: a test send
 * whose button pointed somewhere else would not be a test of the customer's email.
 */
export function reportDashboardUrl(): string {
  const host = ROOT_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/dashboard/reports`;
}
