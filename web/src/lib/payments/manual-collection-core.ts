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
export type ManualCollectionLinkKind = 'client' | 'site';

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
  clientId: string | null;
  siteId: string | null;
  customerName: string | null;
  customerContact: string | null;
  creditPackCredits: number | null;
  productKind: ManualCollectionProductKind;
  direction: ManualCollectionDirection;
  amountKrw: number;
  channel: ManualCollectionChannel;
  collectionReference: string;
  memo: string | null;
  reversesEntryId: string | null;
  createdAt: string;
}

export interface ManualCollectionLink {
  id: string;
  entryId: string;
  kind: ManualCollectionLinkKind;
  clientId: string;
  siteId: string | null;
  paymentId: string | null;
  memo: string | null;
  createdAt: string;
}

export interface ManualPaymentRecord {
  payment: Payment | null;
  entry: ManualPaymentEntry;
  links: ManualCollectionLink[];
}

export interface RecordManualCollectionInput {
  clientId?: string | null;
  customerName?: string | null;
  customerContact?: string | null;
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

export interface LinkManualCollectionClientInput {
  entryId: string;
  clientId: string;
  memo?: string | null;
}

export interface LinkManualCollectionSiteInput {
  entryId: string;
  siteId: string;
  memo?: string | null;
}

export interface ManualCollectionMutationResult {
  duplicated: boolean;
  record: ManualPaymentRecord;
}

export interface ManualCollectionsRepository {
  listAll(): Promise<ManualPaymentRecord[]>;
  record(input: RecordManualCollectionInput): Promise<ManualCollectionMutationResult>;
  reverse(input: ReverseManualCollectionInput): Promise<ManualCollectionMutationResult>;
  linkClient(input: LinkManualCollectionClientInput): Promise<ManualCollectionMutationResult>;
  linkSite(input: LinkManualCollectionSiteInput): Promise<ManualCollectionMutationResult>;
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
  const latestSubscriptionByCustomer = new Map<string, ManualPaymentEntry>();

  for (const entry of entries) {
    if (
      entry.direction !== 'receipt'
      || entry.productKind !== 'subscription'
      || reversedReceiptIds.has(entry.id)
      || !Number.isFinite(Date.parse(entry.createdAt))
    ) continue;
    const customerKey = manualCollectionCustomerKey(entry);
    if (!customerKey) continue;
    const current = latestSubscriptionByCustomer.get(customerKey);
    if (!current || entry.createdAt > current.createdAt
      || (entry.createdAt === current.createdAt && entry.id > current.id)) {
      latestSubscriptionByCustomer.set(customerKey, entry);
    }
  }

  return new Set(entries.flatMap((entry) => {
    if (entry.direction !== 'receipt' || reversedReceiptIds.has(entry.id)) return [];
    if (entry.productKind !== 'subscription') return [entry.id];
    const customerKey = manualCollectionCustomerKey(entry);
    return customerKey && latestSubscriptionByCustomer.get(customerKey)?.id === entry.id
      ? [entry.id]
      : [];
  }));
}

function normalizedCustomerContact(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
  return normalized || null;
}

/** 사이트 미지정 런칭 수금의 중복 방지 키. 직접 입력 고객은 연결 뒤에도 같은 키를 유지한다. */
export function manualCollectionCustomerKey(
  entry: Pick<ManualPaymentEntry, 'clientId' | 'customerContact'>,
): string | null {
  const contact = normalizedCustomerContact(entry.customerContact);
  if (contact) return `manual:${contact}`;
  return entry.clientId ? `client:${entry.clientId}` : null;
}

/** 선착순 카운터 키: 지정 사이트 우선, 미지정은 고객 단위로 한 번만 센다. */
export function manualCollectionLaunchCounterKey(
  entry: Pick<ManualPaymentEntry, 'siteId' | 'clientId' | 'customerContact'>,
): string | null {
  return entry.siteId ? `site:${entry.siteId}` : manualCollectionCustomerKey(entry);
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
): Omit<Required<RecordManualCollectionInput>, 'clientId' | 'customerName' | 'customerContact' | 'siteId' | 'memo' | 'creditPackCredits'> & {
  clientId: string | null;
  customerName: string | null;
  customerContact: string | null;
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
  const clientId = nullableText(input.clientId);
  const customerName = nullableText(input.customerName);
  const customerContact = nullableText(input.customerContact);
  if (clientId && (customerName || customerContact)) {
    throw new Error('MANUAL_COLLECTION_CUSTOMER_AMBIGUOUS');
  }
  if (!clientId && (!customerName || !customerContact)) {
    throw new Error('MANUAL_COLLECTION_CUSTOMER_REQUIRED');
  }
  const siteId = nullableText(input.siteId);
  if (siteId && !clientId) {
    throw new Error('MANUAL_COLLECTION_SITE_WITHOUT_CLIENT');
  }
  return {
    clientId,
    customerName,
    customerContact,
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

export function normalizeLinkManualCollectionClientInput(
  input: LinkManualCollectionClientInput,
): Required<Omit<LinkManualCollectionClientInput, 'memo'>> & { memo: string | null } {
  return {
    entryId: required(input.entryId, 'MANUAL_COLLECTION_ENTRY_REQUIRED'),
    clientId: required(input.clientId, 'MANUAL_COLLECTION_CLIENT_REQUIRED'),
    memo: nullableText(input.memo),
  };
}

export function normalizeLinkManualCollectionSiteInput(
  input: LinkManualCollectionSiteInput,
): Required<Omit<LinkManualCollectionSiteInput, 'memo'>> & { memo: string | null } {
  return {
    entryId: required(input.entryId, 'MANUAL_COLLECTION_ENTRY_REQUIRED'),
    siteId: required(input.siteId, 'MANUAL_COLLECTION_SITE_REQUIRED'),
    memo: nullableText(input.memo),
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
