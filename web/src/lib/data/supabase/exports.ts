/**
 * Supabase ExportService — 스텁 (§5 HTML Export 본구현은 P1-a에서 lib/export 배선 후 교체).
 * 계약(DataServices.exports)을 만족시켜 팩토리가 타입 체크를 통과하게 한다.
 */
import type { ExportResult, ExportService } from '../types';

export class SupabaseExportService implements ExportService {
  async exportSite(_siteId: string): Promise<ExportResult> {
    throw new Error('EXPORT_NOT_IMPLEMENTED: §5 정적 HTML Export는 아직 구현되지 않았습니다.');
  }

  async getDownloadUrl(_objectPath: string): Promise<string> {
    throw new Error('EXPORT_NOT_IMPLEMENTED: §5 정적 HTML Export는 아직 구현되지 않았습니다.');
  }
}
