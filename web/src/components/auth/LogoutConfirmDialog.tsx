'use client';

import { useEffect, useRef } from 'react';
import { LoaderCircle, LogOut } from 'lucide-react';

export function LogoutConfirmDialog({
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pending) return;
      onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel, open, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#141A3A]/35 px-5 backdrop-blur-[2px]"
      data-logout-confirm-overlay
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-description"
        className="w-full max-w-sm rounded-xl border border-[#DFE1E6] bg-white p-5 text-[#141A3A] shadow-[0_24px_72px_rgba(20,26,58,.22)]"
        data-logout-confirm-dialog
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1F0] text-[#D92D20]">
          <LogOut className="h-5 w-5" aria-hidden />
        </span>
        <h2 id="logout-confirm-title" className="mt-4 text-lg font-semibold tracking-[-0.02em]">
          Log out?
        </h2>
        <p id="logout-confirm-description" className="mt-2 text-sm leading-6 text-[#6a7286]">
          This ends your current session and returns you to the sign-in page.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-10 rounded-lg border border-[#DFE1E6] px-4 text-sm font-medium text-[#475467] transition-colors hover:bg-[#F6F7F9] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#D92D20] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B42318] disabled:cursor-wait disabled:opacity-60"
          >
            {pending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden />
            )}
            {pending ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </section>
    </div>
  );
}
