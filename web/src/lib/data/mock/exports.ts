/**
 * mock ExportService — 저장 전담(생성은 export route가 lib/export로 직접 수행).
 * 생성된 zip 버퍼를 인메모리(스토어)에 보관하고, 다운로드 라우트가 스트리밍한다.
 */
import 'server-only';
import type { ExportService } from '../types';
import { getMockStore, nowIso } from './store';

/** 다운로드 라우트가 mock export 버퍼를 읽는다 */
export function getMockExportBlob(objectPath: string): { buffer: Buffer; filename: string } | null {
  return getMockStore().exportBlobs.get(objectPath) ?? null;
}

export class MockExportService implements ExportService {
  async saveExport(input: {
    siteId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<{ objectPath: string }> {
    const store = getMockStore();
    const site = store.sites.get(input.siteId);
    if (!site) throw new Error(`exports.saveExport: 사이트가 없습니다 (${input.siteId})`);

    const objectPath = `mock-exports/${input.siteId}/${nowIso()}.zip`;
    store.exportBlobs.set(objectPath, { buffer: input.buffer, filename: input.filename });
    site.exportStatus = 'ready';
    site.exportUrl = objectPath;
    site.exportRequestedAt = nowIso();
    return { objectPath };
  }

  async markFailed(siteId: string): Promise<void> {
    const site = getMockStore().sites.get(siteId);
    if (site) site.exportStatus = 'failed';
  }

  async getDownloadUrl(objectPath: string): Promise<string> {
    // mock: object path 그대로 — 다운로드 라우트가 스토어 버퍼를 스트리밍한다.
    return objectPath;
  }
}
