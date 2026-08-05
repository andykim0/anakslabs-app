'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from './ui';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[#141A3A]/45 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            className={cn(
              'relative w-full max-w-md rounded-2xl border border-[#DFE1E6] bg-white p-6 text-[#232C52] shadow-[0_24px_80px_rgba(20,26,58,0.2)]',
              className,
            )}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 className="text-base font-semibold text-[#141A3A]">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-[#6a7286] transition-colors hover:bg-[#EAEFFE] hover:text-[#2D63F0]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm leading-6 text-[#475467]">{children}</div>
            {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
