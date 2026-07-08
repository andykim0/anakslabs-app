'use client';

/**
 * 경량 드롭다운 메뉴 (툴바 요소 추가 / 섹션 추가용).
 * 외부 클릭·Esc로 닫힘. 라이브러리 없이 구현.
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/components/dashboard/ui';

export interface DropMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

export function DropMenu({
  trigger,
  items,
  align = 'left',
  className,
  menuClassName,
}: {
  trigger: React.ReactNode;
  items: DropMenuItem[];
  align?: 'left' | 'right';
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open ? (
        <div
          className={cn(
            'absolute top-full z-[60] mt-1 max-h-72 w-44 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-2xl',
            align === 'left' ? 'left-0' : 'right-0',
            menuClassName,
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              {item.icon ? <span className="text-neutral-400">{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
