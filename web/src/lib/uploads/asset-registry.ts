import 'server-only';
import { isMockMode } from '@/lib/env';
import { getDataServices } from '@/lib/data';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import {
  createMemoryCustomerAssetRegistry,
  verifyBeforeAfterAssetIds,
  type CreateCustomerAssetProvenance,
  type CustomerAssetProvenance,
  type CustomerAssetRegistry,
  type VerifyBeforeAfterAssetIdsInput,
} from './asset-provenance';

interface CustomerAssetRow {
  id: string;
  client_id: string;
  site_id: string | null;
  object_path: string;
  public_url: string;
  mime_type: CustomerAssetProvenance['mimeType'];
  width: number;
  height: number;
  source: CustomerAssetProvenance['source'];
  ai_generated: boolean;
  generative_edited: boolean;
  case_id: string;
  usage_context: CustomerAssetProvenance['usageContext'];
  rights_attested: boolean;
  same_case_attested: boolean;
  attested_at: string;
  created_at: string;
}

function rowToRecord(row: CustomerAssetRow): CustomerAssetProvenance {
  return {
    id: row.id,
    clientId: row.client_id,
    siteId: row.site_id,
    objectPath: row.object_path,
    publicUrl: row.public_url,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    source: row.source,
    aiGenerated: row.ai_generated,
    generativeEdited: row.generative_edited,
    caseId: row.case_id,
    usageContext: row.usage_context,
    rightsAttested: row.rights_attested,
    sameCaseAttested: row.same_case_attested,
    attestedAt: row.attested_at,
    createdAt: row.created_at,
  };
}

class SupabaseCustomerAssetRegistry implements CustomerAssetRegistry {
  async create(input: CreateCustomerAssetProvenance): Promise<CustomerAssetProvenance> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('motion_asset_provenance')
      .insert({
        client_id: input.clientId,
        site_id: input.siteId,
        object_path: input.objectPath,
        public_url: input.publicUrl,
        mime_type: input.mimeType,
        width: input.width,
        height: input.height,
        source: 'customer-upload',
        ai_generated: false,
        generative_edited: false,
        case_id: input.caseId,
        usage_context: input.usageContext,
        rights_attested: input.rightsAttested,
        same_case_attested: input.sameCaseAttested,
      })
      .select('*')
      .single();
    if (error) throw new Error(`고객 자산 증빙 기록 실패: ${error.message}`);
    return rowToRecord(data as CustomerAssetRow);
  }

  async getById(assetId: string): Promise<CustomerAssetProvenance | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('motion_asset_provenance')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();
    if (error) throw new Error(`고객 자산 증빙 조회 실패: ${error.message}`);
    return data ? rowToRecord(data as CustomerAssetRow) : null;
  }

  async bindToSite(input: { assetId: string; clientId: string; siteId: string }): Promise<CustomerAssetProvenance> {
    const svc = getServiceRoleClient();
    const current = await this.getById(input.assetId);
    if (!current) throw new Error('CUSTOMER_ASSET_NOT_FOUND');
    if (current.clientId !== input.clientId) throw new Error('CUSTOMER_ASSET_OWNER_MISMATCH');
    if (current.siteId && current.siteId !== input.siteId) throw new Error('CUSTOMER_ASSET_SITE_CONFLICT');

    const { data: ownedSite, error: siteError } = await svc
      .from('sites')
      .select('id')
      .eq('id', input.siteId)
      .eq('client_id', input.clientId)
      .maybeSingle();
    if (siteError) throw new Error(`고객 자산 사이트 소유권 확인 실패: ${siteError.message}`);
    if (!ownedSite) throw new Error('CUSTOMER_ASSET_SITE_OWNER_MISMATCH');
    if (current.siteId === input.siteId) return current;

    const { data, error } = await svc
      .from('motion_asset_provenance')
      .update({ site_id: input.siteId })
      .eq('id', input.assetId)
      .eq('client_id', input.clientId)
      .is('site_id', null)
      .select('*')
      .single();
    if (error) throw new Error(`고객 자산 사이트 연결 실패: ${error.message}`);
    return rowToRecord(data as CustomerAssetRow);
  }
}

const GLOBAL_KEY = '__daboimCustomerAssetRegistry__' as const;
type GlobalWithRegistry = typeof globalThis & { [GLOBAL_KEY]?: CustomerAssetRegistry };

/** MOCK_MODE도 data URL과 분리된 서버 레지스트리를 사용한다. */
export function getCustomerAssetRegistry(): CustomerAssetRegistry {
  if (!isMockMode()) return new SupabaseCustomerAssetRegistry();
  const global = globalThis as GlobalWithRegistry;
  global[GLOBAL_KEY] ??= createMemoryCustomerAssetRegistry();
  return global[GLOBAL_KEY];
}

/** 사이트 생성 전 provisional 자산을 소유 사이트에 연결하는 integration seam. */
export async function bindCustomerAssetToOwnedSite(input: {
  assetId: string;
  clientId: string;
  siteId: string;
}): Promise<CustomerAssetProvenance> {
  const site = await getDataServices().sites.getById(input.siteId);
  if (!site || site.clientId !== input.clientId) throw new Error('CUSTOMER_ASSET_SITE_OWNER_MISMATCH');
  return getCustomerAssetRegistry().bindToSite(input);
}

/** 모션/영상 파이프라인이 호출할 유일한 before/after 증빙 검증 진입점. */
export async function verifyRegisteredBeforeAfterAssets(input: VerifyBeforeAfterAssetIdsInput) {
  return verifyBeforeAfterAssetIds(getCustomerAssetRegistry(), input);
}
