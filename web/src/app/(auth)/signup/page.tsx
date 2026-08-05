'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { env, isEmailLoginPublic, isMockMode } from '@/lib/env';
import { Spinner } from '@/components/dashboard/ui';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { OPERATOR_PRODUCT_LOCALE, selfSignupAllowedForLocale } from '@/lib/operator-model/policy';

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
  'h-11 w-full rounded-lg border border-[#D9DAE0] bg-white px-3 text-sm text-[#141A3A] outline-none transition-colors placeholder:text-[#98A2B3] focus:border-[#2D63F0] focus:ring-1 focus:ring-[#2D63F0]';
const LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-[#141A3A]';
// 아임웹 관행과 동일한 강도: 영문+숫자+특수문자 조합 8-20자
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^\dA-Za-z\s]).{8,20}$/;

type Agreements = { terms: boolean; privacy: boolean; marketingEmail: boolean };

export default function SignupPage() {
  const router = useRouter();
  const mock = isMockMode();
  const emailSignupOn = isEmailLoginPublic();
  const [view, setView] = useState<'choose' | 'email'>('choose');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', passwordConfirm: '' });
  const [agree, setAgree] = useState<Agreements>({ terms: false, privacy: false, marketingEmail: false });
  const [pending, setPending] = useState(false);
  const [oauthPending, setOauthPending] = useState<'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 가입 접수(이메일 확인 대기) 상태 — 에러가 아니라 성공 안내로 렌더
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const selfSignupAllowed = selfSignupAllowedForLocale(OPERATOR_PRODUCT_LOCALE);

  const requestedNext = () => new URLSearchParams(window.location.search).get('next');
  const allAgreed = agree.terms && agree.privacy && agree.marketingEmail;
  const setAll = (value: boolean) => setAgree({ terms: value, privacy: value, marketingEmail: value });

  const handleOAuth = async () => {
    setError(null);
    setOauthPending('google');
    try {
      const supabase = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
      const callbackUrl = new URL('/api/auth/callback', window.location.origin);
      const next = requestedNext();
      if (next) callbackUrl.searchParams.set('next', next);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl.toString() },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-up failed.');
      setOauthPending(null);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!PASSWORD_RULE.test(form.password)) {
      setError('Use 8–20 characters with a letter, number, and special character.');
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setError('The passwords do not match.');
      return;
    }
    if (!agree.terms || !agree.privacy) {
      setError('Please accept the Terms and Privacy Policy.');
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
          marketingEmail: agree.marketingEmail,
          next: requestedNext(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; redirect?: string; message?: string; error?: { message?: string } }
        | null;
      if (!res.ok) throw new Error(data?.error?.message ?? 'Sign-up failed.');
      if (data?.ok && data?.redirect) {
        router.push(data.redirect);
        return;
      }
      // 세션 미생성 = 이메일 확인(2차 인증) 대기
      setConfirmNotice(data?.message ?? 'We sent a verification email. Open the link to finish creating your account.');
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed.');
      setPending(false);
    }
  };

  if (!selfSignupAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F7F9] px-6 text-[#141A3A]">
        <main className="w-full max-w-md rounded-[28px] border border-[#DFE1E6] bg-white p-8 text-center shadow-[0_24px_80px_rgba(20,26,58,.11)]">
          <BrandLogo />
          <h1 className="mt-8 text-2xl font-semibold tracking-[-0.035em]">Accounts are issued by Anaks Labs</h1>
          <p className="mt-3 text-sm leading-6 text-[#6a7286]">
            Use the invitation from your account manager to access your clinic workspace.
          </p>
          <Link
            href="/login"
            className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-[#2D63F0] text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#F6F7F9] text-[#141A3A]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(45,99,240,.12),transparent_31%),radial-gradient(circle_at_88%_82%,rgba(45,99,240,.11),transparent_30%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-24 -right-24 h-72 w-72 rounded-full border border-[#CBD8FB]/70 bg-[#EAEFFE]/45 blur-2xl"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center px-6 py-5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <BrandLogo />
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-24">
        <div className="w-full max-w-md rounded-[28px] border border-[#DFE1E6] bg-white/92 p-6 shadow-[0_24px_80px_rgba(20,26,58,.11)] backdrop-blur-xl sm:p-8">
          {mock ? (
            <>
              <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">Create an account</h1>
              <p className="mt-2 text-center text-sm text-[#6a7286]">
                Mock mode does not require registration.
              </p>
              <div className="mt-8">
                <Link
                  href="/login"
                  className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2D63F0] text-sm font-semibold text-white transition-colors hover:bg-[#1E4BD1]"
                >
                  Return to sign in
                </Link>
              </div>
            </>
          ) : confirmNotice ? (
            <>
              <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">Create an account</h1>
              <div className="mt-8 space-y-4">
                <div className="rounded-xl border border-[#C4E3D2] bg-[#EEF6F1] px-4 py-4 text-center">
                  <p className="text-sm font-semibold text-[#10714F]">Verification email sent</p>
                  <p className="mt-1.5 text-xs leading-5 text-[#3D5A55]">{confirmNotice}</p>
                </div>
                <Link
                  href="/login"
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-[#DFE1E6] bg-white text-sm font-semibold text-[#141A3A] transition-colors hover:border-[#8FB2FF] hover:bg-[#F6F7F9]"
                >
                  Return to sign in
                </Link>
              </div>
            </>
          ) : view === 'choose' ? (
            <>
              <h1 className="text-center text-[22px] leading-snug font-semibold tracking-[-0.03em] text-[#141A3A]">
                Start your clinic website workspace
              </h1>

              <div className="mt-8 space-y-3">
                {emailSignupOn ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setView('email');
                    }}
                    className="flex h-12 w-full items-center justify-center rounded-xl border border-[#DFE1E6] bg-white text-sm font-semibold text-[#141A3A] transition-colors hover:border-[#8FB2FF] hover:bg-[#F6F7F9]"
                  >
                    Sign up with email
                  </button>
                ) : null}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-[#DFE1E6]" />
                <span className="text-[11px] text-[#98A2B3]">or</span>
                <span className="h-px flex-1 bg-[#DFE1E6]" />
              </div>

              <div className="mt-5 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleOAuth}
                  disabled={oauthPending !== null}
                  aria-label="Sign up with Google"
                  title="Sign up with Google"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#DFE1E6] bg-white transition-colors hover:border-[#8FB2FF] hover:bg-[#F6F7F9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'google' ? <Spinner className="text-[#141A3A]" /> : <GoogleIcon />}
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">Sign up with email</h1>

              <form onSubmit={handleEmailSignup} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="signup-email" className={LABEL_CLASS}>
                    Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                    placeholder="you@clinic.com"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="signup-name" className={LABEL_CLASS}>
                    Name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                    placeholder="Your name"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="signup-phone" className={LABEL_CLASS}>
                    Phone
                  </label>
                  <input
                    id="signup-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                    placeholder="+1 555 555 0123"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="signup-password" className={LABEL_CLASS}>
                    Password
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={20}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
                    placeholder="8–20 characters with letters, numbers, and symbols"
                    className={INPUT_CLASS}
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={20}
                    autoComplete="new-password"
                    aria-label="Confirm password"
                    value={form.passwordConfirm}
                    onChange={(ev) => setForm((f) => ({ ...f, passwordConfirm: ev.target.value }))}
                    placeholder="Enter the password again"
                    className={`${INPUT_CLASS} mt-2`}
                  />
                </div>

                <div className="rounded-xl border border-[#DFE1E6] bg-[#F6F7F9] p-4">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={allAgreed}
                      onChange={(ev) => setAll(ev.target.checked)}
                      className="h-4 w-4 accent-[#2D63F0]"
                    />
                    <span className="text-[13px] font-semibold text-[#141A3A]">Accept all</span>
                  </label>
                  <div className="mt-3 space-y-2.5 border-t border-[#DFE1E6] pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={agree.terms}
                          onChange={(ev) => setAgree((a) => ({ ...a, terms: ev.target.checked }))}
                          className="h-4 w-4 accent-[#2D63F0]"
                        />
                        <span className="text-[13px] text-[#141A3A]">Terms (required)</span>
                      </label>
                      <a
                        href="/terms"
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[12px] text-[#6a7286] underline underline-offset-2 hover:text-[#2D63F0]"
                      >
                        View
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={agree.privacy}
                          onChange={(ev) => setAgree((a) => ({ ...a, privacy: ev.target.checked }))}
                          className="h-4 w-4 accent-[#2D63F0]"
                        />
                        <span className="text-[13px] text-[#141A3A]">Privacy Policy (required)</span>
                      </label>
                      <a
                        href="/privacy"
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[12px] text-[#6a7286] underline underline-offset-2 hover:text-[#2D63F0]"
                      >
                        View
                      </a>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={agree.marketingEmail}
                        onChange={(ev) => setAgree((a) => ({ ...a, marketingEmail: ev.target.checked }))}
                        className="h-4 w-4 accent-[#2D63F0]"
                      />
                      <span className="text-[13px] text-[#141A3A]">
                        Product updates by email <span className="text-[#98A2B3]">(optional)</span>
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2D63F0] text-sm font-semibold text-white transition-colors hover:bg-[#1E4BD1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? <Spinner className="text-white" /> : null}
                  Create account
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView('choose');
                }}
                className="mt-4 w-full text-center text-[12px] text-[#6a7286] transition-colors hover:text-[#2D63F0]"
              >
                ← Choose another method
              </button>
            </>
          )}

          {error ? (
            <p className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]">
              {error}
            </p>
          ) : null}

          {!mock && !confirmNotice ? (
            <p className="mt-8 text-center text-[13px] text-[#6a7286]">
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-[#2D63F0] transition-colors hover:text-[#1E4BD1]">
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
