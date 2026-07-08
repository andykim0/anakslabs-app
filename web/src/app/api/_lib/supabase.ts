/**
 * Route Handler 전용 Supabase 서버 클라이언트 (@supabase/ssr).
 * 실모드(OAuth 콜백/로그아웃)에서만 사용 — mock 모드에선 호출하지 말 것.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

export async function createSupabaseRouteClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
