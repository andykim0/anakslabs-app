'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Link2,
  Loader2,
  ReceiptText,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { CREDIT_PACKS } from '@/lib/credits/constants';
import {
  MANUAL_COLLECTION_LABELS,
  RECORDABLE_MANUAL_COLLECTION_PRODUCT_KINDS,
  manualCollectionQuote,
  type ManualCollectionChannel,
  type ManualCollectionProductKind,
} from '@/lib/payments/manual-collection-core';
import {
  cancelManualCollection,
  getClientDetail,
  getClients,
  linkManualCollectionClient,
  linkManualCollectionSite,
  recordManualCollection,
  type AdminManualCollectionRow,
} from './api';
import { formatDateTime, formatKrw } from './format';
import { Badge, Card } from './ui';

const PRODUCT_KINDS = RECORDABLE_MANUAL_COLLECTION_PRODUCT_KINDS;
const CHANNEL_LABELS: Record<ManualCollectionChannel, string> = {
  kmong: "Kmong",
  bank_transfer: "account transfer",
  other: "etc",
};

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

type CustomerMode = 'manual' | 'existing';
type LinkMode = 'client' | 'site';

export function ManualCollectionPanel({ rows }: { rows: AdminManualCollectionRow[] }) {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: ['admin', 'clients'], queryFn: getClients });
  const [customerMode, setCustomerMode] = useState<CustomerMode>('manual');
  const [clientId, setClientId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [siteId, setSiteId] = useState('');
  const [productKind, setProductKind] = useState<ManualCollectionProductKind>('subscription');
  const [creditPackCredits, setCreditPackCredits] = useState(CREDIT_PACKS[0]?.credits ?? 1);
  const [channel, setChannel] = useState<ManualCollectionChannel>('kmong');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [showCancellationDetails, setShowCancellationDetails] = useState(false);
  const [linkEntryId, setLinkEntryId] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<LinkMode>('client');
  const [linkClientId, setLinkClientId] = useState('');
  const [linkSiteId, setLinkSiteId] = useState('');
  const [linkMemo, setLinkMemo] = useState('');

  const effectiveClientId = customerMode === 'existing'
    ? (clientId || clients.data?.[0]?.id || '')
    : '';
  const detail = useQuery({
    queryKey: ['admin', 'client', effectiveClientId],
    queryFn: () => getClientDetail(effectiveClientId),
    enabled: Boolean(effectiveClientId),
  });
  const detailMatchesClient = detail.data?.client.id === effectiveClientId;
  const availableSites = detailMatchesClient ? detail.data?.sites ?? [] : [];
  const effectiveSiteId = availableSites.some((site) => site.id === siteId) ? siteId : '';

  const linkingRow = rows.find((row) => row.entryId === linkEntryId) ?? null;
  const effectiveLinkClientId = linkClientId || clients.data?.[0]?.id || '';
  const linkOwnerId = linkMode === 'site' ? linkingRow?.clientId ?? '' : '';
  const linkDetail = useQuery({
    queryKey: ['admin', 'client', linkOwnerId, 'manual-link'],
    queryFn: () => getClientDetail(linkOwnerId),
    enabled: Boolean(linkEntryId && linkMode === 'site' && linkOwnerId),
  });
  const linkSites = linkDetail.data?.client.id === linkOwnerId ? linkDetail.data.sites : [];
  const effectiveLinkSiteId = linkSites.some((site) => site.id === linkSiteId)
    ? linkSiteId
    : linkSites[0]?.id ?? '';

  const quote = useMemo(() => manualCollectionQuote({
    productKind,
    creditPackCredits: productKind === 'credit_pack' ? creditPackCredits : undefined,
  }), [creditPackCredits, productKind]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'client'] }),
    ]);
  };

  const record = useMutation({
    mutationFn: () => {
      if (!quote) throw new Error("Your price list combination could not be verified.");
      return recordManualCollection({
        clientId: customerMode === 'existing' ? effectiveClientId : null,
        customerName: customerMode === 'manual' ? customerName : null,
        customerContact: customerMode === 'manual' ? customerContact : null,
        siteId: customerMode === 'existing' ? effectiveSiteId || null : null,
        productKind,
        amountKrw: quote.amountKrw,
        channel,
        collectionReference: reference,
        memo: memo || null,
        creditPackCredits: productKind === 'credit_pack' ? creditPackCredits : undefined,
      });
    },
    onSuccess: async () => {
      setReference('');
      setMemo('');
      if (customerMode === 'manual') {
        setCustomerName('');
        setCustomerContact('');
      }
      await refresh();
    },
  });

  const cancellation = useMutation({
    mutationFn: (entryId: string) => cancelManualCollection(entryId),
    onSuccess: refresh,
  });

  const clientLink = useMutation({
    mutationFn: () => {
      if (!linkEntryId || !effectiveLinkClientId) throw new Error("Please select a customer to connect with.");
      return linkManualCollectionClient(linkEntryId, {
        clientId: effectiveLinkClientId,
        memo: linkMemo || null,
      });
    },
    onSuccess: async () => {
      setLinkEntryId(null);
      setLinkMemo('');
      await refresh();
    },
  });

  const siteLink = useMutation({
    mutationFn: () => {
      if (!linkEntryId || !effectiveLinkSiteId) throw new Error("Please select a site to connect to.");
      return linkManualCollectionSite(linkEntryId, {
        siteId: effectiveLinkSiteId,
        memo: linkMemo || null,
      });
    },
    onSuccess: async () => {
      setLinkEntryId(null);
      setLinkMemo('');
      setLinkSiteId('');
      await refresh();
    },
  });

  const canSubmit = Boolean(
    quote
    && reference.trim()
    && !record.isPending
    && (customerMode === 'manual'
      ? customerName.trim() && customerContact.trim()
      : effectiveClientId && detailMatchesClient),
  );

  const openLink = (row: AdminManualCollectionRow, mode: LinkMode) => {
    setLinkEntryId(row.entryId);
    setLinkMode(mode);
    setLinkClientId('');
    setLinkSiteId('');
    setLinkMemo('');
  };

  const confirmCancellation = (row: AdminManualCollectionRow) => {
    const confirmed = window.confirm(
      `${row.clientName}of${MANUAL_COLLECTION_LABELS[row.productKind]}Should I cancel my collection record?
The original entry will remain unchanged, and an automatic reversing entry will be recorded.`,
    );
    if (confirmed) cancellation.mutate(row.entryId);
  };

  return (
    <section className="mt-7" aria-labelledby="manual-collection-heading">
      <div className="mb-3">
        <h2 id="manual-collection-heading" className="text-sm font-semibold text-slate-900">
          Manual collection ledger
        </h2>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
          Even if you do not have an account or site, you can record it first. The original and connection history will not be modified or deleted, and cancellation will remain as a reverse journal entry.
        </p>
      </div>

      <Card className="p-4">
        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => { event.preventDefault(); record.mutate(); }}
        >
          <fieldset className="lg:col-span-2 xl:col-span-4">
            <legend className="text-xs font-medium text-slate-600">Customer record method</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {([
                ['manual', "Manual entry · no account"],
                ['existing', "Select an existing account"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setCustomerMode(value); setSiteId(''); }}
                  className={`rounded-md border px-3 py-2 text-xs font-medium ${customerMode === value ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {customerMode === 'manual' ? (
            <>
              <label className="text-xs font-medium text-slate-600">
                Customer name
                <input className={`${inputClass} mt-1`} value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={100} placeholder="Example: Customer name for ordering Kmong" />
              </label>
              <label className="text-xs font-medium text-slate-600">
                contact memo
                <input className={`${inputClass} mt-1`} value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} maxLength={200} placeholder="Phone/email/Kmong nickname" />
              </label>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 lg:col-span-2">
                <p className="text-[11px] font-medium text-amber-800">Recorded as unconnected</p>
                <p className="mt-1 text-[11px] leading-5 text-amber-700">After signing up, if you link your account in the ledger row, payments and benefits will also be attributed at that time.</p>
              </div>
            </>
          ) : (
            <>
              <label className="text-xs font-medium text-slate-600">
                Existing customer account
                <select className={`${inputClass} mt-1`} value={effectiveClientId} onChange={(event) => { setClientId(event.target.value); setSiteId(''); }}>
                  {(clients.data ?? []).map((client) => (
                    <option key={client.id} value={client.id}>{client.name} · {client.email}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                Site (optional)
                <select className={`${inputClass} mt-1`} value={effectiveSiteId} onChange={(event) => setSiteId(event.target.value)}>
                  <option value="">Site not specified</option>
                  {availableSites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="text-xs font-medium text-slate-600">
            Collection type
            <select className={`${inputClass} mt-1`} value={productKind} onChange={(event) => setProductKind(event.target.value as ManualCollectionProductKind)}>
              {PRODUCT_KINDS.map((kind) => <option key={kind} value={kind}>{MANUAL_COLLECTION_LABELS[kind]}</option>)}
            </select>
          </label>
          {productKind === 'credit_pack' ? (
            <label className="text-xs font-medium text-slate-600">
              credit pack
              <select className={`${inputClass} mt-1`} value={creditPackCredits} onChange={(event) => setCreditPackCredits(Number(event.target.value))}>
                {CREDIT_PACKS.map((pack) => <option key={pack.credits} value={pack.credits}>{pack.label} · {formatKrw(pack.priceKrw)}</option>)}
              </select>
            </label>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] text-slate-500">Price list verification amount</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{quote ? formatKrw(quote.amountKrw) : '—'}</p>
            </div>
          )}
          <label className="text-xs font-medium text-slate-600">
            collection channel
            <select className={`${inputClass} mt-1`} value={channel} onChange={(event) => setChannel(event.target.value as ManualCollectionChannel)}>
              {(Object.keys(CHANNEL_LABELS) as ManualCollectionChannel[]).map((value) => <option key={value} value={value}>{CHANNEL_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Transaction/Order Reference Number
            <input className={`${inputClass} mt-1`} value={reference} onChange={(event) => setReference(event.target.value)} maxLength={160} placeholder="Example: Kmong order number" />
          </label>
          <label className="text-xs font-medium text-slate-600 lg:col-span-2">
            memo
            <input className={`${inputClass} mt-1`} value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={500} placeholder="Optional · Customer request or deposit confirmation note" />
          </label>
          <div className="flex items-end xl:col-span-4">
            <button type="submit" disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
              {record.isPending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ReceiptText size={15} aria-hidden />}
              {quote ? `${formatKrw(quote.amountKrw)}collection records` : "collection records"}
            </button>
          </div>
          {record.isError ? <p role="alert" className="text-xs text-red-600 xl:col-span-4">{record.error.message}</p> : null}
          {record.isSuccess ? <p role="status" className="inline-flex items-center gap-1.5 text-xs text-emerald-700 xl:col-span-4"><CheckCircle2 size={13} aria-hidden />It was recorded in the ledger.</p> : null}
        </form>
      </Card>

      <div className="mt-3 flex items-center justify-end">
        <label className="inline-flex items-center gap-2 text-[11px] text-slate-600">
          <input type="checkbox" checked={showCancellationDetails} onChange={(event) => setShowCancellationDetails(event.target.checked)} />
          Expand cancellation journal details
        </label>
      </div>

      <Card className="mt-2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2">time</th><th className="px-3 py-2">Customer/Site</th><th className="px-3 py-2">category</th><th className="px-3 py-2">Channel/Reference</th><th className="px-3 py-2 text-right">amount</th><th className="px-3 py-2 text-right">work</th></tr></thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.length ? rows.map((row) => (
                <Fragment key={row.entryId}>
                  <tr className={row.cancelled ? 'bg-slate-50/80' : undefined}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{row.clientName}</p>
                      {row.customerContact ? <p className="text-[11px] text-slate-500">{row.customerContact}</p> : null}
                      <p className="text-[11px] text-slate-500">{row.siteName ?? "Site not specified"}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!row.clientId ? <Badge tone="amber">Not connected</Badge> : null}
                        {!row.siteId ? <Badge tone="neutral">Site not specified</Badge> : null}
                        {row.cancelled ? <Badge tone="red">Canceled</Badge> : null}
                      </div>
                      {row.links.length ? <p className="mt-1 text-[10px] text-slate-400">Connection history {row.links.length} records</p> : null}
                    </td>
                    <td className="px-3 py-2"><Badge tone={row.cancelled ? 'neutral' : 'green'}>{MANUAL_COLLECTION_LABELS[row.productKind]}</Badge>{row.memo ? <p className="mt-1 max-w-xs text-[11px] text-slate-500">{row.memo}</p> : null}</td>
                    <td className="px-3 py-2 text-slate-600">{CHANNEL_LABELS[row.channel]}<p className="font-mono text-[11px] text-slate-400">{row.collectionReference}</p></td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${row.cancelled ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{formatKrw(row.amountKrw)}</td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-28 flex-col items-end gap-1">
                        {!row.cancelled && !row.clientId ? <button type="button" onClick={() => openLink(row, 'client')} className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"><Link2 size={11} aria-hidden />Account linking</button> : null}
                        {!row.cancelled && row.clientId && !row.siteId ? <button type="button" onClick={() => openLink(row, 'site')} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><Link2 size={11} aria-hidden />site connection</button> : null}
                        {row.reversible && !row.cancelled ? <button type="button" onClick={() => confirmCancellation(row)} disabled={cancellation.isPending} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"><Ban size={11} aria-hidden />Cancel</button> : null}
                      </div>
                    </td>
                  </tr>
                  {row.cancelled && row.reversal && showCancellationDetails ? (
                    <tr className="bg-red-50/40">
                      <td className="whitespace-nowrap px-3 py-2 text-red-500">{formatDateTime(row.reversal.createdAt)}</td>
                      <td className="px-3 py-2 text-red-700" colSpan={2}>Reversing entry · {row.reversal.memo ?? "Canceled"}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-red-500">{row.reversal.collectionReference}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600">−{formatKrw(row.amountKrw)}</td>
                      <td className="px-3 py-2 text-right text-red-500">original preservation</td>
                    </tr>
                  ) : null}
                </Fragment>
              )) : <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">There are no manual collection records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {linkingRow ? (
        <Card className="mt-3 border-blue-200 bg-blue-50/40 p-4">
          <h3 className="text-sm font-semibold text-blue-950">
            {linkMode === 'client' ? "Post-linking of customer accounts" : "Post-site linking"}
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-blue-700">The original collection record will remain intact and the connection history will be created in a new row.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {linkMode === 'client' ? (
              <select className={inputClass} value={effectiveLinkClientId} onChange={(event) => setLinkClientId(event.target.value)}>
                {(clients.data ?? []).map((client) => <option key={client.id} value={client.id}>{client.name} · {client.email}</option>)}
              </select>
            ) : (
              <select className={inputClass} value={effectiveLinkSiteId} onChange={(event) => setLinkSiteId(event.target.value)}>
                {linkSites.length ? linkSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>) : <option value="">No sites available to connect</option>}
              </select>
            )}
            <input className={inputClass} value={linkMemo} onChange={(event) => setLinkMemo(event.target.value)} maxLength={500} placeholder="Connection note (optional)" />
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => (linkMode === 'client' ? clientLink.mutate() : siteLink.mutate())} disabled={linkMode === 'client' ? !effectiveLinkClientId || clientLink.isPending : !effectiveLinkSiteId || siteLink.isPending} className="rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add connection history</button>
            <button type="button" onClick={() => setLinkEntryId(null)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">Close</button>
          </div>
          {clientLink.isError ? <p role="alert" className="mt-2 text-xs text-red-700">{clientLink.error.message}</p> : null}
          {siteLink.isError ? <p role="alert" className="mt-2 text-xs text-red-700">{siteLink.error.message}</p> : null}
        </Card>
      ) : null}
      {cancellation.isError ? <p role="alert" className="mt-2 text-xs text-red-700">{cancellation.error.message}</p> : null}
    </section>
  );
}
