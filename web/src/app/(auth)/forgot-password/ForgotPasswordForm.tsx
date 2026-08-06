'use client';

import { useState } from 'react';
import Link from 'next/link';

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-[#D9DAE0] bg-white px-3 text-sm text-[#141A3A] outline-none transition-colors placeholder:text-[#98A2B3] focus:border-[#2D63F0] focus:ring-1 focus:ring-[#2D63F0]';
const LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-[#141A3A]';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { message?: string; error?: { message?: string } };
      if (!res.ok) throw new Error(data?.error?.message ?? 'Could not send a reset link.');
      // Shown verbatim: the endpoint answers the same way whether or not the address has an
      // account, and interpreting it here would give that away.
      setNotice(data.message ?? 'If that email has an account, a reset link is on its way.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send a reset link.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-[28px] border border-[#DFE1E6] bg-white/92 p-6 shadow-[0_24px_80px_rgba(20,26,58,.11)] backdrop-blur-xl sm:p-8">
        <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">
          Reset your password
        </h1>
        <p className="mt-2 text-center text-sm leading-6 text-[#6a7286]">
          Enter the email address for your account and we will send you a link to choose a new
          password.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="forgot-email" className={LABEL_CLASS}>Email</label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@clinic.com"
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-[#2D63F0] text-sm font-semibold text-white transition-colors hover:bg-[#1E4BD1] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        {notice ? (
          <p
            role="status"
            className="mt-4 rounded-lg border border-[#BBD0FA] bg-[#EAEFFE] px-3 py-2 text-center text-xs leading-5 text-[#2D63F0]"
          >
            {notice}
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-8 text-center text-[13px] text-[#6a7286]">
          <Link
            href="/login"
            className="font-semibold text-[#2D63F0] transition-colors hover:text-[#1E4BD1]"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
