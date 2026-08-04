/**
 * 데이터 계층 팩토리 — 서버 전용 (클라이언트 번들 유입 시 빌드 에러).
 *
 * 계약 (lib/data/types.ts):
 *  - isMockMode() === true  → 인메모리 mock (globalThis 시드 스토어, dev HMR 유지)
 *  - isMockMode() === false → Supabase 구현 (세션 + service role)
 *
 * 사용처: 서버 컴포넌트 / route handler 전용. 클라이언트 컴포넌트는 /api fetch.
 */
import 'server-only';
import { isMockMode } from '@/lib/env';
import type { DataServices } from './types';
import { createMockServices } from './mock/services';
import { createSupabaseServices } from './supabase';

const GLOBAL_KEY = '__anaksDataServices__' as const;

type GlobalWithServices = typeof globalThis & {
  [GLOBAL_KEY]?: { mock?: DataServices; supabase?: DataServices };
};

/** Provider-signed callbacks must persist even if a development mock flag was left on. */
export function getSupabaseDataServices(): DataServices {
  const g = globalThis as GlobalWithServices;
  const cache = (g[GLOBAL_KEY] ??= {});
  cache.supabase ??= createSupabaseServices();
  return cache.supabase;
}

export function getDataServices(): DataServices {
  const g = globalThis as GlobalWithServices;
  const cache = (g[GLOBAL_KEY] ??= {});
  if (isMockMode()) {
    cache.mock ??= createMockServices();
    return cache.mock;
  }
  return getSupabaseDataServices();
}

export type { DataServices } from './types';
