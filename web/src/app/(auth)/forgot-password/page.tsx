import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isEmailLoginEnabled } from '@/lib/env';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = { title: 'Reset your password — Anaks Labs' };

export default function ForgotPasswordPage() {
  // Same kill switch as the endpoint it posts to; with it off there is nothing to ask for.
  if (!isEmailLoginEnabled()) redirect('/login');
  return <ForgotPasswordForm />;
}
