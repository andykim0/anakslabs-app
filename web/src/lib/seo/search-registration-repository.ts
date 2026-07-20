import 'server-only';
import { isMockMode } from '@/lib/env';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import type { SearchRegistrationRecord } from './search-registration';

const MOCK_KEY = '__daboimSearchRegistrationQueue__' as const;
type GlobalWithQueue = typeof globalThis & { [MOCK_KEY]?: Map<string, SearchRegistrationRecord> };

function mockQueue(): Map<string, SearchRegistrationRecord> {
  const globalStore = globalThis as GlobalWithQueue;
  return (globalStore[MOCK_KEY] ??= new Map());
}

interface QueueRow {
  site_id: string;
  status: SearchRegistrationRecord['status'];
  account_label: string | null;
  naver_verification: string | null;
  google_verification: string | null;
  index_status: SearchRegistrationRecord['indexStatus'];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function toRecord(row: QueueRow): SearchRegistrationRecord {
  return {
    siteId: row.site_id,
    status: row.status,
    accountLabel: row.account_label,
    naverVerification: row.naver_verification,
    googleVerification: row.google_verification,
    indexStatus: row.index_status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSearchRegistrations(): Promise<SearchRegistrationRecord[]> {
  if (isMockMode()) return [...mockQueue().values()].map((record) => structuredClone(record));
  const { data, error } = await getServiceRoleClient()
    .from('search_registration_queue')
    .select('*')
    .order('created_at');
  if (error) throw new Error(`검색 등록 큐 조회 실패: ${error.message}`);
  return ((data ?? []) as QueueRow[]).map(toRecord);
}

export async function upsertSearchRegistration(
  input: Omit<SearchRegistrationRecord, 'createdAt' | 'updatedAt'>,
): Promise<SearchRegistrationRecord> {
  const now = new Date().toISOString();
  const completedAt = input.status === 'completed' ? (input.completedAt ?? now) : null;
  if (isMockMode()) {
    const existing = mockQueue().get(input.siteId);
    const record: SearchRegistrationRecord = {
      ...input,
      completedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    mockQueue().set(input.siteId, record);
    return structuredClone(record);
  }
  const { data, error } = await getServiceRoleClient()
    .from('search_registration_queue')
    .upsert({
      site_id: input.siteId,
      status: input.status,
      account_label: input.accountLabel,
      naver_verification: input.naverVerification,
      google_verification: input.googleVerification,
      index_status: input.indexStatus,
      completed_at: completedAt,
      updated_at: now,
    }, { onConflict: 'site_id' })
    .select('*')
    .single();
  if (error) throw new Error(`검색 등록 큐 저장 실패: ${error.message}`);
  return toRecord(data as QueueRow);
}
