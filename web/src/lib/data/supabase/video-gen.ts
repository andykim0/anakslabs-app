/**
 * [motion 4단계] Supabase VideoGenRepo — video_gen_log 테이블(service role).
 * 비용 가드(사이트당·일일 상한)의 진실 소스 + 프롬프트 튜닝 데이터. 마이그레이션 0008.
 * count*는 원가 발생분(stage draft/final)만 센다(select 제외).
 */
import type { VideoGenLogInput, VideoGenRepo } from '../types';
import { getServiceRoleClient } from './client';

export class SupabaseVideoGenRepo implements VideoGenRepo {
  async record(input: VideoGenLogInput): Promise<void> {
    const svc = getServiceRoleClient();
    const { error } = await svc.from('video_gen_log').insert({
      site_id: input.siteId,
      tier: input.tier,
      model: input.model,
      stage: input.stage,
      prompt: input.prompt ?? null,
      detail: input.detail ?? null,
    });
    if (error) throw new Error(`video_gen_log 기록 실패: ${error.message}`);
  }

  async countBySite(siteId: string): Promise<number> {
    const svc = getServiceRoleClient();
    const { count, error } = await svc
      .from('video_gen_log')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', siteId)
      .neq('stage', 'select');
    if (error) throw new Error(`video_gen_log 사이트 카운트 실패: ${error.message}`);
    return count ?? 0;
  }

  async countToday(): Promise<number> {
    const svc = getServiceRoleClient();
    const d = new Date();
    const sinceIso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
    const { count, error } = await svc
      .from('video_gen_log')
      .select('id', { count: 'exact', head: true })
      .neq('stage', 'select')
      .gte('created_at', sinceIso);
    if (error) throw new Error(`video_gen_log 일일 카운트 실패: ${error.message}`);
    return count ?? 0;
  }
}
