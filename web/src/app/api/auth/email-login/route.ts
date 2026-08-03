/**
 * [임시·테스트 전용] POST /api/auth/email-login — OAuth 우회 이메일 로그인.
 * body: { email, password, mode: 'signin'|'signup' } → 세션 쿠키 세팅 → { ok, redirect }.
 *
 * ⚠️ 게이팅: 서버 ALLOW_EMAIL_LOGIN=1 일 때만 활성(아니면 404). 프로덕션 auth 모델
 *    (OAuth=가입)을 침범하지 않기 위한 임시 경로 — 카카오/구글 심사 대기 중 테스트용.
 * 세션 성립 후 completePostLogin(clients 보장 + 스캔 귀속)을 OAuth 콜백과 공유한다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isEmailLoginEnabled, isMockMode } from '@/lib/env';
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect';
import { apiError, parseBody, withApiHandler } from '../../_lib/http';
import { createSupabaseRouteClient } from '../../_lib/supabase';
import { completePostLogin } from '../../_lib/post-login';

// 남용 방어: IP 분당 10회 (임시 경로지만 brute-force 완화 — /api/scan·/api/forms 와 동일 패턴)
const RL_LIMIT = 10;
const RL_WINDOW_MS = 60_000;
const RL_KEY = '__anaksEmailLoginRateLimit__' as const;
type GlobalWithRl = typeof globalThis & { [RL_KEY]?: Map<string, number[]> };
function rateLimited(ip: string): boolean {
  const g = globalThis as GlobalWithRl;
  const buckets = (g[RL_KEY] ??= new Map<string, number[]>());
  const now = Date.now();
  const hits = (buckets.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_LIMIT) {
    buckets.set(ip, hits);
    return true;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return false;
}

const bodySchema = z
  .object({
    email: z.string().email('Enter a valid email address.').max(200),
    password: z.string().min(6, 'Password must be at least 6 characters.').max(200),
    mode: z.enum(['signin', 'signup']),
    next: z.string().max(2_048).nullish(),
    // 가입 전용 필드 — signin 에는 받지 않는다.
    name: z.string().trim().min(1, 'Enter your name.').max(60).optional(),
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s().-]/gu, ''))
      .refine((value) => /^\+?[1-9]\d{7,14}$/u.test(value), 'Enter a valid phone number with country code.')
      .optional(),
    marketingEmail: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== 'signup') return;
    if (!value.name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Enter your name.' });
    if (!value.phone) ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter your phone number.' });
    // 가입 비밀번호는 영문+숫자+특수문자 8-20자(로그인은 기존 계정 호환 위해 min 6 유지)
    if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^\dA-Za-z\s]).{8,20}$/u.test(value.password)) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'Use 8–20 characters with a letter, number, and special character.',
      });
    }
  });

export const POST = withApiHandler(async (request: NextRequest) => {
  // 게이트: 비활성 시 존재 자체를 숨긴다(404)
  if (!isEmailLoginEnabled()) {
    return apiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  // 이메일 로그인은 실제 Supabase Auth가 필요 — mock 모드에선 불가
  if (isMockMode()) {
    return apiError(400, 'REAL_MODE_ONLY', 'Email sign-in is available only with a configured database.');
  }
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim() || 'local';
  if (rateLimited(ip)) {
    return apiError(429, 'RATE_LIMITED', 'Too many requests. Try again shortly.');
  }

  const body = await parseBody(request, bodySchema);
  if (!body.ok) return body.res;
  const { email, password, mode, next, name, phone, marketingEmail } = body.data;

  const supabase = await createSupabaseRouteClient();
  // 가입: 이름·전화는 auth user_metadata 로 보관, 이메일 확인 링크는 기존 OAuth 콜백으로 착지시켜
  // 세션 성립 → clients 보장(completePostLogin)까지 같은 경로를 태운다(2차 인증 = 이메일 확인).
  const confirmRedirect = new URL('/api/auth/callback', request.nextUrl.origin);
  if (next) confirmRedirect.searchParams.set('next', next);
  const result =
    mode === 'signup'
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            // 마케팅 수신 동의(선택)는 동의 시각과 함께 기록 — 개인정보처리방침 제11조 별도 동의 근거.
            data: {
              full_name: name,
              phone,
              marketing_email_opt_in: marketingEmail === true,
              ...(marketingEmail === true ? { marketing_email_opt_in_at: new Date().toISOString() } : {}),
            },
            emailRedirectTo: confirmRedirect.toString(),
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

  // 실패: 원시 Supabase 메시지는 클라이언트에 노출하지 않는다(이메일 열거 방지) — 서버 로그로만.
  if (result.error || !result.data.user) {
    if (result.error) console.warn(`[email-login] ${mode} 실패:`, result.error.message);
    const msg =
      mode === 'signup'
        ? 'Sign-up failed. Check the information and try again.'
        : 'Sign-in failed. Check your email and password.';
    return apiError(401, 'AUTH_FAILED', msg);
  }

  // signUp 은 user 생성과 session 생성이 분리될 수 있다(이메일 확인 필요 설정 / 중복 이메일 난독화).
  // session 이 없으면 로그인 미완료 — clients row/스캔 귀속을 만들지 말고 안내만 반환(고아 row·오귀속 방지).
  if (!result.data.session) {
    return NextResponse.json({
      ok: false,
      message: 'Open the verification link sent to your email to finish creating your account.',
    });
  }

  const redirect = resolvePostLoginRedirect(result.data.user, next);
  const res = NextResponse.json({ ok: true, redirect });
  // 세션 성립 후에만: clients row 보장 + 로그인 전 익명 스캔 귀속 (OAuth 콜백과 동일 공용 헬퍼)
  await completePostLogin(request, res, result.data.user);
  return res;
});
