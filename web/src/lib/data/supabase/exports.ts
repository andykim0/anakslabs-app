/**
 * Supabase ExportService — 저장 전담(생성은 export route가 lib/export로 직접 수행).
 * 생성된 zip 버퍼를 비공개 버킷(exports/)에 업로드하고, 서명 URL로 다운로드.
 */
import 'server-only';
import { EXPORT_SIGNED_URL_DAYS } from '@/lib/credits/constants';
import { slugifySiteName } from '../slug';
import type { ExportService } from '../types';
import { getServiceRoleClient } from './client';
import type { SupabaseSitesRepo } from './services';

const BUCKET = 'exports';

export class SupabaseExportService implements ExportService {
  constructor(private readonly sites: SupabaseSitesRepo) {}

  async saveExport(input: {
    siteId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<{ objectPath: string }> {
    const svc = getServiceRoleClient();
    const objectPath = `${input.siteId}/${Date.now()}.zip`;
    const { error } = await svc.storage
      .from(BUCKET)
      .upload(objectPath, input.buffer, { contentType: 'application/zip', upsert: true });
    if (error) throw new Error(`export 업로드 실패: ${error.message}`);

    await this.sites.updateExport(input.siteId, {
      status: 'ready',
      url: objectPath,
      requestedAt: new Date().toISOString(),
    });
    return { objectPath };
  }

  async markFailed(siteId: string): Promise<void> {
    await this.sites.updateExport(siteId, { status: 'failed' });
  }

  async getDownloadUrl(objectPath: string): Promise<string> {
    const svc = getServiceRoleClient();
    const filenameHint = `${slugifySiteName(objectPath.split('/')[0]) || 'site'}-backup.zip`;
    const { data, error } = await svc.storage
      .from(BUCKET)
      .createSignedUrl(objectPath, EXPORT_SIGNED_URL_DAYS * 86_400, { download: filenameHint });
    if (error || !data) throw new Error(`export 서명 URL 발급 실패: ${error?.message ?? 'unknown'}`);
    return data.signedUrl;
  }
}
