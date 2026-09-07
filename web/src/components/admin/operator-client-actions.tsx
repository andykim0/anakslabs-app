'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  apiErrorCode,
  attachOperatorSiteDomain,
  createOperatorClientSite,
  inviteOperatorClient,
  publishOperatorClientSite,
} from './api';
import { Card, PanelSection } from './ui';
import type { Site } from '@/lib/types/domain';
import { PUBLISH_HUMAN_CHECKS, emptyPublishHumanChecks } from '@/lib/publish/human-checks';
import { PUBLISH_PAYMENT_ERROR_CODE } from '@/lib/billing/publish-payment-contract';
import {
  DEFAULT_US_SITE_TIMEZONE,
  US_SITE_TIMEZONES,
  type ClinicAccentPreset,
  type UsSiteTimezone,
} from '@/lib/types/site';
import {
  CLINIC_DENTAL_SERVICE_TAXONOMY,
  CLINIC_NEWBUILD_ACCENT_PRESETS,
  CLINIC_NEWBUILD_MAX_SERVICES,
  CLINIC_NEWBUILD_MIN_SERVICES,
  CLINIC_NEWBUILD_SPECIALTIES,
  type ClinicDentalServiceId,
  type ClinicNewbuildSpecialty,
} from '@/lib/clinic-master/service-taxonomy';

const INPUT = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs focus:border-slate-500 focus:outline-none';

/** 쉼표 구분 입력 → 선언된 보험사 목록. 운영자가 적은 문자열만 사이트에 실린다. */
function insurancesList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

