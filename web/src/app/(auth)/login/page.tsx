'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ShieldCheck, Sparkles, UserCog } from 'lucide-react';
import { env, isEmailLoginPublic, isMockMode } from '@/lib/env';
import { mockLogin, type MockRole } from '@/components/dashboard/api';
import { Spinner } from '@/components/dashboard/ui';
import { BrandLogo } from '@/components/brand/BrandLogo';

const MOCK_BUTTONS: { role: MockRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    role: 'premium',
    label: '데모: Premium 고객',
    description: '영상 편집 가능 · 크레딧 3개 지급',
    icon: <Sparkles className="h-4 w-4 text-[#c8a96a]" />,
  },
  {
    role: 'basic',
    label: '데모: Basic 고객',
    description: '이미지 사이트 · 영상 요청 시 업셀',
    icon: <ShieldCheck className="h-4 w-4 text-neutral-400" />,
  },
  {
    role: 'admin',
    label: '데모: 관리자',
    description: 'QA 큐 · 고객/인프라 현황 콘솔',
    icon: <UserCog className="h-4 w-4 text-sky-400" />,
  },
];

function KakaoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.65-.2.76-.75 2.78-.86 3.21-.13.53.2.52.41.38.17-.11 2.65-1.8 3.72-2.54.66.1 1.35.15 2.07.15 5.52 0 10-3.54 10-7.85C22 6.54 17.52 3 12 3z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.26-2.09 3.55-5.17 3.55-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.63l3.98 3.09C6.22 6.87 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const mock = isMockMode();
  const [pendingRole, setPendingRole] = useState<MockRole | null>(null);
  const [oauthPending, setOauthPending] = useState<'kakao' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // [임시·삭제가능] 이메일 로그인(OAuth 우회 테스트 경로) — NEXT_PUBLIC_ALLOW_EMAIL_LOGIN 게이트
  const emailLoginOn = isEmailLoginPublic();
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [emailPending, setEmailPending] = useState(false);

  const handleMockLogin = async (role: MockRole) => {
    setError(null);
    setPendingRole(role);
    try {
      // 계약: POST /api/auth/mock-login { as } → { ok, clientId, redirect }
      const result = await mockLogin(role);
      router.push(result.redirect || '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
      setPendingRole(null);
    }
  };

  const handleOAuth = async (provider: 'kakao' | 'google') => {
    setError(null);
    setOauthPending(provider);
    try {
      const supabase = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/api/auth/callback` },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : '소셜 로그인에 실패했습니다.');
      setOauthPending(null);
    }
  };

  // [임시·삭제가능] 이메일 signup/signin → 세션 쿠키 세팅 → /dashboard
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailPending(true);
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...emailForm, mode: emailMode }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; message?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? '이메일 로그인에 실패했습니다.');
      // 세션 미생성(이메일 확인 필요 등)이면 리다이렉트 대신 안내만
      if (data?.ok && data?.redirect) {
        router.push(data.redirect);
      } else {
        setError(data?.message ?? '가입 확인이 필요합니다. 이메일을 확인해 주세요.');
        setEmailPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '이메일 로그인에 실패했습니다.');
      setEmailPending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0b] text-neutral-100">
      <header className="mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <BrandLogo inverse />
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-sm">
          <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-50">로그인</h1>
          <p className="mt-2 text-center text-sm text-neutral-500">
            {mock ? '데모 모드 — 계정을 골라 전체 플로우를 체험해보세요.' : '소셜 계정으로 3초 만에 시작하세요.'}
          </p>

          <div className="mt-8 space-y-3">
            {mock ? (
              MOCK_BUTTONS.map((b) => (
                <button
                  key={b.role}
                  type="button"
                  onClick={() => handleMockLogin(b.role)}
                  disabled={pendingRole !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3.5 text-left transition-colors hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800">
                    {pendingRole === b.role ? <Spinner /> : b.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-100">{b.label}</span>
                    <span className="block text-xs text-neutral-500">{b.description}</span>
                  </span>
                </button>
              ))
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleOAuth('kakao')}
                  disabled={oauthPending !== null}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#FEE500] text-sm font-semibold text-[#191919] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'kakao' ? <Spinner className="text-[#191919]" /> : <KakaoIcon />}
                  카카오로 시작하기
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={oauthPending !== null}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-neutral-300 bg-white text-sm font-semibold text-neutral-800 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'google' ? <Spinner className="text-neutral-800" /> : <GoogleIcon />}
                  Google로 시작하기
                </button>
              </>
            )}
          </div>

          {/* [임시·삭제가능] 이메일 로그인 폼 — 실모드 + NEXT_PUBLIC_ALLOW_EMAIL_LOGIN 일 때만 */}
          {!mock && emailLoginOn ? (
            <form onSubmit={handleEmailLogin} className="mt-4 space-y-2.5 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <p className="text-[11px] text-neutral-500">
                이메일 로그인 <span className="text-neutral-600">(임시 테스트 경로)</span>
              </p>
              <input
                type="email"
                required
                autoComplete="email"
                value={emailForm.email}
                onChange={(ev) => setEmailForm((f) => ({ ...f, email: ev.target.value }))}
                placeholder="이메일"
                className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
              />
              <input
                type="password"
                required
                minLength={6}
                autoComplete={emailMode === 'signup' ? 'new-password' : 'current-password'}
                value={emailForm.password}
                onChange={(ev) => setEmailForm((f) => ({ ...f, password: ev.target.value }))}
                placeholder="비밀번호 (6자 이상)"
                className="h-10 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600 focus:border-[#c8a96a]"
              />
              <button
                type="submit"
                disabled={emailPending}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#c8a96a] text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emailPending ? <Spinner className="text-neutral-950" /> : null}
                {emailMode === 'signup' ? '가입하고 시작' : '이메일로 로그인'}
              </button>
              <button
                type="button"
                onClick={() => setEmailMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                className="w-full text-center text-[11px] text-neutral-500 transition-colors hover:text-[#c8a96a]"
              >
                {emailMode === 'signin' ? '계정이 없나요? 가입하기' : '이미 계정이 있나요? 로그인'}
              </button>
            </form>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-center text-xs text-red-300">
              {error}
            </p>
          ) : null}

          <p className="mt-8 text-center text-[11px] leading-5 text-neutral-600">
            로그인하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
