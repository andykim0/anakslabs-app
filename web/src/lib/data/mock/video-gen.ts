/**
 * [motion 4단계] Mock VideoGenRepo — 인메모리 로그(globalThis 스토어). 비용 가드 카운트 소스.
 * mock 모드는 실호출이 없지만 가드 로직(사이트당·일일 상한)은 실제로 동작한다(테스트 검증).
 */
import type { VideoGenLogInput, VideoGenRepo } from '../types';
import { getMockStore } from './store';

const startOfTodayUtcMs = (): number => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export class MockVideoGenRepo implements VideoGenRepo {
  private log() {
    const store = getMockStore();
    return (store.videoGenLog ??= []);
  }

  async record(input: VideoGenLogInput): Promise<void> {
    this.log().push({ ...input, at: Date.now() });
  }

  async countBySite(siteId: string): Promise<number> {
    return this.log().filter((e) => e.siteId === siteId && e.stage !== 'select').length;
  }

  async countToday(): Promise<number> {
    const since = startOfTodayUtcMs();
    return this.log().filter((e) => e.stage !== 'select' && e.at >= since).length;
  }

  async countAll(): Promise<number> {
    return this.log().filter((e) => e.stage !== 'select').length;
  }
}