export function OperatorClientInviteForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const mutation = useMutation({
    mutationFn: () => inviteOperatorClient({ name: name.trim(), email: email.trim() }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] }),
  });

  return (
    <Card className="mb-4">
      <h2 className="text-sm font-semibold text-slate-900">Issue a client account</h2>
      <p className="mt-1 text-xs text-slate-500">Creates an invitation. Operators never set or see a password.</p>
      <form
        className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <input className={INPUT} value={name} onChange={(event) => setName(event.target.value)} required placeholder="Client name" aria-label="Client name" />
        <input className={INPUT} value={email} onChange={(event) => setEmail(event.target.value)} required type="email" placeholder="owner@clinic.com" aria-label="Client email" />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50" disabled={mutation.isPending} type="submit">
          Issue invite
        </button>
      </form>
      {mutation.isError ? <p className="mt-2 text-xs text-red-600">{mutation.error.message}</p> : null}
      {mutation.data ? (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <p>Account bound to client {mutation.data.client.id}.</p>
          <a className="mt-1 block break-all underline" href={mutation.data.inviteUrl} target="_blank" rel="noreferrer">Open invitation</a>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * `approvedPreviewId` is the id of the preview this client approved, handed over from the US demo
 * pipeline (`/admin/us-demos` → "Deliver this preview" → `?previewId=`). When one is present the
 * form opens on the delivery mode, because shipping the approved bytes is the right default and
 * every other mode compiles a second, different site.
 */
export function OperatorSiteCreateForm({
  clientId,
  disabled,
  approvedPreviewId,
}: {
  clientId: string;
  disabled: boolean;
  approvedPreviewId?: string;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'approved-preview' | 'crawl' | 'minimal' | 'newbuild'>(
    approvedPreviewId ? 'approved-preview' : 'crawl',
  );
  const [previewId, setPreviewId] = useState(approvedPreviewId ?? '');
  const [approvedAt, setApprovedAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Dental practice');
  const [tone, setTone] = useState('calm and clinical');
  const [colorPreference, setColorPreference] = useState('clean blue');
  const [timezone, setTimezone] = useState<UsSiteTimezone>(DEFAULT_US_SITE_TIMEZONE);
  const [phone, setPhone] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [address, setAddress] = useState('');
  const [specialty, setSpecialty] = useState<ClinicNewbuildSpecialty>('general-dentistry');
  const [serviceIds, setServiceIds] = useState<ClinicDentalServiceId[]>([]);
  const [accentPreset, setAccentPreset] = useState<ClinicAccentPreset>('clean-blue');
  const [insurances, setInsurances] = useState('');
  const [hours, setHours] = useState('');
  const mutation = useMutation({
    mutationFn: () => createOperatorClientSite(clientId, mode === 'approved-preview'
      ? {
          mode,
          previewId: previewId.trim(),
          timezone,
          // A local datetime-local value carries no offset; the API contract requires one.
          ...(approvedAt ? { approvedAt: new Date(approvedAt).toISOString() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(bookingUrl.trim() ? { bookingUrl: bookingUrl.trim() } : {}),
        }
      : mode === 'crawl'
      ? {
          mode,
          sourceUrl: sourceUrl.trim(),
          timezone,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(bookingUrl.trim() ? { bookingUrl: bookingUrl.trim() } : {}),
        }
      : mode === 'newbuild'
        ? {
            mode,
            businessName: businessName.trim(),
            specialty,
            serviceIds,
            accentPreset,
            timezone,
            ...(phone.trim() ? { phone: phone.trim() } : {}),
            ...(bookingUrl.trim() ? { bookingUrl: bookingUrl.trim() } : {}),
            ...(address.trim() ? { address: address.trim() } : {}),
            ...(insurancesList(insurances).length
              ? { insurances: insurancesList(insurances) }
              : {}),
            ...(hours.trim() ? { hours: hours.trim() } : {}),
          }
      : {
          mode,
          businessName: businessName.trim(),
          industry: industry.trim(),
          tone: tone.trim(),
          colorPreference: colorPreference.trim(),
          timezone,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(bookingUrl.trim() ? { bookingUrl: bookingUrl.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
        }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'client', clientId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
    },
  });

  return (
    <PanelSection title="Create site as operator">
      {disabled ? (
        <p className="text-xs text-slate-500">This client already has a site.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="flex flex-wrap gap-2 text-xs">
            <label><input type="radio" checked={mode === 'approved-preview'} onChange={() => setMode('approved-preview')} /> Deliver the approved preview</label>
            <label><input type="radio" checked={mode === 'crawl'} onChange={() => setMode('crawl')} /> Existing crawl artifact</label>
            <label><input type="radio" checked={mode === 'newbuild'} onChange={() => setMode('newbuild')} /> New build (dental)</label>
            <label><input type="radio" checked={mode === 'minimal'} onChange={() => setMode('minimal')} /> No source URL</label>
          </div>
          {mode === 'approved-preview' ? (
            <div className="space-y-2">
              <input
                className={INPUT}
                value={previewId}
                onChange={(event) => setPreviewId(event.target.value)}
                required
                placeholder="Approved preview id (from the US demo pipeline)"
                aria-label="Approved preview id"
              />
              <input
                className={INPUT}
                value={approvedAt}
                onChange={(event) => setApprovedAt(event.target.value)}
                type="datetime-local"
                aria-label="When the customer approved this preview"
              />
              <p className="text-[11px] text-slate-500">
                Ships the exact page the customer approved. Every other mode compiles a second
                site, which is not what they said yes to.
              </p>
            </div>
          ) : mode === 'crawl' ? (
            <input className={INPUT} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required type="url" placeholder="https://clinic.example" aria-label="Existing crawl source URL" />
          ) : mode === 'newbuild' ? (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={INPUT} value={businessName} onChange={(event) => setBusinessName(event.target.value)} required placeholder="Practice name" aria-label="Practice name" />
                <select
                  className={INPUT}
                  value={specialty}
                  onChange={(event) => setSpecialty(event.target.value as ClinicNewbuildSpecialty)}
                  aria-label="Specialty"
                >
                  {CLINIC_NEWBUILD_SPECIALTIES.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </div>
              <fieldset className="rounded-md border border-slate-200 p-2">
                <legend className="px-1 text-[11px] font-medium text-slate-600">
                  {`Services (${serviceIds.length} selected · ${CLINIC_NEWBUILD_MIN_SERVICES}–${CLINIC_NEWBUILD_MAX_SERVICES})`}
                </legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {CLINIC_DENTAL_SERVICE_TAXONOMY.map((entry) => {
                    const checked = serviceIds.includes(entry.id);
                    return (
                      <label key={entry.id} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && serviceIds.length >= CLINIC_NEWBUILD_MAX_SERVICES}
                          onChange={() => setServiceIds((current) => (
                            current.includes(entry.id)
                              ? current.filter((id) => id !== entry.id)
                              : [...current, entry.id]
                          ))}
                        />
                        <span>{entry.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="rounded-md border border-slate-200 p-2">
                <legend className="px-1 text-[11px] font-medium text-slate-600">Accent</legend>
                <div className="flex flex-wrap gap-3 text-[11px] text-slate-700">
                  {CLINIC_NEWBUILD_ACCENT_PRESETS.map((preset) => (
                    <label key={preset} className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="clinic-accent-preset"
                        checked={accentPreset === preset}
                        onChange={() => setAccentPreset(preset)}
                      />
                      <span>{preset}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-2 sm:grid-cols-2">
                <input className={INPUT} value={insurances} onChange={(event) => setInsurances(event.target.value)} placeholder="Insurance plans, comma separated (optional)" aria-label="Accepted insurance plans" />
                <input className={INPUT} value={hours} onChange={(event) => setHours(event.target.value)} placeholder="Opening hours (optional)" aria-label="Opening hours" />
              </div>
              <p className="text-[11px] text-slate-500">
                Only what you declare here becomes site copy. A phone number or a booking URL is required.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={INPUT} value={businessName} onChange={(event) => setBusinessName(event.target.value)} required placeholder="Business name" aria-label="Business name" />
              <input className={INPUT} value={industry} onChange={(event) => setIndustry(event.target.value)} required placeholder="Industry" aria-label="Industry" />
              <input className={INPUT} value={tone} onChange={(event) => setTone(event.target.value)} required placeholder="Tone" aria-label="Tone" />
              <input className={INPUT} value={colorPreference} onChange={(event) => setColorPreference(event.target.value)} required placeholder="Color preference" aria-label="Color preference" />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              className={`${INPUT} sm:col-span-2`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value as UsSiteTimezone)}
              aria-label="Site timezone"
            >
              {US_SITE_TIMEZONES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input className={INPUT} value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" placeholder="Phone (optional)" aria-label="Public phone" />
            <input className={INPUT} value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} type="url" placeholder="https://booking.example (optional)" aria-label="External booking URL" />
            {mode === 'minimal' || mode === 'newbuild' ? (
              <input className={`${INPUT} sm:col-span-2`} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Business address (optional)" aria-label="Business address" />
            ) : null}
          </div>
          <button className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50" disabled={mutation.isPending} type="submit">
            Create draft
          </button>
          {mutation.isError ? <p className="text-xs text-red-600">{mutation.error.message}</p> : null}
          {mutation.data ? (
            <p className="text-xs text-emerald-700">Created {mutation.data.siteId} · {mutation.data.locale} · {mutation.data.timezone} · forms {mutation.data.formCount}</p>
          ) : null}
        </form>
      )}
    </PanelSection>
  );
}


/**
 * Takes a delivered site live on the customer's own domain.
 *
 * Shown only for a site the operator delivered from an approved preview — `deliveredFromPreviewId`
 * is the provenance the server wrote at delivery (0066), and it is the single discriminator this
 * console uses. A site compiled by any other mode is not the artefact the customer approved, so
 * the operator does not get a one-click route to publish it on their behalf.
 *
 * The three human checks are not decoration and are not defaulted: the server refuses the publish
 * without them, and the operator who ticks them is recorded as the checker.
 */
export function OperatorSiteDeliveryControls({
  clientId,
  site,
}: {
  clientId: string;
  site: Site;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState(() => emptyPublishHumanChecks());
  const [hostname, setHostname] = useState(
    site.domainType === 'custom' && site.domain ? site.domain : '',
  );
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'client', clientId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'clients'] });
  };
  const domainMutation = useMutation({
    mutationFn: () => attachOperatorSiteDomain(clientId, site.id, hostname.trim()),
    onSuccess: invalidate,
  });
  const publishMutation = useMutation({
    mutationFn: () => publishOperatorClientSite(clientId, site.id, {
      humanChecks: checks,
      // The server only asks for this when the draft carries operator information at all.
      businessInfoConfirmed: true,
    }),
    onSuccess: invalidate,
  });
  const allChecked = PUBLISH_HUMAN_CHECKS.every(({ id }) => checks[id]);
  // The publish path answers 402 when the account has no active subscription. That is a
  // commercial fact for the operator to act on, not an error to retry.
  const needsSubscription = apiErrorCode(publishMutation.error) === PUBLISH_PAYMENT_ERROR_CODE;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-700"
      >
        Publish on their domain
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-medium text-slate-700">
        Publish on their domain
      </p>
      <div className="flex gap-2">
        <input
          className={INPUT}
          value={hostname}
          onChange={(event) => setHostname(event.target.value)}
          placeholder="www.theirclinic.com"
          aria-label="Customer domain"
        />
        <button
          type="button"
          disabled={domainMutation.isPending || hostname.trim().length === 0}
          onClick={() => domainMutation.mutate()}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 disabled:opacity-50"
        >
          Attach domain
        </button>
      </div>
      {domainMutation.isError ? (
        <p className="text-[11px] text-red-600">{domainMutation.error.message}</p>
      ) : null}
      {domainMutation.data ? (
        <ul className="space-y-0.5 text-[11px] text-slate-600">
          <li>{`status: ${domainMutation.data.status.status}`}</li>
          {domainMutation.data.status.verificationRecords.map((record) => (
            <li key={`${record.type}:${record.name}`} className="break-all">
              {`${record.type} ${record.name} → ${record.value}`}
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset className="space-y-1 border-t border-slate-200 pt-2">
        <legend className="text-[11px] font-medium text-slate-700">
          Confirm before it goes live
        </legend>
        {PUBLISH_HUMAN_CHECKS.map(({ id, label }) => (
          <label key={id} className="flex items-start gap-1.5 text-[11px] text-slate-700">
            <input
              type="checkbox"
              checked={checks[id]}
              onChange={() => setChecks((current) => ({ ...current, [id]: !current[id] }))}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={publishMutation.isPending || !allChecked}
          onClick={() => publishMutation.mutate()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-50"
        >
          Publish
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[11px] text-slate-500 underline"
        >
          Close
        </button>
      </div>
      {publishMutation.isError ? (
        <p className="text-[11px] text-red-600">
          {needsSubscription
            ? 'This site needs an active subscription before it can be published.'
            : publishMutation.error.message}
        </p>
      ) : null}
      {publishMutation.data ? (
        <p className="text-[11px] text-emerald-700 break-all">
          {`Live at ${publishMutation.data.url ?? '(no domain assigned)'} · checked by ${publishMutation.data.checkedBy}`}
        </p>
      ) : null}
    </div>
  );
}
