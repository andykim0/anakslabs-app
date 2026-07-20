import 'server-only';
import { isMockMode } from '@/lib/env';
import type { GuaranteeExceptionCode } from '@/lib/guarantee';
import { getServiceRoleClient } from '@/lib/data/supabase/client';

export interface GuaranteeEvidence {
  siteId: string;
  naverIndexed: boolean | null;
  naverIndexCheckedAt: string | null;
  exceptionCode: GuaranteeExceptionCode | null;
  updatedAt: string;
}

type EvidencePatch = Pick<GuaranteeEvidence, 'naverIndexed' | 'naverIndexCheckedAt' | 'exceptionCode'>;

const MOCK_KEY = '__daboimGuaranteeEvidence__' as const;
type GlobalWithEvidence = typeof globalThis & { [MOCK_KEY]?: Map<string, GuaranteeEvidence> };

function mockEvidence(): Map<string, GuaranteeEvidence> {
  const globalStore = globalThis as GlobalWithEvidence;
  return (globalStore[MOCK_KEY] ??= new Map());
}

interface EvidenceRow {
  site_id: string;
  naver_indexed: boolean | null;
  naver_index_checked_at: string | null;
  exception_code: GuaranteeExceptionCode | null;
  updated_at: string;
}

function toEvidence(row: EvidenceRow): GuaranteeEvidence {
  return {
    siteId: row.site_id,
    naverIndexed: row.naver_indexed,
    naverIndexCheckedAt: row.naver_index_checked_at,
    exceptionCode: row.exception_code,
    updatedAt: row.updated_at,
  };
}

export async function listGuaranteeEvidence(siteIds: readonly string[]): Promise<Map<string, GuaranteeEvidence>> {
  const unique = [...new Set(siteIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  if (isMockMode()) {
    const store = mockEvidence();
    return new Map(unique.flatMap((siteId) => {
      const row = store.get(siteId);
      return row ? [[siteId, structuredClone(row)] as const] : [];
    }));
  }
  const { data, error } = await getServiceRoleClient()
    .from('site_growth_signals')
    .select('site_id,naver_indexed,naver_index_checked_at,exception_code,updated_at')
    .in('site_id', unique);
  if (error) throw new Error(`성과 보장 증빙 조회 실패: ${error.message}`);
  return new Map(((data ?? []) as EvidenceRow[]).map((row) => [row.site_id, toEvidence(row)]));
}

/** 관리자 전용 서버 경계에서만 호출한다. 공개/고객 API에서 노출하지 않는다. */
export async function recordGuaranteeEvidence(siteId: string, patch: EvidencePatch): Promise<GuaranteeEvidence> {
  const now = new Date().toISOString();
  if (isMockMode()) {
    const evidence: GuaranteeEvidence = { siteId, ...patch, updatedAt: now };
    mockEvidence().set(siteId, evidence);
    return structuredClone(evidence);
  }
  const { data, error } = await getServiceRoleClient()
    .from('site_growth_signals')
    .upsert({
      site_id: siteId,
      naver_indexed: patch.naverIndexed,
      naver_index_checked_at: patch.naverIndexCheckedAt,
      exception_code: patch.exceptionCode,
      updated_at: now,
    }, { onConflict: 'site_id' })
    .select('site_id,naver_indexed,naver_index_checked_at,exception_code,updated_at')
    .single();
  if (error) throw new Error(`성과 보장 증빙 저장 실패: ${error.message}`);
  return toEvidence(data as EvidenceRow);
}
