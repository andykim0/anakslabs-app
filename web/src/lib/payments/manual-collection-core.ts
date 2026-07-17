import { CREDIT_PACKS } from '@/lib/credits/constants';
import { PRICING } from '@/lib/pricing';
import type { Payment, PaymentType } from '@/lib/types/domain';

export const MANUAL_COLLECTION_PRODUCT_KINDS = [
  'launch_build',
  'list_build',
  'video_addon',
  'subscription',
  'credit_pack',
] as const;

export type ManualCollectionProductKind = (typeof MANUAL_COLLECTION_PRODUCT_KINDS)[number];
export type ManualCollectionDirection = 'receipt' | 'reversal';

export const MANUAL_COLLECTION_CHANNELS = ['kmong', 'bank_transfer', 'other'] as const;
export type ManualCollectionChannel = (typeof MANUAL_COLLECTION_CHANNELS)[number];

export interface ManualCollectionQuote {
  paymentType: PaymentType;
  amountKrw: number;
  creditsGranted: number;
}

export interface ManualPaymentEntry {
  id: string;
  paymentId: string | null;
  clientId: string;
  siteId: string | null;
  productKind: ManualCollectionProductKind;
  direction: ManualCollectionDirection;
  amountKrw: number;
  channel: ManualCollectionChannel;
  collectionReference: string;
  memo: string | null;
  reversesEntryId: string | null;
  createdAt: string;
}

export interface ManualPaymentRecord {
  payment: Payment | null;
  entry: ManualPaymentEntry;
}

export interface RecordManualCollectionInput {
  clientId: string;
  siteId?: string | null;
  productKind: ManualCollectionProductKind;
  amountKrw: number;
  channel: ManualCollectionChannel;
  collectionReference: string;
  memo?: string | null;
  creditPackCredits?: number;
}

export interface ReverseManualCollectionInput {
  entryId: string;
  collectionReference: string;
  memo: string;
}

export interface ManualCollectionMutationResult {
  duplicated: boolean;
  record: ManualPaymentRecord;
}

export interface ManualCollectionsRepository {
  listAll(): Promise<ManualPaymentRecord[]>;
  record(input: RecordManualCollectionInput): Promise<ManualCollectionMutationResult>;
  reverse(input: ReverseManualCollectionInput): Promise<ManualCollectionMutationResult>;
}

export function manualCollectionNeedsSite(kind: ManualCollectionProductKind): boolean {
  return kind === 'launch_build' || kind === 'list_build' || kind === 'video_addon';
}

/**
 * Resolve the admin form's site value without turning an explicit "no site"
 * choice back into the client's first site. `selectedSiteId === null` means the
 * operator has not made a choice for the current client yet; an empty string is
 * an intentional optional-site choice.
 */
export function resolveManualCollectionSiteChoice(input: {
  selectedSiteId: string | null;
  availableSiteIds: readonly string[];
  siteRequired: boolean;
}): string {
  const firstSiteId = input.availableSiteIds[0] ?? '';
  if (input.selectedSiteId && input.availableSiteIds.includes(input.selectedSiteId)) {
    return input.selectedSiteId;
  }
  return input.siteRequired ? firstSiteId : '';
}

/**
 * UI projection of the server reversal policy. Non-subscription receipts stay
 * reversible until corrected; subscription periods can only be unwound from
 * the latest unreversed receipt backwards. The repository/SQL remains the
 * authority and rechecks this rule under a per-client lock.
 */
export function manualCollectionReversibleEntryIds(
  entries: readonly ManualPaymentEntry[],
): ReadonlySet<string> {
  const reversedReceiptIds = new Set(entries.flatMap((entry) =>
    entry.direction === 'reversal' && entry.reversesEntryId
      ? [entry.reversesEntryId]
      : []));
  const latestSubscriptionByClient = new Map<string, ManualPaymentEntry>();

  for (const entry of entries) {
    if (
      entry.direction !== 'receipt'
      || entry.productKind !== 'subscription'
      || reversedReceiptIds.has(entry.id)
      || !Number.isFinite(Date.parse(entry.createdAt))
    ) continue;
    const current = latestSubscriptionByClient.get(entry.clientId);
    if (!current || entry.createdAt > current.createdAt
      || (entry.createdAt === current.createdAt && entry.id > current.id)) {
      latestSubscriptionByClient.set(entry.clientId, entry);
    }
  }

  return new Set(entries.flatMap((entry) => {
    if (entry.direction !== 'receipt' || reversedReceiptIds.has(entry.id)) return [];
    if (entry.productKind !== 'subscription') return [entry.id];
    return latestSubscriptionByClient.get(entry.clientId)?.id === entry.id ? [entry.id] : [];
  }));
}

