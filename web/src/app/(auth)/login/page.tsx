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
    label: '데모: AI 영상 홈페이지',
    description: '승인한 디자인의 영상 히어로 1회 생성 · 직접 수정 무제한',
    icon: <Sparkles className="h-4 w-4 text-[#174DDA]" />,
  },
  {
    role: 'basic',
    label: '데모: 기본 홈페이지',
    description: '기본 모션 포함 · AI 영상 홈페이지 미적용',
    icon: <ShieldCheck className="h-4 w-4 text-[#087F91]" />,
  },
  {
    role: 'admin',
    label: '데모: 관리자',
    description: 'QA 큐 · 고객/인프라 현황 콘솔',
    icon: <UserCog className="h-4 w-4 text-[#087D70]" />,
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

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-[#CAD5E5] bg-white px-3 text-sm text-[#0B1736] outline-none transition-colors placeholder:text-[#98A2B3] focus:border-[#174DDA] focus:ring-1 focus:ring-[#174DDA]';
const LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-[#0B1736]';

export default function LoginPage() {
  const router = useRouter();
  const mock = isMockMode();
  const [pendingRole, setPendingRole] = useState<MockRole | null>(null);
  const [oauthPending, setOauthPending] = useState<'kakao' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 이메일 로그인 — NEXT_PUBLIC_ALLOW_EMAIL_LOGIN 게이트. 가입은 /signup 별도 화면.
  const emailLoginOn = isEmailLoginPublic();
  const [emailForm, setEmailForm] = useState({ email: '', password: '' });
  const [emailPending, setEmailPending] = useState(false);

  const requestedNext = () => new URLSearchParams(window.location.search).get('next');

  const handleMockLogin = async (role: MockRole) => {
    setError(null);
    setPendingRole(role);
    try {
      // 계약: POST /api/auth/mock-login { as } → { ok, clientId, redirect }
      const result = await mockLogin(role, requestedNext());
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
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      const next = requestedNext();
      if (next) callbackUrl.searchParams.set('next', next);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : '소셜 로그인에 실패했습니다.');
      setOauthPending(null);
    }
  };

  // 이메일 로그인(signin 전용) → 세션 쿠키 세팅 → 역할별 앱. 가입은 /signup.
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailPending(true);
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...emailForm, mode: 'signin', next: requestedNext() }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; message?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? '이메일 로그인에 실패했습니다.');
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F8FBFF] text-[#0B1736]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(23,77,218,.12),transparent_31%),radial-gradient(circle_at_88%_82%,rgba(3,191,169,.11),transparent_30%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-24 -right-24 h-72 w-72 rounded-full border border-[#BFEDE8]/70 bg-[#E8FBF7]/45 blur-2xl"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <BrandLogo />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md rounded-[28px] border border-[#DCE4F0] bg-white/92 p-6 shadow-[0_24px_80px_rgba(11,23,54,.11)] backdrop-blur-xl sm:p-8">
          <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#0B1736]">로그인</h1>

          {mock ? (
            <>
              <p className="mt-2 text-center text-sm text-[#667085]">
                데모 모드 — 계정을 골라 전체 플로우를 체험해보세요.
              </p>
              <div className="mt-8 space-y-3">
                {MOCK_BUTTONS.map((b) => (
                  <button
                    key={b.role}
                    type="button"
                    onClick={() => handleMockLogin(b.role)}
                    disabled={pendingRole !== null}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#DCE4F0] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#8FB2FF] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF5FF]">
                      {pendingRole === b.role ? <Spinner className="text-[#174DDA]" /> : b.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#0B1736]">{b.label}</span>
                      <span className="block text-xs text-[#667085]">{b.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {emailLoginOn ? (
                <form onSubmit={handleEmailLogin} className="mt-8 space-y-4">
                  <div>
                    <label htmlFor="login-email" className={LABEL_CLASS}>
                      이메일
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={emailForm.email}
                      onChange={(ev) => setEmailForm((f) => ({ ...f, email: ev.target.value }))}
                      placeholder="example@daboim.com"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="login-password" className={LABEL_CLASS}>
                      비밀번호
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      minLength={6}
                      autoComplete="current-password"
                      value={emailForm.password}
                      onChange={(ev) => setEmailForm((f) => ({ ...f, password: ev.target.value }))}
                      placeholder="••••••••"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={emailPending}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#174DDA] text-sm font-semibold text-white transition-colors hover:bg-[#123FB7] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailPending ? <Spinner className="text-white" /> : null}
                    로그인
                  </button>
                </form>
              ) : null}

              <div className={`${emailLoginOn ? 'mt-6' : 'mt-8'} flex items-center gap-3`}>
                <span className="h-px flex-1 bg-[#DCE4F0]" />
                <span className="text-[11px] text-[#98A2B3]">또는</span>
                <span className="h-px flex-1 bg-[#DCE4F0]" />
              </div>

              <div className="mt-5 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => handleOAuth('kakao')}
                  disabled={oauthPending !== null}
                  aria-label="카카오로 로그인"
                  title="카카오로 로그인"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FEE500] text-[#191919] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'kakao' ? <Spinner className="text-[#191919]" /> : <KakaoIcon />}
                </button>
                <button
                  type="button"
                  onClick={() => handleOAuth('google')}
                  disabled={oauthPending !== null}
                  aria-label="Google로 로그인"
                  title="Google로 로그인"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#DCE4F0] bg-white transition-colors hover:border-[#8FB2FF] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'google' ? <Spinner className="text-[#0B1736]" /> : <GoogleIcon />}
                </button>
              </div>
            </>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]">
              {error}
            </p>
          ) : null}

          {!mock ? (
            <p className="mt-8 text-center text-[13px] text-[#667085]">
              아직 다보임 회원이 아니신가요?{' '}
              <Link href="/signup" className="font-semibold text-[#174DDA] transition-colors hover:text-[#123FB7]">
                회원가입
              </Link>
            </p>
          ) : null}

          <p className="mt-8 text-center text-[11px] leading-5 text-[#667085]">
            로그인하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
