/**
 * mock 모드 데이터 서비스 — 인메모리(globalThis 싱글턴) 구현.
 * 저장 객체 오염 방지를 위해 조회 결과는 structuredClone으로 복사해 반환한다.
 */
import { INITIAL_GRANT } from '@/lib/credits/constants';
import { ROOT_DOMAIN } from '@/lib/env';
import type {
  Client,
  ClientStatus,
  CustomDomainStatus,
  EditRequest,
  EditStatus,
  EditType,
  ExportStatus,
  Payment,
  PaymentType,
  Site,
  Tier,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type {
  ClientsRepo,
  DataServices,
  DomainService,
  EditRequestsRepo,
  PaymentsService,
  SitesRepo,
} from '../types';
import { slugifySiteName } from '../slug';
import { MockAiService } from './ai';
import { MockCreditsService } from './credits';
import { MockExportService } from './exports';
import { MockFormSubmissionsRepo } from './forms';
import { MockQaRulesService } from './qa';
import { MockScansRepo } from './scans';
import { MockVideoGenRepo } from './video-gen';
import { getMockStore, newId, nowIso } from './store';

// ---------- 고객 ----------

class MockClientsRepo implements ClientsRepo {
  async getById(id: string): Promise<Client | null> {
    const client = getMockStore().clients.get(id);
    return client ? structuredClone(client) : null;
  }

  async upsertFromAuth(input: {
    id: string;
    name: string;
    email: string;
    authProvider: Client['authProvider'];
    tier?: Tier;
  }): Promise<Client> {
    const store = getMockStore();
    const existing = store.clients.get(input.id);
    if (existing) return structuredClone(existing);

    const client: Client = {
      id: input.id,
      name: input.name,
      email: input.email,
      authProvider: input.authProvider,
      tier: input.tier ?? 'basic',
      status: 'active',
      createdAt: nowIso(),
    };
    store.clients.set(client.id, client);
    return structuredClone(client);
  }

  async updateTier(id: string, tier: Tier): Promise<void> {
    const client = getMockStore().clients.get(id);
    if (!client) throw new Error(`clients.updateTier: 고객이 없습니다 (${id})`);
    client.tier = tier;
  }

  async updateStatus(id: string, status: ClientStatus): Promise<void> {
    const client = getMockStore().clients.get(id);
    if (!client) throw new Error(`clients.updateStatus: 고객이 없습니다 (${id})`);
    client.status = status;
  }

  async setCancelRequested(id: string, at: string | null): Promise<void> {
    const client = getMockStore().clients.get(id);
    if (!client) throw new Error(`clients.setCancelRequested: 고객이 없습니다 (${id})`);
    client.cancelRequestedAt = at;
  }

  async listAll(): Promise<Client[]> {
    return [...getMockStore().clients.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((c) => structuredClone(c));
  }
}

// ---------- 사이트 ----------

class MockSitesRepo implements SitesRepo {
  async getById(siteId: string): Promise<Site | null> {
    const site = getMockStore().sites.get(siteId);
    return site ? structuredClone(site) : null;
  }

  async getByDomain(domain: string): Promise<Site | null> {
    const normalized = domain.trim().toLowerCase();
    for (const site of getMockStore().sites.values()) {
      // 발행본 있는 사이트만 — suspended도 반환 (렌더러가 정지 안내를 띄움)
      if (site.domain === normalized && site.siteConfig) {
        return structuredClone(site);
      }
    }
    return null;
  }

  async listByClient(clientId: string): Promise<Site[]> {
    return [...getMockStore().sites.values()]
      .filter((site) => site.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((site) => structuredClone(site));
  }

  async listAll(): Promise<Site[]> {
    return [...getMockStore().sites.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((site) => structuredClone(site));
  }

  async create(input: { clientId: string; name: string; draftConfig: SiteConfig }): Promise<Site> {
    const store = getMockStore();
    const site: Site = {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      name: input.name,
      domain: null,
      domainType: 'subdomain',
      dnsVerified: false,
      cloudflareHostnameId: null,
      status: 'draft',
      siteConfig: null,
      draftConfig: structuredClone(input.draftConfig),
      publishedAt: null,
      createdAt: nowIso(),
      freeRegensUsed: 0,
      exportStatus: 'none',
      exportRequestedAt: null,
      exportUrl: null,
    };
    store.sites.set(site.id, site);
    return structuredClone(site);
  }

  async saveDraft(siteId: string, config: SiteConfig): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (!site) throw new Error(`sites.saveDraft: 사이트가 없습니다 (${siteId})`);
    site.draftConfig = structuredClone(config);
  }

  async publish(siteId: string, auditedDraft?: SiteConfig): Promise<Site> {
    const store = getMockStore();
    const site = store.sites.get(siteId);
    if (!site) throw new Error(`sites.publish: 사이트가 없습니다 (${siteId})`);
    if (!site.draftConfig) throw new Error('sites.publish: 발행할 초안이 없습니다');
    if (!auditedDraft) throw new Error('sites.publish: 검증된 발행 초안이 필요합니다');

    // 도메인 미지정 시 {slug}.ROOT_DOMAIN 자동 할당 (소문자, 중복 회피)
    if (!site.domain) {
      const base = slugifySiteName(site.name) || `site-${site.id.slice(0, 8)}`;
      let candidate = `${base}.${ROOT_DOMAIN}`.toLowerCase();
      let suffix = 2;
      const taken = (domain: string) =>
        [...store.sites.values()].some((s) => s.id !== site.id && s.domain === domain);
      while (taken(candidate)) {
        candidate = `${base}-${suffix}.${ROOT_DOMAIN}`.toLowerCase();
        suffix += 1;
      }
      site.domain = candidate;
      site.domainType = 'subdomain';
    }

    // Q$6: 현재 draft를 다시 읽지 않고 route가 진단한 snapshot만 발행한다.
    site.siteConfig = structuredClone(auditedDraft);
    site.status = 'live';
    site.publishedAt = nowIso();
    return structuredClone(site);
  }

  async updateStatus(siteId: string, status: Site['status']): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (!site) throw new Error(`sites.updateStatus: 사이트가 없습니다 (${siteId})`);
    site.status = status;
  }

  async updateDomain(
    siteId: string,
    input: Partial<Pick<Site, 'domain' | 'domainType' | 'dnsVerified' | 'cloudflareHostnameId' | 'status'>>,
  ): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (!site) throw new Error(`sites.updateDomain: 사이트가 없습니다 (${siteId})`);
    if (input.domain !== undefined) site.domain = input.domain ? input.domain.toLowerCase() : input.domain;
    if (input.domainType !== undefined) site.domainType = input.domainType;
    if (input.dnsVerified !== undefined) site.dnsVerified = input.dnsVerified;
    if (input.cloudflareHostnameId !== undefined) site.cloudflareHostnameId = input.cloudflareHostnameId;
    if (input.status !== undefined) site.status = input.status;
  }

  async incrementFreeRegens(siteId: string): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (!site) throw new Error(`sites.incrementFreeRegens: 사이트가 없습니다 (${siteId})`);
    site.freeRegensUsed = (site.freeRegensUsed ?? 0) + 1;
  }

  async updateExport(
    siteId: string,
    input: { status: ExportStatus; url?: string | null; requestedAt?: string | null },
  ): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (!site) throw new Error(`sites.updateExport: 사이트가 없습니다 (${siteId})`);
    site.exportStatus = input.status;
    if (input.url !== undefined) site.exportUrl = input.url;
    if (input.requestedAt !== undefined) site.exportRequestedAt = input.requestedAt;
  }
}

