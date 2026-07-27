import 'server-only';
import { surveySchema, siteConfigSchema } from '@/app/api/_lib/schemas';
import { getServiceRoleClient } from '@/lib/data/supabase/client';
import type { SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  buildContentSourceSnapshot,
} from './source-snapshot';
import type { ContentSourceSnapshot } from './contracts';

interface ContentSourceSiteRow {
  id: string;
  client_id: string;
  survey: unknown;
  draft_config: unknown;
  site_config: unknown;
}

export interface ContentGenerationContext {
  siteId: string;
  clientId: string;
  survey: SurveyInput;
  config: SiteConfig;
  sourceSnapshot: ContentSourceSnapshot;
}

/**
 * C8 경계: 기존 Site mapper에 survey를 추가하지 않는다. content pipeline만 sites.survey를
 * service-role로 명시 조회해 현재 고객 원료 스냅샷을 만든다.
 */
export async function loadContentGenerationContext(
  siteId: string,
  options: { capturedAt?: string } = {},
): Promise<ContentGenerationContext> {
  const { data, error } = await getServiceRoleClient()
    .from('sites')
    .select('id,client_id,survey,draft_config,site_config')
    .eq('id', siteId)
    .maybeSingle();
  if (error) throw new Error(`content source site lookup failed: ${error.message}`);
  if (!data) throw new Error('CONTENT_SOURCE_SITE_NOT_FOUND');
  const row = data as unknown as ContentSourceSiteRow;
  const survey = surveySchema.parse(row.survey) as SurveyInput;
  const config = siteConfigSchema.parse(row.draft_config ?? row.site_config) as SiteConfig;
  const sourceSnapshot = buildContentSourceSnapshot({
    siteId: row.id,
    clientId: row.client_id,
    survey,
    config,
    capturedAt: options.capturedAt ?? new Date().toISOString(),
  });
  return {
    siteId: row.id,
    clientId: row.client_id,
    survey,
    config,
    sourceSnapshot,
  };
}
