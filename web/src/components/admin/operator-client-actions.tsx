'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createOperatorClientSite,
  inviteOperatorClient,
} from './api';
import { Card, PanelSection } from './ui';
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

export function OperatorSiteCreateForm({ clientId, disabled }: { clientId: string; disabled: boolean }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'crawl' | 'minimal' | 'newbuild'>('crawl');
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
    mutationFn: () => createOperatorClientSite(clientId, mode === 'crawl'
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
            <label><input type="radio" checked={mode === 'crawl'} onChange={() => setMode('crawl')} /> Existing crawl artifact</label>
            <label><input type="radio" checked={mode === 'newbuild'} onChange={() => setMode('newbuild')} /> New build (dental)</label>
            <label><input type="radio" checked={mode === 'minimal'} onChange={() => setMode('minimal')} /> No source URL</label>
          </div>
          {mode === 'crawl' ? (
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
