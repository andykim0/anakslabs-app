/**
 * Mock 모드 인메모리 스토어 — globalThis 싱글턴(dev HMR에도 유지).
 * 크레딧 원장(ledger)이 잔액의 source of truth이며, lots는 만료 FIFO 소진을 위한
 * 지급 lot별 잔여량 추적(실 DB의 SQL 함수가 하는 일을 인메모리로 재현).
 */
import type {
  Client,
  CreditLedgerEntry,
  CustomDomainState,
  DnsRecordInstruction,
  EditRequest,
  EditType,
  Payment,
  QaAutomationRule,
  Site,
} from '@/lib/types/domain';
import type { FormSubmission, ScanResult, SiteEventAggregate } from '../types';
import type { ManualPaymentEntry } from '@/lib/payments/manual-collection-core';
import { buildSeed } from './seed';

/** 지급(양수) 원장 행 1개 = lot 1개. remaining은 소진/만료로 감소 */
export interface MockLot {
  entryId: string;
  clientId: string;
  remaining: number;
  expiresAt: string | null;
}

export interface MockDomainState {
  siteId: string;
  hostname: string;
  state: CustomDomainState;
  /** checkStatus 호출 횟수 — 데모 체감용 전이(1회: verifying, 2회~: active) */
  checkCount: number;
  records: DnsRecordInstruction[];
  sslStatus?: string;
}

export interface MockStore {
  clients: Map<string, Client>;
  sites: Map<string, Site>;
  /** 크레딧 원장 — append only */
  ledger: CreditLedgerEntry[];
  lots: MockLot[];
  /** grant idempotencyKey dedup */
  grantKeys: Set<string>;
  editRequests: Map<string, EditRequest>;
  payments: Map<string, Payment>;
  /** providerPaymentKey → payment.id (웹훅 멱등) */
  paymentKeys: Map<string, string>;
  /** [OPS$] append-only manual collection companion ledger (lazy, seed unchanged). */
  manualPaymentEntries?: Map<string, ManualPaymentEntry>;
  /** siteId → 커스텀 도메인 검증 상태 */
  domainStates: Map<string, MockDomainState>;
  /** Cloudflare custom hostname 총수 (시드 7) */
  cfHostnameCount: number;
  /** [§5] mock export zip 보관 — object path → { 버퍼, 다운로드 파일명 } */
  exportBlobs: Map<string, { buffer: Buffer; filename: string }>;
  /** [§2] QA 자동화 규칙 (유형별) */
  qaRules: Map<EditType, QaAutomationRule>;
  /** [v3 Phase 6] SEO/AEO/GEO 진단 스캔 — scanId → 결과 */
  scans: Map<string, ScanResult>;
  /** [v3 Phase 3] 테넌트 사이트 문의 폼 수신 — submissionId → 제출 */
  formSubmissions: Map<string, FormSubmission>;
  /** [RPT$] site/date/event/source별 PII 없는 누적 카운트 */
  siteEvents: Map<string, SiteEventAggregate>;
  /** [motion 4단계] 영상 생성 로그 (비용 가드 카운트 + 프롬프트 튜닝). optional=lazy init(시드 무변경) */
  videoGenLog?: { siteId: string; tier: string; model: string; stage: string; prompt?: string; detail?: string; at: number }[];
  counters: { id: number; text: number; image: number };
}

export function newId(store: MockStore, prefix: string): string {
  store.counters.id += 1;
  return `${prefix}-${store.counters.id.toString(36).padStart(4, '0')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export function daysFromIso(baseIso: string, days: number): string {
  return new Date(new Date(baseIso).getTime() + days * 86_400_000).toISOString();
}

const GLOBAL_KEY = '__anaksMockStore__' as const;

type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: MockStore };

export function getMockStore(): MockStore {
  const g = globalThis as GlobalWithStore;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = buildSeed();
  }
  return g[GLOBAL_KEY];
}

/** 테스트/데모 리셋용 — 다음 접근 시 시드부터 다시 생성 */
export function resetMockStore(): void {
  const g = globalThis as GlobalWithStore;
  delete g[GLOBAL_KEY];
}
