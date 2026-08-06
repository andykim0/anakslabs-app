import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isEmailLoginEnabled, isMockMode } from '@/lib/env';
import { getCurrentAuthUser } from '@/lib/services/auth';
import {
  getDefaultPostLoginPath,
  getPostLoginRole,
  resolvePostLoginRedirect,
} from '@/lib/auth/post-login-redirect';
import { WelcomePasswordForm } from './WelcomePasswordForm';

export const metadata: Metadata = { title: 'Set your password — Anaks Labs' };

export default async function WelcomePage() {
  // The same kill switch the password routes obey. With it off there is nothing this screen can
  // save, so it must not offer a form that would fail at submit.
  if (!isEmailLoginEnabled()) redirect('/login');

  // Mock mode has no password store, and building a fake one would let this screen report
  // success for something no login could ever verify. The demo goes where it was headed.
  if (isMockMode()) {
    const { isAdmin } = await import('@/lib/services/auth');
    redirect(getDefaultPostLoginPath(await isAdmin() ? 'admin' : 'client'));
  }

  const user = await getCurrentAuthUser();
  if (!user) redirect('/login');

  const role = getPostLoginRole(user);
  return (
    <WelcomePasswordForm
      // Where they go once the password is saved — the same resolver every other entry uses.
      destination={resolvePostLoginRedirect(user)}
      isOperator={role === 'admin'}
      email={user.email ?? null}
    />
  );
}
