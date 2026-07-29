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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B1736]/35 px-5 backdrop-blur-[2px]"
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
        className="w-full max-w-sm rounded-xl border border-[#DCE4F0] bg-white p-5 text-[#0B1736] shadow-[0_24px_72px_rgba(11,23,54,.22)]"
        data-logout-confirm-dialog
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1F0] text-[#D92D20]">
          <LogOut className="h-5 w-5" aria-hidden />
        </span>
        <h2 id="logout-confirm-title" className="mt-4 text-lg font-semibold tracking-[-0.02em]">
          로그아웃할까요?
        </h2>
        <p id="logout-confirm-description" className="mt-2 text-sm leading-6 text-[#667085]">
          현재 세션을 종료하고 로그인 화면으로 이동합니다.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-10 rounded-lg border border-[#DCE4F0] px-4 text-sm font-medium text-[#475467] transition-colors hover:bg-[#F8FBFF] disabled:opacity-60"
          >
            취소
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
            {pending ? '로그아웃 중…' : '로그아웃'}
          </button>
        </div>
      </section>
    </div>
  );
}
