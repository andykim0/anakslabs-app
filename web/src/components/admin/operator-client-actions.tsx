'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createOperatorClientSite,
  inviteOperatorClient,
} from './api';
import { Card, PanelSection } from './ui';

const INPUT = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs focus:border-slate-500 focus:outline-none';

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
  const [mode, setMode] = useState<'crawl' | 'minimal'>('crawl');
  const [sourceUrl, setSourceUrl] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Dental practice');
  const [tone, setTone] = useState('calm and clinical');
  const [colorPreference, setColorPreference] = useState('clean blue');
  const mutation = useMutation({
    mutationFn: () => createOperatorClientSite(clientId, mode === 'crawl'
      ? { mode, sourceUrl: sourceUrl.trim() }
      : {
          mode,
          businessName: businessName.trim(),
          industry: industry.trim(),
          tone: tone.trim(),
          colorPreference: colorPreference.trim(),
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
          <div className="flex gap-2 text-xs">
            <label><input type="radio" checked={mode === 'crawl'} onChange={() => setMode('crawl')} /> Existing crawl artifact</label>
            <label><input type="radio" checked={mode === 'minimal'} onChange={() => setMode('minimal')} /> No source URL</label>
          </div>
          {mode === 'crawl' ? (
            <input className={INPUT} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required type="url" placeholder="https://clinic.example" aria-label="Existing crawl source URL" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={INPUT} value={businessName} onChange={(event) => setBusinessName(event.target.value)} required placeholder="Business name" aria-label="Business name" />
              <input className={INPUT} value={industry} onChange={(event) => setIndustry(event.target.value)} required placeholder="Industry" aria-label="Industry" />
              <input className={INPUT} value={tone} onChange={(event) => setTone(event.target.value)} required placeholder="Tone" aria-label="Tone" />
              <input className={INPUT} value={colorPreference} onChange={(event) => setColorPreference(event.target.value)} required placeholder="Color preference" aria-label="Color preference" />
            </div>
          )}
          <button className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50" disabled={mutation.isPending} type="submit">
            Create draft
          </button>
          {mutation.isError ? <p className="text-xs text-red-600">{mutation.error.message}</p> : null}
          {mutation.data ? (
            <p className="text-xs text-emerald-700">Created {mutation.data.siteId} · {mutation.data.locale} · forms {mutation.data.formCount}</p>
          ) : null}
        </form>
      )}
    </PanelSection>
  );
}
