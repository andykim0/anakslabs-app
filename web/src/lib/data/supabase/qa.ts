/**
 * Supabase QaRulesService — qa_automation_rules(규칙) + qa_approval_stats(승인률 뷰).
 * service_role 전용 (관리자 콘솔).
 */
import 'server-only';
import type { EditType, QaApprovalStat, QaAutomationRule } from '@/lib/types/domain';
import type { QaRulesService } from '../types';
import { getServiceRoleClient } from './client';

interface RuleRow {
  edit_type: string;
  enabled: boolean;
  approval_threshold: number | string;
  min_samples: number | string;
  sample_audit_rate: number | string;
}

interface StatRow {
  edit_type: string;
  sample_size: number | string;
  approved_count: number | string;
  approval_rate: number | string;
}

function rowToRule(r: RuleRow): QaAutomationRule {
  return {
    editType: r.edit_type as EditType,
    enabled: r.enabled,
    approvalThreshold: Number(r.approval_threshold),
    minSamples: Number(r.min_samples),
    sampleAuditRate: Number(r.sample_audit_rate),
  };
}

export class SupabaseQaRulesService implements QaRulesService {
  async listRules(): Promise<QaAutomationRule[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('qa_automation_rules').select('*').order('edit_type');
    if (error) throw new Error(`qa_automation_rules 조회 실패: ${error.message}`);
    return ((data ?? []) as RuleRow[]).map(rowToRule);
  }

  async getRule(editType: EditType): Promise<QaAutomationRule | null> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc
      .from('qa_automation_rules')
      .select('*')
      .eq('edit_type', editType)
      .maybeSingle();
    if (error) throw new Error(`qa_automation_rules 조회 실패: ${error.message}`);
    return data ? rowToRule(data as RuleRow) : null;
  }

  async setEnabled(editType: EditType, enabled: boolean): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc
      .from('qa_automation_rules')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('edit_type', editType);
    if (error) throw new Error(`qa_automation_rules 갱신 실패: ${error.message}`);
  }

  async approvalStats(): Promise<QaApprovalStat[]> {
    const svc = getServiceRoleClient();
    const { data, error } = await svc.from('qa_approval_stats').select('*');
    if (error) throw new Error(`qa_approval_stats 조회 실패: ${error.message}`);
    return ((data ?? []) as StatRow[]).map((r) => ({
      editType: r.edit_type as EditType,
      sampleSize: Number(r.sample_size),
      approvedCount: Number(r.approved_count),
      approvalRate: Number(r.approval_rate),
    }));
  }
}