// ---------- 편집 요청 ----------

class MockEditRequestsRepo implements EditRequestsRepo {
  async create(input: {
    clientId: string;
    siteId: string;
    type: EditType;
    creditCost: number;
    requestedContent: string;
    isInitialRevision?: boolean;
    autoApproved?: boolean;
  }): Promise<EditRequest> {
    const store = getMockStore();
    const editRequest: EditRequest = {
      id: crypto.randomUUID(),
      clientId: input.clientId,
      siteId: input.siteId,
      type: input.type,
      creditCost: input.creditCost,
      status: 'pending',
      requestedContent: input.requestedContent,
      aiOutput: null,
      createdAt: nowIso(),
      appliedAt: null,
      isInitialRevision: input.isInitialRevision ?? false,
      autoApproved: input.autoApproved ?? false,
      reviewedAt: null,
      qaNote: null,
    };
    store.editRequests.set(editRequest.id, editRequest);
    return structuredClone(editRequest);
  }

  async getById(id: string): Promise<EditRequest | null> {
    const editRequest = getMockStore().editRequests.get(id);
    return editRequest ? structuredClone(editRequest) : null;
  }

  async listByClient(clientId: string): Promise<EditRequest[]> {
    return [...getMockStore().editRequests.values()]
      .filter((er) => er.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((er) => structuredClone(er));
  }

  async listQaQueue(): Promise<EditRequest[]> {
    return [...getMockStore().editRequests.values()]
      .filter((er) => er.status === 'ai_processing' || er.status === 'qa_review')
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)) // 오래된 요청 우선
      .map((er) => structuredClone(er));
  }

  async update(
    id: string,
    patch: Partial<{
      status: EditStatus;
      aiOutput: unknown;
      appliedAt: string | null;
      reviewedAt: string | null;
      qaNote: string | null;
    }>,
  ): Promise<void> {
    const editRequest = getMockStore().editRequests.get(id);
    if (!editRequest) throw new Error(`editRequests.update: 편집 요청이 없습니다 (${id})`);
    if ('status' in patch && patch.status !== undefined) editRequest.status = patch.status;
    if ('aiOutput' in patch) editRequest.aiOutput = structuredClone(patch.aiOutput) ?? null;
    if ('appliedAt' in patch) editRequest.appliedAt = patch.appliedAt ?? null;
    if ('reviewedAt' in patch) editRequest.reviewedAt = patch.reviewedAt ?? null;
    if ('qaNote' in patch) editRequest.qaNote = patch.qaNote ?? null;
  }
}

