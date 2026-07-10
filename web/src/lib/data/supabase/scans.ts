/**
 * Supabase ScansRepo — SEO/AEO/GEO 진단 스캔 저장 (service role).
 * 실 테이블(scans)은 Phase 6 마이그레이션에서 생성. 여기선 타입 정합 최소 구현.
 */
import type { ScanIssue, ScanResult, ScansRepo } from '../types';
import { getServiceRoleClient } from './client';

interface ScanRow {
  id: string;
  url: string;
  scores: unknown;
  grade: string;
  issues: unknown;
  client_id: string | null;
  created_at: string;
}

function rowToScan(row: ScanRow): ScanResult {
  return {
    id: row.id,
    url: row.url,
    scores: row.scores as ScanResult['scores'],
    grade: row.grade as ScanResult['grade'],
    issues: (row.issues as ScanIssue[] | null) ?? [],
    clientId: row.client_id ?? null,
    createdAt: row.created_at,
  };
}

export class SupabaseScansRepo implements ScansRepo {
  async create(input: Omit<ScanResult, 'id' | 'createdAt'>): Promise<ScanResult> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('scans')
      .insert({
        url: input.url,
        scores: input.scores,
        grade: input.grade,
        issues: input.issues,
        client_id: input.clientId,
      })
      .select('*')
      .single();
    if (error) throw new Error(`scans 저장 실패: ${error.message}`);
    return rowToScan(data as ScanRow);
  }

  async getById(id: string): Promise<ScanResult | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('scans').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`scans 조회 실패: ${error.message}`);
    return data ? rowToScan(data as ScanRow) : null;
  }

  async claim(scanId: string, clientId: string): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('scans').update({ client_id: clientId }).eq('id', scanId);
    if (error) throw new Error(`scans.claim 실패: ${error.message}`);
  }
}
