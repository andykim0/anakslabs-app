'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ShieldCheck, Sparkles, UserCog } from 'lucide-react';
import { env, isEmailLoginPublic, isMockMode } from '@/lib/env';
import { mockLogin, type MockRole } from '@/components/dashboard/api';
import { Spinner } from '@/components/dashboard/ui';
import { BrandLogo } from '@/components/brand/BrandLogo';

const MOCK_BUTTONS: { role: MockRole; label: string; description: string; icon: React.ReactNode }[] = [
  {
    role: 'premium',
    label: 'Demo: clinic owner',
    description: 'Review, edit, approve, and publish a clinic website',
    icon: <Sparkles className="h-4 w-4 text-[#2D63F0]" />,
  },
  {
    role: 'basic',
    label: 'Demo: draft workspace',
    description: 'Continue an in-progress clinic website',
    icon: <ShieldCheck className="h-4 w-4 text-[#4D7CFF]" />,
  },
  {
    role: 'admin',
    label: 'Demo: administrator',
    description: 'Quality review and operations console',
    icon: <UserCog className="h-4 w-4 text-[#232C52]" />,
  },
];

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

/**
 * A one-time link that has expired or already been used lands back here. Saying so — and naming
 * the way to get another one — is the difference between a dead end and a next step.
 */
const LINK_ERROR_COPY: Record<string, string> = {
  invalid_invite:
    'That invitation link has expired or was already used. Ask your Anaks Labs contact to send a new one.',
  invalid_recovery:
    'That reset link has expired or was already used. Request a new one with Forgot password below.',
  invite_required:
    'This account is not set up yet. Ask your Anaks Labs contact to send an invitation.',
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkError = LINK_ERROR_COPY[searchParams.get('error') ?? ''] ?? null;
  const mock = isMockMode();
  const [pendingRole, setPendingRole] = useState<MockRole | null>(null);
  const [oauthPending, setOauthPending] = useState<'google' | null>(null);
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
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setPendingRole(null);
    }
  };

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
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
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
      if (!res.ok) throw new Error(data?.error?.message ?? 'Email sign-in failed.');
      if (data?.ok && data?.redirect) {
        router.push(data.redirect);
      } else {
        setError(data?.message ?? 'Please verify your account from your email.');
        setEmailPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email sign-in failed.');
      setEmailPending(false);
    }
  };

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
          <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">Sign in</h1>

          {mock ? (
            <>
              <p className="mt-2 text-center text-sm text-[#6a7286]">
                Mock mode — choose a role to exercise the complete workflow.
              </p>
              <div className="mt-8 space-y-3">
                {MOCK_BUTTONS.map((b) => (
                  <button
                    key={b.role}
                    type="button"
                    onClick={() => handleMockLogin(b.role)}
                    disabled={pendingRole !== null}
                    className="flex w-full items-center gap-3 rounded-xl border border-[#DFE1E6] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#8FB2FF] hover:bg-[#F6F7F9] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EAEFFE]">
                      {pendingRole === b.role ? <Spinner className="text-[#2D63F0]" /> : b.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[#141A3A]">{b.label}</span>
                      <span className="block text-xs text-[#6a7286]">{b.description}</span>
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
                      Email
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={emailForm.email}
                      onChange={(ev) => setEmailForm((f) => ({ ...f, email: ev.target.value }))}
                      placeholder="you@clinic.com"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="login-password" className={LABEL_CLASS}>
                      Password
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
                    <div className="mt-1.5 text-right">
                      <Link
                        href="/forgot-password"
                        className="text-xs font-medium text-[#2D63F0] transition-colors hover:text-[#1E4BD1]"
                      >
                        Forgot password?
                      </Link>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={emailPending}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2D63F0] text-sm font-semibold text-white transition-colors hover:bg-[#1E4BD1] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailPending ? <Spinner className="text-white" /> : null}
                    Sign in
                  </button>
                </form>
              ) : null}

              <div className={`${emailLoginOn ? 'mt-6' : 'mt-8'} flex items-center gap-3`}>
                <span className="h-px flex-1 bg-[#DFE1E6]" />
                <span className="text-[11px] text-[#98A2B3]">or</span>
                <span className="h-px flex-1 bg-[#DFE1E6]" />
              </div>

              <div className="mt-5 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleOAuth}
                  disabled={oauthPending !== null}
                  aria-label="Sign in with Google"
                  title="Sign in with Google"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-[#DFE1E6] bg-white transition-colors hover:border-[#8FB2FF] hover:bg-[#F6F7F9] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {oauthPending === 'google' ? <Spinner className="text-[#141A3A]" /> : <GoogleIcon />}
                </button>
              </div>
            </>
          )}


          {linkError && !error ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-[#F2D59B] bg-[#FFF8E8] px-3 py-2 text-center text-xs leading-5 text-[#855700]"
            >
              {linkError}
            </p>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]">
              {error}
            </p>
          ) : null}

          {!mock ? (
            <p className="mt-8 text-center text-[13px] text-[#6a7286]">
              New to Anaks Labs?{' '}
              <Link href="/signup" className="font-semibold text-[#2D63F0] transition-colors hover:text-[#1E4BD1]">
                Create an account
              </Link>
            </p>
          ) : null}

          <p className="mt-8 text-center text-[11px] leading-5 text-[#6a7286]">
            By signing in, you agree to the Terms and acknowledge the Privacy Policy.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * useSearchParams opts the subtree out of prerendering, so the boundary is required for this
 * page to keep being built ahead of time.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