// ---------- 결제 ----------

class MockPaymentsService implements PaymentsService {
  constructor(private readonly credits: MockCreditsService) {}

  async handleWebhook(payload: {
    providerPaymentKey: string;
    clientId: string;
    type: PaymentType;
    amount: number;
    tier?: Tier;
    creditsGranted?: number;
  }): Promise<{ processed: boolean; duplicated: boolean }> {
    const store = getMockStore();

    // 멱등: providerPaymentKey 기준 dedup — 중복 웹훅 = 크레딧 1회만 지급
    if (store.paymentKeys.has(payload.providerPaymentKey)) {
      return { processed: false, duplicated: true };
    }

    const client = store.clients.get(payload.clientId);
    if (!client) {
      throw new Error(`payments.handleWebhook: 알 수 없는 clientId (${payload.clientId})`);
    }

    let creditsGranted = 0;
    if (payload.type === 'build_fee') {
      const tier = payload.tier ?? client.tier;
      creditsGranted = INITIAL_GRANT[tier];
      client.tier = tier; // 빌드비 결제 = 티어 확정 (SQL handle_build_fee_payment와 동일)
    } else if (payload.type === 'credit_pack') {
      if (!payload.creditsGranted || payload.creditsGranted <= 0) {
        throw new Error('payments.handleWebhook: credit_pack은 creditsGranted가 양수여야 합니다');
      }
      creditsGranted = payload.creditsGranted;
    }

    const payment: Payment = {
      id: newId(store, 'pay'),
      clientId: payload.clientId,
      type: payload.type,
      amount: payload.amount,
      creditsGranted,
      providerPaymentKey: payload.providerPaymentKey,
      createdAt: nowIso(),
    };
    store.payments.set(payment.id, payment);
    store.paymentKeys.set(payload.providerPaymentKey, payment.id);

    if (payload.type === 'build_fee') {
      await this.credits.grant({
        clientId: payload.clientId,
        amount: creditsGranted,
        reason: 'initial_grant', // 만료 180일 — CREDIT_EXPIRY_DAYS 기반
        referenceId: payment.id,
        idempotencyKey: `initial_grant:${payload.providerPaymentKey}`,
      });
    } else if (payload.type === 'credit_pack') {
      await this.credits.grant({
        clientId: payload.clientId,
        amount: creditsGranted,
        reason: 'purchase', // 만료 365일
        referenceId: payment.id,
        idempotencyKey: `purchase:${payload.providerPaymentKey}`,
      });
    }
    // maintenance_subscription: 기록만 (크레딧 없음)

    return { processed: true, duplicated: false };
  }

