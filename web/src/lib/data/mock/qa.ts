/**
 * mock QaRulesService — 유형별 자동화 규칙(인메모리) + 승인률 집계(편집 요청 기반).
 * SQL qa_automation_rules / qa_approval_stats 뷰의 의미를 재현.
 */
import 'server-only';
import { QA_AUTOMATION_DEFAULTS } from '@/lib/credits/constants';
import type { EditType, QaApprovalStat, QaAutomationRule } from '@/lib/types/domain';
import type { QaRulesService } from '../types';
import { getMockStore } from './store';

const TYPES: EditType[] = ['text', 'image', 'video', 'structure'];

export class MockQaRulesService implements QaRulesService {
  async listRules(): Promise<QaAutomationRule[]> {
    const store = getMockStore();
    return TYPES.map((t) => ({ ...(store.qaRules.get(t) as QaAutomationRule) }));
  }

  async getRule(editType: EditType): Promise<QaAutomationRule | null> {
    const rule = getMockStore().qaRules.get(editType);
    return rule ? { ...rule } : null;
  }

  async setEnabled(editType: EditType, enabled: boolean): Promise<void> {
    const rule = getMockStore().qaRules.get(editType);
    if (!rule) throw new Error(`qa.setEnabled: 알 수 없는 유형 (${editType})`);
    rule.enabled = enabled;
  }

  async approvalStats(): Promise<QaApprovalStat[]> {
    const store = getMockStore();
    const window = QA_AUTOMATION_DEFAULTS.recentWindow;
    return TYPES.map((editType) => {
      const recent = [...store.editRequests.values()]
        .filter((er) => er.type === editType && (er.status === 'applied' || er.status === 'rejected'))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, window);
      const sampleSize = recent.length;
      const approvedCount = recent.filter((er) => er.status === 'applied').length;
      const approvalRate = sampleSize === 0 ? 0 : Math.round((approvedCount / sampleSize) * 10000) / 10000;
      return { editType, sampleSize, approvedCount, approvalRate };
    });
  }
}
