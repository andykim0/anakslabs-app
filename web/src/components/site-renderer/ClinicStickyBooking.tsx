import type { CSSProperties } from 'react';
import type { ClinicMasterPin } from '@/lib/types/site';
import type { ClinicUsDestination } from '@/lib/clinic-master/live-contract';
import { clinicMasterRenderTokens } from '@/lib/clinic-master/tokens';

const CLINIC_STICKY_BOOKING_CSS = `
[data-clinic-sticky-booking] {
  position: fixed;
  z-index: 80;
  right: max(20px,env(safe-area-inset-right));
  bottom: max(20px,env(safe-area-inset-bottom));
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  width: min(360px,calc(100vw - 40px));
  overflow: hidden;
  border: 1px solid var(--clinic-border);
  border-left: 4px solid var(--clinic-accent);
  border-radius: var(--clinic-radius-md);
  background: #fff;
  box-shadow: 0 16px 44px rgba(22,32,43,.14);
  font-family: var(--clinic-control-family);
  font-weight: var(--clinic-control-weight);
}
[data-clinic-sticky-booking] [data-clinic-booking-action] {
  display: inline-flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  border: 0;
  border-radius: 0;
  color: var(--clinic-accent-contrast);
  background: var(--clinic-accent);
  font: inherit;
  text-decoration: none;
  white-space: nowrap;
}
[data-clinic-sticky-booking] [data-clinic-booking-action="call"] {
  border-left: 1px solid color-mix(in srgb,var(--clinic-accent-contrast) 32%,transparent);
}
[data-clinic-sticky-booking] [aria-disabled="true"] {
  cursor: default;
}
@media (max-width: 767.98px) {
  [data-clinic-sticky-booking] {
    right: 0;
    bottom: 0;
    left: 0;
    grid-template-columns: 1fr 1fr;
    width: 100%;
    padding-bottom: env(safe-area-inset-bottom);
    border-right: 0;
    border-bottom: 0;
    border-left-width: 0;
    border-top: 1px solid var(--clinic-border);
    border-radius: 0;
    box-shadow: 0 -10px 32px rgba(22,32,43,.12);
  }
  [data-clinic-sticky-booking] [data-clinic-booking-action] {
    min-height: 56px;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-clinic-sticky-booking] * {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
`;

function telephoneHref(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const normalized = phone.replace(/[^\d+]/gu, '');
  return normalized ? `tel:${normalized}` : undefined;
}

function Action({
  href,
  kind,
  children,
}: {
  href?: string;
  kind: 'book' | 'call';
  children: string;
}) {
  return href ? (
    <a href={href} data-clinic-booking-action={kind}>{children}</a>
  ) : (
    <span aria-disabled="true" data-clinic-booking-action={kind}>{children}</span>
  );
}

/**
 * 서버 DOM-only persistent booking surface. Preview/demo calls set interactive=false,
 * which guarantees no href and no connector issuance. Live calls may pass only the
 * separately verified US destination projection; CONN$ manifests are not accepted here.
 */
export function ClinicStickyBooking({
  pin,
  interactive,
  destination,
}: {
  pin: ClinicMasterPin;
  interactive: boolean;
  /** 고객 확인 factory를 통과한 별도 US destination. 기존 CONN$ manifest는 받지 않는다. */
  destination?: ClinicUsDestination;
}) {
  const callHref = interactive && destination?.validated
    ? telephoneHref(destination.phone)
    : undefined;
  const bookHref = interactive && destination?.validated
    ? destination.bookingUrl
    : undefined;
  const deactivated = !bookHref && !callHref;
  const tokens = clinicMasterRenderTokens(pin);
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CLINIC_STICKY_BOOKING_CSS }} />
      <aside
        aria-label="Appointment actions"
        {...(deactivated ? { 'aria-disabled': 'true' } : {})}
        data-clinic-sticky-booking="1"
        data-clinic-booking-state={deactivated ? 'deactivated' : bookHref ? 'active' : 'call-only'}
        style={{
          '--clinic-accent': tokens.accent,
          '--clinic-accent-contrast': tokens.accentContrast,
          '--clinic-border': tokens.border,
          '--clinic-control-family': tokens.controlFamily,
          '--clinic-control-weight': tokens.controlWeight,
          '--clinic-radius-md': tokens.radiusMd,
        } as CSSProperties}
      >
        <Action href={bookHref} kind="book">Book Appointment</Action>
        <Action href={callHref} kind="call">Call</Action>
      </aside>
    </>
  );
}
