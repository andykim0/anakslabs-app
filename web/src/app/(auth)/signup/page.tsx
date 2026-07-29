'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { env, isEmailLoginPublic, isMockMode } from '@/lib/env';
import { Spinner } from '@/components/dashboard/ui';
import { BrandLogo } from '@/components/brand/BrandLogo';

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
  'h-10 w-full rounded-lg border border-[#CAD5E5] bg-white px-3 text-sm text-[#0B1736] outline-none transition-colors placeholder:text-[#667085] focus:border-[#174DDA] focus:ring-1 focus:ring-[#174DDA]';

export default function SignupPage() {
  const router = useRouter();
  const mock = isMockMode();
  const emailSignupOn = isEmailLoginPublic();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', passwordConfirm: '' });
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<'kakao' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 가입 접수(이메일 확인 대기) 상태 — 에러가 아니라 성공 안내로 렌더
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);

  const requestedNext = () => new URLSearchParams(window.location.search).get('next');

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
      setError(err instanceof Error ? err.message : '소셜 가입에 실패했습니다.');
      setOauthPending(null);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'signup',
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          next: requestedNext(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; message?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? '가입에 실패했습니다.');
      if (data?.ok && data?.redirect) {
        router.push(data.redirect);
        return;
      }
      // 세션 미생성 = 이메일 확인(2차 인증) 대기
      setConfirmNotice(data?.message ?? '인증 메일을 보냈습니다. 메일함에서 확인 링크를 눌러 가입을 완료해 주세요.');
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '가입에 실패했습니다.');
      setPending(false);
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
          <p className="text-center font-mono text-[10px] font-semibold tracking-[0.14em] text-[#174DDA] uppercase">
            다보임 계정
          </p>
          <h1 className="mt-3 text-center text-2xl font-semibold tracking-[-0.035em] text-[#0B1736]">회원가입</h1>
          <p className="mt-2 text-center text-sm text-[#667085]">
            {mock ? '데모 모드에서는 가입 없이 로그인으로 체험할 수 있어요.' : '소셜 계정으로 3초 만에, 또는 이메일로 가입하세요.'}
          </p>

          {mock ? (
            <div className="mt-8">
              <Link
                href="/login"
                className="flex h-12 w-full items-center justify-center rounded-xl bg-[#174DDA] text-sm font-semibold text-white transition-colors hover:bg-[#123FB7]"
              >
                로그인 화면으로
              </Link>
            </div>
          ) : confirmNotice ? (
            <div className="mt-8 space-y-4">
              <div className="rounded-xl border border-[#BFEDE8] bg-[#E8FBF7] px-4 py-4 text-center">
                <p className="text-sm font-semibold text-[#087D70]">인증 메일을 보냈습니다</p>
                <p className="mt-1.5 text-xs leading-5 text-[#3D5A55]">{confirmNotice}</p>
              </div>
              <Link
                href="/login"
                className="flex h-11 w-full items-center justify-center rounded-xl border border-[#DCE4F0] bg-white text-sm font-semibold text-[#0B1736] transition-colors hover:border-[#8FB2FF] hover:bg-[#F8FBFF]"
              >
                로그인 화면으로
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-8 space-y-3">
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
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-[#DCE4F0] bg-white text-sm font-semibold text-[#0B1736] transition-colors hover:border-[#8FB2FF] hover:bg-[#F8FBFF] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'google' ? <Spinner className="text-[#0B1736]" /> : <GoogleIcon />}
                  Google로 시작하기
                </button>
              </div>

              {emailSignupOn ? (
                <>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[#DCE4F0]" />
                    <span className="text-[11px] text-[#667085]">또는 이메일로 가입</span>
                    <span className="h-px flex-1 bg-[#DCE4F0]" />
                  </div>

                  <form onSubmit={handleEmailSignup} className="mt-4 space-y-2.5">
                    <input
                      type="text"
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                      placeholder="이름"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                      placeholder="이메일"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      value={form.phone}
                      onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                      placeholder="전화번호 (010-0000-0000)"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
                      placeholder="비밀번호 (6자 이상)"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={form.passwordConfirm}
                      onChange={(ev) => setForm((f) => ({ ...f, passwordConfirm: ev.target.value }))}
                      placeholder="비밀번호 확인"
                      className={INPUT_CLASS}
                    />
                    <button
                      type="submit"
                      disabled={pending}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#174DDA] text-sm font-semibold text-white transition-colors hover:bg-[#123FB7] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {pending ? <Spinner className="text-white" /> : null}
                      가입하기
                    </button>
                  </form>
                </>
              ) : null}
            </>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]">
              {error}
            </p>
          ) : null}

          {!mock && !confirmNotice ? (
            <p className="mt-6 text-center text-xs text-[#667085]">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="font-semibold text-[#174DDA] transition-colors hover:text-[#123FB7]">
                로그인
              </Link>
            </p>
          ) : null}

          <p className="mt-8 text-center text-[11px] leading-5 text-[#667085]">
            가입하면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