  async listByClient(clientId: string): Promise<Payment[]> {
    return [...getMockStore().payments.values()]
      .filter((p) => p.clientId === clientId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p) => structuredClone(p));
  }

  async listAll(): Promise<Payment[]> {
    return [...getMockStore().payments.values()]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p) => structuredClone(p));
  }

  async getById(id: string): Promise<Payment | null> {
    const p = getMockStore().payments.get(id);
    return p ? structuredClone(p) : null;
  }

  async refund(input: {
    paymentId: string;
    amount: number;
  }): Promise<{ ok: boolean; alreadyRefunded: boolean }> {
    const store = getMockStore();
    const payment = store.payments.get(input.paymentId);
    if (!payment) throw new Error(`payments.refund: 결제가 없습니다 (${input.paymentId})`);
    if (input.amount < 0) throw new Error('payments.refund: amount는 0 이상이어야 합니다');
    if (payment.refundedAt) return { ok: true, alreadyRefunded: true };

    // TODO(실모드): PG 환불 API 호출 후 성공 시 아래 기록/회수 실행.
    payment.refundedAt = nowIso();
    payment.refundAmount = input.amount;

    // build_fee 환불: 초기 지급 크레딧 미사용분 회수
    if (payment.type === 'build_fee') {
      await this.credits.clawbackGrant({
        clientId: payment.clientId,
        referenceId: payment.id,
        grantReason: 'initial_grant',
      });
    }
    return { ok: true, alreadyRefunded: false };
  }
}

// ---------- 커스텀 도메인 (Cloudflare for SaaS 시뮬레이션) ----------

class MockDomainService implements DomainService {
  constructor(private readonly sites: MockSitesRepo) {}

  async requestCustomDomain(siteId: string, hostname: string): Promise<CustomDomainStatus> {
    const store = getMockStore();
    const site = store.sites.get(siteId);
    if (!site) throw new Error(`domains.requestCustomDomain: 사이트가 없습니다 (${siteId})`);

    const normalized = hostname.trim().toLowerCase();
    const existing = store.domainStates.get(siteId);

    if (!existing || existing.hostname !== normalized) {
      if (!existing) store.cfHostnameCount += 1; // 신규 등록만 카운트 증가
      store.domainStates.set(siteId, {
        siteId,
        hostname: normalized,
        state: 'pending',
        checkCount: 0,
        sslStatus: 'initializing',
        records: [
          { type: 'CNAME', name: normalized, value: `fallback.${ROOT_DOMAIN}` },
          {
            type: 'TXT',
            name: `_cf-custom-hostname.${normalized}`,
            value: `anaks-verify-${crypto.randomUUID().slice(0, 13)}`,
          },
        ],
      });
    }

    await this.sites.updateDomain(siteId, {
      domain: normalized,
      domainType: 'custom',
      dnsVerified: false,
      cloudflareHostnameId: `mock-cfh-${siteId.slice(0, 8)}`,
      status: 'pending_dns',
    });

    const state = store.domainStates.get(siteId)!;
    return {
      hostname: state.hostname,
      status: state.state,
      verificationRecords: structuredClone(state.records),
      sslStatus: state.sslStatus,
    };
  }

  async checkStatus(siteId: string): Promise<CustomDomainStatus> {
    const store = getMockStore();
    const state = store.domainStates.get(siteId);
    if (!state) {
      throw new Error(`domains.checkStatus: 연결 중인 커스텀 도메인이 없습니다 (${siteId})`);
    }

    // 데모 체감 전이: 1회째 폴링 = verifying, 2회째부터 = active (DNS 전파 시뮬레이션)
    state.checkCount += 1;
    if (state.state !== 'active') {
      if (state.checkCount >= 2) {
        state.state = 'active';
        state.sslStatus = 'active';
        await this.sites.updateDomain(siteId, { dnsVerified: true, status: 'live' });
      } else {
        state.state = 'verifying';
        state.sslStatus = 'pending_validation';
      }
    }

    return {
      hostname: state.hostname,
      status: state.state,
      verificationRecords: structuredClone(state.records),
      sslStatus: state.sslStatus,
    };
  }

  async countHostnames(): Promise<number> {
    return getMockStore().cfHostnameCount;
  }
}

// ---------- 팩토리 ----------

export function createMockServices(): DataServices {
  const credits = new MockCreditsService();
  const sites = new MockSitesRepo();
  return {
    clients: new MockClientsRepo(),
    sites,
    credits,
    editRequests: new MockEditRequestsRepo(),
    payments: new MockPaymentsService(credits),
    domains: new MockDomainService(sites),
    ai: new MockAiService(),
    exports: new MockExportService(),
    qa: new MockQaRulesService(),
    scans: new MockScansRepo(),
    formSubmissions: new MockFormSubmissionsRepo(),
    videoGen: new MockVideoGenRepo(),
  };
}
