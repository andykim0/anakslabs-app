/**
 * Supabase 구현 — 고객/사이트/편집요청/결제.
 *
 * 클라이언트 선택 원칙:
 *  - 기본은 service role (관리자 콘솔·렌더러·웹훅 등 세션 없는 컨텍스트에서도 재사용되므로).
 *    테넌트 격리는 API 계층의 소유권 검증 + 명시적 client_id 필터로 보장.
 *  - sites.saveDraft만 세션 클라이언트 — DB 트리거가 보호 컬럼(도메인/상태/발행본)을
 *    가드하는 심층방어를 그대로 활용한다 (고객은 name/draft_config/survey만 수정 가능).
 *  - 금전 쓰기(payments/credit_*)는 전부 security definer SQL 함수 rpc 경유.
 */
import { INITIAL_GRANT } from '@/lib/credits/constants';
import { ROOT_DOMAIN } from '@/lib/env';
import type {
  Client,
  ClientStatus,
  EditRequest,
  EditStatus,
  EditType,
  Payment,
  PaymentType,
  Site,
  Tier,
} from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import type { ClientsRepo, EditRequestsRepo, PaymentsService, SitesRepo } from '../types';
import { slugifySiteName } from '../slug';
import { createSessionClient, getServiceRoleClient } from './client';
import {
  rowToClient,
  rowToEditRequest,
  rowToPayment,
  rowToSite,
  type ClientRow,
  type EditRequestRow,
  type PaymentRow,
  type SiteRow,
} from './mappers';

// ---------- 고객 ----------

export class SupabaseClientsRepo implements ClientsRepo {
  async getById(id: string): Promise<Client | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('clients').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`clients 조회 실패: ${error.message}`);
    return data ? rowToClient(data as ClientRow) : null;
  }

  async upsertFromAuth(input: {
    id: string;
    name: string;
    email: string;
    authProvider: Client['authProvider'];
    tier?: Tier;
  }): Promise<Client> {
    const svc = getServiceRoleClient();
    const existing = await this.getById(input.id);
    if (existing) return existing; // 기존 row 보존 (tier/status 덮어쓰지 않음)

    const { data, error } = await svc
      .from('clients')
      .insert({
        id: input.id,
        name: input.name,
        email: input.email,
        auth_provider: input.authProvider,
        tier: input.tier ?? 'basic',
      })
      .select('*')
      .single();

    if (error) {
      // 동시 로그인 경합(23505) — 이미 생성됐으면 다시 조회
      if (error.code === '23505') {
        const raced = await this.getById(input.id);
        if (raced) return raced;
      }
      throw new Error(`clients 생성 실패: ${error.message}`);
    }
    return rowToClient(data as ClientRow);
  }

  async updateTier(id: string, tier: Tier): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('clients').update({ tier }).eq('id', id);
    if (error) throw new Error(`clients.tier 갱신 실패: ${error.message}`);
  }

  async updateStatus(id: string, status: ClientStatus): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('clients').update({ status }).eq('id', id);
    if (error) throw new Error(`clients.status 갱신 실패: ${error.message}`);
  }

  async listAll(): Promise<Client[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('clients').select('*').order('created_at');
    if (error) throw new Error(`clients 목록 실패: ${error.message}`);
    return ((data ?? []) as ClientRow[]).map(rowToClient);
  }
}

// ---------- 사이트 ----------

