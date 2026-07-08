/**
 * 인증 헬퍼 (서버 전용) — 계약: getCurrentClient() / requireClient() / isAdmin().
 *
 * mock 모드:
 *  - 쿠키 'anaks_mock_session'(정의: app/api/_lib/guards.ts) 값이 곧 mock client id.
 *  - 'demo-premium' | 'demo-basic' → clients 조회 / 'admin' → 관리자 (고객 아님).
 *
 * supabase 모드:
 *  - @supabase/ssr 세션에서 getUser() → clients.upsertFromAuth (row 보장).
 *  - 관리자 = auth.users.app_metadata.role === 'admin' (내부 운영진 — clients 아님).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import type { AuthProvider, Client } from '@/lib/types/domain';
import { getDataServices } from '@/lib/data';
import { env, isMockMode } from '@/lib/env';
// 쿠키 이름/값 계약의 단일 정의처 (guards ↔ auth 순환 import는 상수/함수 참조뿐이라 안전)
import { MOCK_CLIENT_IDS, MOCK_SESSION_COOKIE } from '@/app/api/_lib/guards';

// ---------- mock ----------

async function readMockSession(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(MOCK_SESSION_COOKIE)?.value ?? null;
}

// ---------- supabase ----------

async function getSupabaseUser(): Promise<User | null> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const cookieStore = await cookies();
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
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
          // 서버 컴포넌트에서는 쿠키 쓰기 불가 — 토큰 갱신은 route handler에서 처리
        }
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

function isAdminUser(user: User): boolean {
  return (user.app_metadata as Record<string, unknown> | undefined)?.role === 'admin';
}

function resolveProvider(provider: unknown): AuthProvider {
  return provider === 'kakao' || provider === 'google' ? provider : 'email';
}

// ---------- 공개 API (계약) ----------

/** 현재 로그인한 고객. 미인증/관리자 세션이면 null */
export async function getCurrentClient(): Promise<Client | null> {
  if (isMockMode()) {
    const session = await readMockSession();
    if (!session || session === MOCK_CLIENT_IDS.admin) return null;
    if (session !== MOCK_CLIENT_IDS.premium && session !== MOCK_CLIENT_IDS.basic) return null;
    return getDataServices().clients.getById(session);
  }

  const user = await getSupabaseUser();
  if (!user) return null;
  if (isAdminUser(user)) return null; // 내부 운영진은 고객이 아님

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    user.email?.split('@')[0] ||
    '고객';

  return getDataServices().clients.upsertFromAuth({
    id: user.id,
    name,
    email: user.email ?? '',
    authProvider: resolveProvider(user.app_metadata?.provider),
  });
}

/** 인증된 고객을 보장. 미인증이면 throw — API 가드(guards.ts)가 잡아 401로 변환 */
export async function requireClient(): Promise<Client> {
  const client = await getCurrentClient();
  if (!client) {
    throw new Error('UNAUTHORIZED: 로그인된 고객 세션이 없습니다.');
  }
  return client;
}

/** 관리자 여부 — mock: 세션 쿠키 'admin' / supabase: app_metadata.role === 'admin' */
export async function isAdmin(): Promise<boolean> {
  if (isMockMode()) {
    const session = await readMockSession();
    return session === MOCK_CLIENT_IDS.admin;
  }
  const user = await getSupabaseUser();
  return user !== null && isAdminUser(user);
}
