/**
 * mock ScansRepo — 인메모리(globalThis 싱글턴) SEO/AEO/GEO 진단 스캔 저장.
 * 조회 결과는 structuredClone으로 복사해 반환한다.
 */
import type { ScanResult, ScansRepo } from '../types';
import { getMockStore, nowIso } from './store';

export class MockScansRepo implements ScansRepo {
  async create(input: Omit<ScanResult, 'id' | 'createdAt'>): Promise<ScanResult> {
    const store = getMockStore();
    const scan: ScanResult = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      createdAt: nowIso(),
    };
    store.scans.set(scan.id, scan);
    return structuredClone(scan);
  }

  async getById(id: string): Promise<ScanResult | null> {
    const scan = getMockStore().scans.get(id);
    return scan ? structuredClone(scan) : null;
  }

  async claim(scanId: string, clientId: string): Promise<void> {
    const scan = getMockStore().scans.get(scanId);
    if (!scan) throw new Error(`scans.claim: 스캔이 없습니다 (${scanId})`);
    scan.clientId = clientId;
  }
}
