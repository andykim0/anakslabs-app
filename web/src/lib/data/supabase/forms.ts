/**
 * Supabase FormSubmissionsRepo — 테넌트 사이트 문의 폼 수신 (service role).
 * 실 테이블(form_submissions)은 Phase 3 마이그레이션에서 생성. 여기선 타입 정합 최소 구현.
 */
import type { FormSubmission, FormSubmissionsRepo } from '../types';
import { getServiceRoleClient } from './client';

interface FormSubmissionRow {
  id: string;
  site_id: string;
  payload: unknown;
  created_at: string;
}

function rowToSubmission(row: FormSubmissionRow): FormSubmission {
  return {
    id: row.id,
    siteId: row.site_id,
    payload: (row.payload as Record<string, string> | null) ?? {},
    createdAt: row.created_at,
  };
}

export class SupabaseFormSubmissionsRepo implements FormSubmissionsRepo {
  async create(input: {
    siteId: string;
    clientId: string;
    payload: Record<string, string>;
  }): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('form_submissions').insert({
      site_id: input.siteId,
      client_id: input.clientId,
      payload: input.payload,
    });
    if (error) throw new Error(`form_submissions 저장 실패: ${error.message}`);
  }

  async listBySite(siteId: string): Promise<FormSubmission[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('form_submissions')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`form_submissions 목록 실패: ${error.message}`);
    return ((data ?? []) as FormSubmissionRow[]).map(rowToSubmission);
  }
}
