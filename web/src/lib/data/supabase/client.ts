/**
 * Supabase 클라이언트 팩토리 (서버 전용).
 *
 *  - service role 클라이언트: rpc(금전 함수)·관리자·렌더러(anon 조회 불가 영역) 담당.
 *    프로세스 단위 싱글턴 (dev HMR에도 유지).
 *  - 세션 클라이언트(@supabase/ssr): 로그인 고객 권한(RLS)으로 수행해야 하는 쓰기
 *    (예: sites.saveDraft — 트리거가 보호 컬럼을 가드) 담당. 요청마다 생성.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

const GLOBAL_KEY = '__anaksSupabaseServiceRole__' as const;
type GlobalWithClient = typeof globalThis & { [GLOBAL_KEY]?: SupabaseClient };

/** service role 클라이언트 — 반드시 서버에서만. 세션/쿠키와 무관 */
export function getServiceRoleClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      'SUPABASE_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다. ' +
        '키 없이 데모하려면 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
    );
  }
  const g = globalThis as GlobalWithClient;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g[GLOBAL_KEY];
}

/** 현재 요청의 세션(쿠키) 기반 클라이언트 — authenticated 권한으로 동작 */
export async function createSessionClient(): Promise<SupabaseClient> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      'SUPABASE_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY가 필요합니다.',
    );
  }
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키 쓰기 불가 — 세션 갱신은 route handler/proxy에서 처리
        }
      },
    },
  });
}
