'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PASSWORD_REQUIREMENT_MESSAGE } from '@/lib/auth/password-policy';

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-[#D9DAE0] bg-white px-3 text-sm text-[#141A3A] outline-none transition-colors placeholder:text-[#98A2B3] focus:border-[#2D63F0] focus:ring-1 focus:ring-[#2D63F0]';
const LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-[#141A3A]';

export function WelcomePasswordForm({
  destination,
  isOperator,
  email,
}: {
  destination: string;
  isOperator: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data?.error?.message ?? 'That password could not be saved.');
      }
      router.replace(data.redirect ?? destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That password could not be saved.');
      setPending(false);
    }
  };

  return (
    <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-[28px] border border-[#DFE1E6] bg-white/92 p-6 shadow-[0_24px_80px_rgba(20,26,58,.11)] backdrop-blur-xl sm:p-8">
        <h1 className="text-center text-2xl font-semibold tracking-[-0.035em] text-[#141A3A]">
          Set your password
        </h1>
        <p className="mt-2 text-center text-sm text-[#6a7286]">
          {isOperator
            ? 'Choose a password for your operator account. You will use it to sign in from now on.'
            : 'Choose a password so you can sign in again whenever you need to.'}
        </p>
        {email ? (
          <p className="mt-1 text-center text-[13px] text-[#8B9AB0]">{email}</p>
        ) : null}

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="welcome-password" className={LABEL_CLASS}>New password</label>
            <input
              id="welcome-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT_CLASS}
            />
            <p className="mt-1.5 text-xs text-[#6a7286]">{PASSWORD_REQUIREMENT_MESSAGE}</p>
          </div>
          <div>
            <label htmlFor="welcome-confirm" className={LABEL_CLASS}>Confirm password</label>
            <input
              id="welcome-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-11 w-full rounded-lg bg-[#141A3A] text-sm font-semibold text-white transition-colors hover:bg-[#232C52] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save password and continue'}
          </button>
        </form>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-center text-xs text-[#B42318]"
          >
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
