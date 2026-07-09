/**
 * mock FormSubmissionsRepo — 인메모리(globalThis 싱글턴) 테넌트 사이트 문의 폼 수신.
 * 조회 결과는 structuredClone으로 복사해 반환한다.
 */
import type { FormSubmission, FormSubmissionsRepo } from '../types';
import { getMockStore, nowIso } from './store';

export class MockFormSubmissionsRepo implements FormSubmissionsRepo {
  async create(input: {
    siteId: string;
    clientId: string;
    payload: Record<string, string>;
  }): Promise<void> {
    const store = getMockStore();
    const submission: FormSubmission = {
      id: crypto.randomUUID(),
      siteId: input.siteId,
      payload: structuredClone(input.payload),
      createdAt: nowIso(),
    };
    store.formSubmissions.set(submission.id, submission);
  }

  async listBySite(siteId: string): Promise<FormSubmission[]> {
    return [...getMockStore().formSubmissions.values()]
      .filter((s) => s.siteId === siteId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((s) => structuredClone(s));
  }
}
