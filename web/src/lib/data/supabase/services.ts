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
import { ROOT_DOMAIN, reservedAppSubdomainForHostname } from '@/lib/env';
import { PRICING } from '@/lib/pricing';
import type {
  Client,
  ClientStatus,
  EditRequest,
  EditStatus,
  EditType,
  ExportStatus,
  Payment,
  PaymentType,
  Site,
  Tier,
} from '@/lib/types/domain';
import type { SearchVerification, SiteConfig } from '@/lib/types/site';
import { preserveServerSearchVerification, withServerSearchVerification } from '@/lib/seo/search-verification';
import { preserveServerPublicContact } from '@/lib/seo/public-contact';
import { preserveServerConnectorManifest } from '@/lib/connectors/application';
import { preserveServerClinicMaster } from '@/lib/clinic-master/application';
import type { AssetRef } from '@/lib/assets/provenance';
import type { IndustryProfileId } from '@/lib/industry/profiles';
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

  async setCancelRequested(id: string, at: string | null): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('clients').update({ cancel_requested_at: at }).eq('id', id);
    if (error) throw new Error(`clients.cancel_requested_at 갱신 실패: ${error.message}`);
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

  async create(input: {
    clientId: string;
    name: string;
    draftConfig: SiteConfig;
    assetPolicyVersion?: NonNullable<Site['assetPolicyVersion']>;
    assetRefsToBind?: readonly AssetRef[];
    generalAssetAttestationId?: string;
    industryProfileId?: IndustryProfileId;
    pricingModelVersion?: string;
  }): Promise<Site> {
    const svc = getServiceRoleClient();
    if (input.industryProfileId && !input.pricingModelVersion) {
      throw new Error('sites 생성 실패: 업종 프로파일에는 가격표 버전이 필요합니다.');
    }
    if (input.draftConfig.assetRefs?.length && !input.assetRefsToBind?.length) {
      throw new Error('sites 생성 실패: asset manifest는 atomic binding 요청 없이 저장할 수 없습니다.');
    }
    if (input.generalAssetAttestationId && !input.assetRefsToBind?.length) {
      throw new Error('sites 생성 실패: 일반 자산 확인서는 atomic asset binding 없이 귀속할 수 없습니다.');
    }
    if (input.generalAssetAttestationId && input.assetPolicyVersion !== 2) {
      throw new Error('sites 생성 실패: 일반 자산 확인서 귀속은 서버가 지정한 asset policy v2 사이트에만 허용됩니다.');
    }
    if (input.assetRefsToBind?.length) {
      const bindingAssetIds = input.assetRefsToBind.map((ref) => ref.assetId);
      if (new Set(bindingAssetIds).size !== bindingAssetIds.length) {
        throw new Error('sites 생성 실패: atomic binding 자산 ID는 중복될 수 없습니다.');
      }
      const configRefs = input.draftConfig.assetRefs ?? [];
      const sameManifest = configRefs.length === input.assetRefsToBind.length
        && configRefs.every((ref, index) => (
          ref.assetId === input.assetRefsToBind?.[index]?.assetId
          && ref.url === input.assetRefsToBind[index]?.url
        ));
      if (!sameManifest) {
        throw new Error('sites 생성 실패: draft asset manifest와 binding 요청이 일치하지 않습니다.');
      }
      const { resolveAvailableAssetRecords } = await import('@/lib/assets/registry');
      const records = await resolveAvailableAssetRecords({
        assetIds: bindingAssetIds,
        clientId: input.clientId,
      });
      if (records.length !== bindingAssetIds.length) {
        throw new Error('sites 생성 실패: 자산 원장 또는 전역 스톡 등록을 확인할 수 없습니다.');
      }
      const hasCustomerUpload = records.some((record) => record.origin === 'customer_upload');
      if (hasCustomerUpload
        && (input.assetPolicyVersion !== 2 || !input.generalAssetAttestationId)) {
        throw new Error(
          'sites 생성 실패: 새 customer upload manifest에는 asset policy v2와 일반 자산 확인서가 모두 필요합니다.',
        );
      }
      const hasPricingCohort = Boolean(input.pricingModelVersion);
      const rpcName = hasPricingCohort
        ? input.generalAssetAttestationId
          ? 'create_industry_site_with_asset_bindings_and_attestation'
          : 'create_industry_site_with_asset_bindings'
        : input.generalAssetAttestationId
          ? 'create_site_with_asset_bindings_and_attestation'
          : 'create_site_with_asset_bindings';
      const rpcArgs = {
          p_client_id: input.clientId,
          p_name: input.name,
          p_draft_config: input.draftConfig,
          p_asset_policy_version: input.assetPolicyVersion ?? null,
          p_asset_ids: bindingAssetIds,
          ...(input.generalAssetAttestationId
            ? { p_general_attestation_id: input.generalAssetAttestationId }
            : {}),
          ...(hasPricingCohort
            ? {
                p_industry_profile_id: input.industryProfileId ?? null,
                p_pricing_model_version: input.pricingModelVersion,
              }
            : {}),
        };
      const { data, error } = await svc
        .rpc(rpcName, rpcArgs)
        .single();
      if (error) throw new Error(`sites+asset binding 원자 생성 실패: ${error.message}`);
      return rowToSite(data as SiteRow);
    }
    const { data, error } = await svc
      .from('sites')
      .insert({
        client_id: input.clientId,
        name: input.name,
        draft_config: input.draftConfig,
        status: 'draft',
        ...(input.industryProfileId ? { industry_profile_id: input.industryProfileId } : {}),
        ...(input.pricingModelVersion ? { pricing_model_version: input.pricingModelVersion } : {}),
        ...(input.assetPolicyVersion ? { asset_policy_version: input.assetPolicyVersion } : {}),
      })
      .select('*')
      .single();
    if (error) throw new Error(`sites 생성 실패: ${error.message}`);
    return rowToSite(data as SiteRow);
  }

  async saveDraft(siteId: string, config: SiteConfig): Promise<void> {
    // 세션 클라이언트 — RLS(본인 소유) + 트리거(허용 컬럼: name/draft_config/survey) 심층방어
    const supabase = await createSessionClient();
    const { data: current, error: readError } = await supabase
      .from('sites')
      .select('draft_config,site_config')
      .eq('id', siteId)
      .single();
    if (readError) throw new Error(`sites 초안 조회 실패: ${readError.message}`);
    const persisted = (current?.draft_config ?? current?.site_config ?? null) as SiteConfig | null;
    const safeConfig = preserveServerConnectorManifest(
      preserveServerClinicMaster(
        preserveServerPublicContact(
          preserveServerSearchVerification(config, persisted),
          persisted,
        ),
        persisted,
      ),
      persisted,
    );
    const { error } = await supabase
      .from('sites')
      .update({ draft_config: safeConfig })
      .eq('id', siteId)
      .select('id')
      .single();
    if (error) throw new Error(`sites 초안 저장 실패: ${error.message}`);
  }

  async setSearchVerification(siteId: string, verification: SearchVerification | undefined): Promise<void> {
    const svc = getServiceRoleClient();
    const site = await this.getById(siteId);
    if (!site) throw new Error(`sites.setSearchVerification: 사이트가 없습니다 (${siteId})`);
    const draftConfig = site.draftConfig ? withServerSearchVerification(site.draftConfig, verification) : null;
    const siteConfig = site.siteConfig ? withServerSearchVerification(site.siteConfig, verification) : null;
    const { error } = await svc.from('sites').update({ draft_config: draftConfig, site_config: siteConfig }).eq('id', siteId);
    if (error) throw new Error(`검색 소유확인 값 저장 실패: ${error.message}`);
  }

  async publish(siteId: string, auditedDraft?: SiteConfig): Promise<Site> {
    const svc = getServiceRoleClient();
    const site = await this.getById(siteId);
    if (!site) throw new Error(`sites.publish: 사이트가 없습니다 (${siteId})`);
    if (!site.draftConfig) throw new Error('sites.publish: 발행할 초안이 없습니다');
    if (!auditedDraft) throw new Error('sites.publish: 검증된 발행 초안이 필요합니다');

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
        if (!taken && reservedAppSubdomainForHostname(candidate) === null) break;
        candidate = `${base}-${suffix}.${ROOT_DOMAIN}`.toLowerCase();
        suffix += 1;
      }
      domain = candidate;
    }
    if (reservedAppSubdomainForHostname(domain) !== null) {
      throw new Error('sites.publish: 예약 앱 호스트는 고객 사이트로 발행할 수 없습니다.');
    }

    const { data, error } = await svc
      .from('sites')
      .update({
        // Q$6: 진단 뒤 다른 탭이 autosave해도 미검사 최신본이 아니라 진단 snapshot을 발행한다.
        site_config: auditedDraft,
        status: 'live',
        domain,
        draft_expires_at: null,
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
    if (input.domain !== undefined) {
      const domain = input.domain ? input.domain.toLowerCase() : input.domain;
      if (domain && reservedAppSubdomainForHostname(domain) !== null) {
        throw new Error('sites.updateDomain: 예약 앱 호스트는 고객 도메인으로 할당할 수 없습니다.');
      }
      patch.domain = domain;
    }
    if (input.domainType !== undefined) patch.domain_type = input.domainType;
    if (input.dnsVerified !== undefined) patch.dns_verified = input.dnsVerified;
    if (input.cloudflareHostnameId !== undefined) patch.cloudflare_hostname_id = input.cloudflareHostnameId;
    if (input.status !== undefined) patch.status = input.status;
    if (Object.keys(patch).length === 0) return;

    const { error } = await svc.from('sites').update(patch).eq('id', siteId);
    if (error) throw new Error(`sites 도메인 정보 갱신 실패: ${error.message}`);
  }

  async incrementFreeRegens(siteId: string): Promise<void> {
    const svc = getServiceRoleClient();
    // 원자적 증가: 현재값 조회 후 +1 (동시 재생성은 온보딩 단일 세션이라 경합 낮음)
    const { data, error: readErr } = await svc
      .from('sites')
      .select('free_regens_used')
      .eq('id', siteId)
      .single();
    if (readErr) throw new Error(`sites.free_regens_used 조회 실패: ${readErr.message}`);
    const next = Number((data as { free_regens_used: number | null }).free_regens_used ?? 0) + 1;
    const { error } = await svc.from('sites').update({ free_regens_used: next }).eq('id', siteId);
    if (error) throw new Error(`sites.free_regens_used 갱신 실패: ${error.message}`);
  }

  async updateExport(
    siteId: string,
    input: { status: ExportStatus; url?: string | null; requestedAt?: string | null },
  ): Promise<void> {
    const svc = getServiceRoleClient();
    const patch: Record<string, unknown> = { export_status: input.status };
    if (input.url !== undefined) patch.export_url = input.url;
    if (input.requestedAt !== undefined) patch.export_requested_at = input.requestedAt;
    const { error } = await svc.from('sites').update(patch).eq('id', siteId);
    if (error) throw new Error(`sites export 상태 갱신 실패: ${error.message}`);
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
    isInitialRevision?: boolean;
    autoApproved?: boolean;
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
        is_initial_revision: input.isInitialRevision ?? false,
        auto_approved: input.autoApproved ?? false,
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
    patch: Partial<{
      status: EditStatus;
      aiOutput: unknown;
      appliedAt: string | null;
      reviewedAt: string | null;
      qaNote: string | null;
    }>,
  ): Promise<void> {
    const svc = getServiceRoleClient();
    const row: Record<string, unknown> = {};
    if ('status' in patch && patch.status !== undefined) row.status = patch.status;
    if ('aiOutput' in patch) row.ai_output = patch.aiOutput ?? null;
    if ('appliedAt' in patch) row.applied_at = patch.appliedAt ?? null;
    if ('reviewedAt' in patch) row.reviewed_at = patch.reviewedAt ?? null;
    if ('qaNote' in patch) row.qa_note = patch.qaNote ?? null;
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
    pricingModelVersion?: string;
    periodMonths?: number;
    siteId?: string;
    industryProfileId?: IndustryProfileId;
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
        const hasIndustryContract = Boolean(
          payload.siteId
          && payload.industryProfileId
          && payload.pricingModelVersion,
        );
        rpcName = hasIndustryContract
          ? 'handle_industry_maintenance_payment'
          : 'handle_maintenance_payment';
        rpcArgs = hasIndustryContract
          ? {
              p_site_id: payload.siteId,
              p_client_id: payload.clientId,
              p_provider_payment_key: payload.providerPaymentKey,
              p_amount: payload.amount,
              p_industry_profile_id: payload.industryProfileId,
              p_pricing_model_version: payload.pricingModelVersion,
              p_period_months: payload.periodMonths ?? PRICING.subscription.periodMonths,
            }
          : {
              p_client_id: payload.clientId,
              p_provider_payment_key: payload.providerPaymentKey,
              p_amount: payload.amount,
              p_pricing_model_version: payload.pricingModelVersion ?? PRICING.modelVersion,
              p_period_months: payload.periodMonths ?? PRICING.subscription.periodMonths,
            };
        break;
      }
      case 'premium_addon': {
        rpcName = 'handle_premium_addon_payment';
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

  async getById(id: string): Promise<Payment | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('payments').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`payments 조회 실패: ${error.message}`);
    return data ? rowToPayment(data as PaymentRow) : null;
  }

  async refund(input: {
    paymentId: string;
    amount: number;
  }): Promise<{ ok: boolean; alreadyRefunded: boolean }> {
    const svc = getServiceRoleClient();
    // TODO(실모드): PG 환불 API(토스) 호출 후 성공 시 아래 원장 정합 함수 실행.
    const { data, error } = await svc.rpc('admin_refund_payment', {
      p_payment_id: input.paymentId,
      p_amount: input.amount,
    });
    if (error) throw new Error(`admin_refund_payment 실패: ${error.message}`);
    const result = (data ?? {}) as { ok?: boolean; already_refunded?: boolean };
    return { ok: !!result.ok, alreadyRefunded: !!result.already_refunded };
  }
}