export function manualCollectionQuote(input: {
  productKind: ManualCollectionProductKind;
  creditPackCredits?: number;
}): ManualCollectionQuote | null {
  switch (input.productKind) {
    case 'launch_build':
      return { paymentType: 'build_fee', amountKrw: PRICING.base.launch, creditsGranted: 0 };
    case 'list_build':
      return { paymentType: 'build_fee', amountKrw: PRICING.base.list, creditsGranted: 0 };
    case 'video_addon':
      return { paymentType: 'build_fee', amountKrw: PRICING.videoHeroAddon, creditsGranted: 0 };
    case 'subscription':
      return {
        paymentType: 'maintenance_subscription',
        amountKrw: PRICING.subscription.monthly,
        creditsGranted: PRICING.subscription.creditsPerMonth,
      };
    case 'credit_pack': {
      const pack = CREDIT_PACKS.find((candidate) => candidate.credits === input.creditPackCredits);
      return pack
        ? { paymentType: 'credit_pack', amountKrw: pack.priceKrw, creditsGranted: pack.credits }
        : null;
    }
  }
}

function required(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function nullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

export function normalizeRecordManualCollectionInput(
  input: RecordManualCollectionInput,
): Required<Omit<RecordManualCollectionInput, 'siteId' | 'memo' | 'creditPackCredits'>> & {
  siteId: string | null;
  memo: string | null;
  creditPackCredits: number | null;
  quote: ManualCollectionQuote;
} {
  const quote = manualCollectionQuote(input);
  if (!quote) throw new Error('MANUAL_COLLECTION_PRODUCT_INVALID');
  if (!Number.isSafeInteger(input.amountKrw) || input.amountKrw !== quote.amountKrw) {
    throw new Error('MANUAL_COLLECTION_AMOUNT_MISMATCH');
  }
  const siteId = nullableText(input.siteId);
  if (manualCollectionNeedsSite(input.productKind) && !siteId) {
    throw new Error('MANUAL_COLLECTION_SITE_REQUIRED');
  }
  return {
    clientId: required(input.clientId, 'MANUAL_COLLECTION_CLIENT_REQUIRED'),
    siteId,
    productKind: input.productKind,
    amountKrw: input.amountKrw,
    channel: input.channel,
    collectionReference: required(
      input.collectionReference,
      'MANUAL_COLLECTION_REFERENCE_REQUIRED',
    ),
    memo: nullableText(input.memo),
    creditPackCredits: input.productKind === 'credit_pack'
      ? (input.creditPackCredits ?? null)
      : null,
    quote,
  };
}

export function manualCollectionIdempotencyKey(input: {
  channel: ManualCollectionChannel;
  collectionReference: string;
}): string {
  return `manual:${input.channel}:${required(
    input.collectionReference,
    'MANUAL_COLLECTION_REFERENCE_REQUIRED',
  )}`;
}

export function normalizeReverseManualCollectionInput(
  input: ReverseManualCollectionInput,
): ReverseManualCollectionInput {
  return {
    entryId: required(input.entryId, 'MANUAL_REVERSAL_ENTRY_REQUIRED'),
    collectionReference: required(
      input.collectionReference,
      'MANUAL_REVERSAL_REFERENCE_REQUIRED',
    ),
    memo: required(input.memo, 'MANUAL_REVERSAL_MEMO_REQUIRED'),
  };
}

export const MANUAL_COLLECTION_LABELS = {
  launch_build: '런칭가 제작',
  list_build: '정가 제작',
  video_addon: 'AI 영상 애드온',
  subscription: '사이트 운영 구독',
  credit_pack: '크레딧 팩',
} as const satisfies Record<ManualCollectionProductKind, string>;