export class SupabaseSitesRepo implements SitesRepo {
  async getById(siteId: string): Promise<Site | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('sites').select('*').eq('id', siteId).maybeSingle();
    if (error) throw new Error(`sites 조회 실패: ${error.message}`);
    return data ? rowToSite(data as SiteRow) : null;
  }

  async getByDomain(domain: string): Promise<Site | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('sites')
      .select('*')
      .eq('domain', domain.trim().toLowerCase())
      .not('site_config', 'is', null) // 발행본 있는 사이트만 (suspended 포함 — 렌더러가 정지 안내)
      .maybeSingle();
    if (error) throw new Error(`sites 도메인 조회 실패: ${error.message}`);
    return data ? rowToSite(data as SiteRow) : null;
  }

  async listByClient(clientId: string): Promise<Site[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('sites')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at');
    if (error) throw new Error(`sites 목록 실패: ${error.message}`);
    return ((data ?? []) as SiteRow[]).map(rowToSite);
  }

  async listAll(): Promise<Site[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('sites').select('*').order('created_at');
    if (error) throw new Error(`sites 전체 목록 실패: ${error.message}`);
    return ((data ?? []) as SiteRow[]).map(rowToSite);
  }

  async create(input: { clientId: string; name: string; draftConfig: SiteConfig }): Promise<Site> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('sites')
      .insert({
        client_id: input.clientId,
        name: input.name,
        draft_config: input.draftConfig,
        status: 'draft',
      })
      .select('*')
      .single();
    if (error) throw new Error(`sites 생성 실패: ${error.message}`);
    return rowToSite(data as SiteRow);
  }

  async saveDraft(siteId: string, config: SiteConfig): Promise<void> {
    // 세션 클라이언트 — RLS(본인 소유) + 트리거(허용 컬럼: name/draft_config/survey) 심층방어
    const supabase = await createSessionClient();
    const { error } = await supabase
      .from('sites')
      .update({ draft_config: config })
      .eq('id', siteId)
      .select('id')
      .single();
    if (error) throw new Error(`sites 초안 저장 실패: ${error.message}`);
  }

  async publish(siteId: string): Promise<Site> {
    const svc = getServiceRoleClient();
    const site = await this.getById(siteId);
    if (!site) throw new Error(`sites.publish: 사이트가 없습니다 (${siteId})`);
    if (!site.draftConfig) throw new Error('sites.publish: 발행할 초안이 없습니다');

    // 도메인 미지정 시 {slug}.ROOT_DOMAIN 자동 할당 (소문자, 중복 회피)
    let domain = site.domain;
    if (!domain) {
      const base = slugifySiteName(site.name) || `site-${site.id.slice(0, 8)}`;
      let candidate = `${base}.${ROOT_DOMAIN}`.toLowerCase();
      let suffix = 2;
      // 유니크 제약이 최종 방어선 — 여기선 충돌 예방 조회
      for (;;) {
        const { data: taken, error } = await svc
          .from('sites')
          .select('id')
          .eq('domain', candidate)
          .neq('id', site.id)
          .maybeSingle();
        if (error) throw new Error(`도메인 중복 확인 실패: ${error.message}`);
        if (!taken) break;
        candidate = `${base}-${suffix}.${ROOT_DOMAIN}`.toLowerCase();
        suffix += 1;
      }
      domain = candidate;
    }

    const { data, error } = await svc
      .from('sites')
      .update({
        site_config: site.draftConfig,
        status: 'live',
        domain,
        published_at: new Date().toISOString(),
      })
      .eq('id', siteId)
      .select('*')
      .single();
    if (error) throw new Error(`sites 발행 실패: ${error.message}`);
    return rowToSite(data as SiteRow);
  }

  async updateStatus(siteId: string, status: Site['status']): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('sites').update({ status }).eq('id', siteId);
    if (error) throw new Error(`sites.status 갱신 실패: ${error.message}`);
  }

  async updateDomain(
    siteId: string,
    input: Partial<Pick<Site, 'domain' | 'domainType' | 'dnsVerified' | 'cloudflareHostnameId' | 'status'>>,
  ): Promise<void> {
    const svc = getServiceRoleClient();
    const patch: Record<string, unknown> = {};
    if (input.domain !== undefined) patch.domain = input.domain ? input.domain.toLowerCase() : input.domain;
    if (input.domainType !== undefined) patch.domain_type = input.domainType;
    if (input.dnsVerified !== undefined) patch.dns_verified = input.dnsVerified;
    if (input.cloudflareHostnameId !== undefined) patch.cloudflare_hostname_id = input.cloudflareHostnameId;
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length === 0) return;

    const { error } = await svc.from('sites').update(patch).eq('id', siteId);
    if (error) throw new Error(`sites 도메인 정보 갱신 실패: ${error.message}`);
  }
}

// ---------- 편집 요청 ----------

export class SupabaseEditRequestsRepo implements EditRequestsRepo {
  async create(input: {
    clientId: string;
    siteId: string;
    type: EditType;
    creditCost: number;
    requestedContent: string;
  }): Promise<EditRequest> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('edit_requests')
      .insert({
        client_id: input.clientId,
        site_id: input.siteId,
        type: input.type,
        credit_cost: input.creditCost,
        status: 'pending',
        requested_content: input.requestedContent,
      })
      .select('*')
      .single();
    if (error) throw new Error(`edit_requests 생성 실패: ${error.message}`);
    return rowToEditRequest(data as EditRequestRow);
  }

  async getById(id: string): Promise<EditRequest | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('edit_requests').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`edit_requests 조회 실패: ${error.message}`);
    return data ? rowToEditRequest(data as EditRequestRow) : null;
  }

  async listByClient(clientId: string): Promise<EditRequest[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('edit_requests')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`edit_requests 목록 실패: ${error.message}`);
    return ((data ?? []) as EditRequestRow[]).map(rowToEditRequest);
  }

  async listQaQueue(): Promise<EditRequest[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('edit_requests')
      .select('*')
      .in('status', ['ai_processing', 'qa_review'])
      .order('created_at'); // 오래된 요청 우선
    if (error) throw new Error(`QA 큐 조회 실패: ${error.message}`);
    return ((data ?? []) as EditRequestRow[]).map(rowToEditRequest);
  }

  async update(
    id: string,
    patch: Partial<{ status: EditStatus; aiOutput: unknown; appliedAt: string | null }>,
  ): Promise<void> {
    const svc = getServiceRoleClient();
    const row: Record<string, unknown> = {};
    if ('status' in patch && patch.status !== undefined) row.status = patch.status;
    if ('aiOutput' in patch) row.ai_output = patch.aiOutput ?? null;
    if ('appliedAt' in patch) row.applied_at = patch.appliedAt ?? null;
    if (Object.keys(row).length === 0) return;

    const { error } = await svc.from('edit_requests').update(row).eq('id', id);
    if (error) throw new Error(`edit_requests 갱신 실패: ${error.message}`);
  }
}

// ---------- 결제 ----------

interface WebhookRpcResult {
  processed?: boolean;
  duplicated?: boolean;
  payment_id?: string;
  credits_granted?: number;
}

export class SupabasePaymentsService implements PaymentsService {
  constructor(private readonly clients: SupabaseClientsRepo) {}

  async handleWebhook(payload: {
    providerPaymentKey: string;
    clientId: string;
    type: PaymentType;
    amount: number;
    tier?: Tier;
    creditsGranted?: number;
  }): Promise<{ processed: boolean; duplicated: boolean }> {
    const svc = getServiceRoleClient();

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    switch (payload.type) {
      case 'build_fee': {
        // tier 미지정 시 현재 고객 tier 기준 (INITIAL_GRANT 계산은 SQL 함수 내부)
        let tier = payload.tier;
        if (!tier) {
          const client = await this.clients.getById(payload.clientId);
          if (!client) throw new Error(`payments.handleWebhook: 알 수 없는 clientId (${payload.clientId})`);
          tier = client.tier;
        }
        if (INITIAL_GRANT[tier] === undefined) {
          throw new Error(`payments.handleWebhook: 알 수 없는 tier (${tier})`);
        }
        rpcName = 'handle_build_fee_payment';
        rpcArgs = {
          p_client_id: payload.clientId,
          p_provider_payment_key: payload.providerPaymentKey,
          p_amount: payload.amount,
          p_tier: tier,
        };
        break;
      }
      case 'credit_pack': {
        if (!payload.creditsGranted || payload.creditsGranted <= 0) {
          throw new Error('payments.handleWebhook: credit_pack은 creditsGranted가 양수여야 합니다');
        }
        rpcName = 'handle_credit_pack_payment';
        rpcArgs = {
          p_client_id: payload.clientId,
          p_provider_payment_key: payload.providerPaymentKey,
          p_amount: payload.amount,
          p_credits: payload.creditsGranted,
        };
        break;
      }
      case 'maintenance_subscription': {
        rpcName = 'handle_maintenance_payment';
        rpcArgs = {
          p_client_id: payload.clientId,
          p_provider_payment_key: payload.providerPaymentKey,
          p_amount: payload.amount,
        };
        break;
      }
    }

    const { data, error } = await svc.rpc(rpcName, rpcArgs);
    if (error) throw new Error(`${rpcName} 실패: ${error.message}`);

    const result = (data ?? {}) as WebhookRpcResult;
    return { processed: !!result.processed, duplicated: !!result.duplicated };
  }

  async listByClient(clientId: string): Promise<Payment[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('payments')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`payments 목록 실패: ${error.message}`);
    return ((data ?? []) as PaymentRow[]).map(rowToPayment);
  }

  async listAll(): Promise<Payment[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`payments 전체 목록 실패: ${error.message}`);
    return ((data ?? []) as PaymentRow[]).map(rowToPayment);
  }
}
