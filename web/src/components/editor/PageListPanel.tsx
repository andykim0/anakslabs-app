'use client';

/**
 * [v4 Phase 2] 좌측 상단 페이지 목록 패널 — 선택/추가/이름변경/주소(slug)/순서/내비 토글/삭제/복제.
 * 편집 스코프(요소·섹션 액션)는 선택 페이지에만 적용된다(stores/editor activePageIndex).
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, FileText, Plus, Trash2 } from 'lucide-react';
import { useEditorStore } from '@/stores/editor';
import { isValidPageSlug } from '@/lib/types/site';
import { cn } from '@/components/dashboard/ui';

function IconBtn({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors disabled:opacity-30',
        danger ? 'hover:bg-red-950/60 hover:text-red-300' : 'hover:bg-neutral-800 hover:text-neutral-200',
      )}
    >
      {children}
    </button>
  );
}

export function PageListPanel() {
  const pages = useEditorStore((s) => s.config.pages);
  const selectedPageId = useEditorStore((s) => s.selectedPageId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [slugEdit, setSlugEdit] = useState<string | null>(null);

  const store = useEditorStore.getState;
  const selected = pages.find((p) => p.id === selectedPageId);
  const navCount = pages.filter((p) => p.showInNav !== false).length;

  return (
    <div className="border-b border-neutral-800">
      <div className="flex items-center gap-2 px-4 py-3">
        <FileText className="h-3.5 w-3.5 text-neutral-500" />
        <span className="text-xs font-semibold text-neutral-300">페이지</span>
        <span className="text-[11px] text-neutral-600 tabular-nums">{pages.length}</span>
        <button
          type="button"
          title="페이지 추가"
          onClick={() => {
            const id = store().addPage('새 페이지');
            setRenaming(id);
          }}
          className="ml-auto flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-52 space-y-0.5 overflow-y-auto px-2 pb-2">
        {pages.map((page, idx) => {
          const active = page.id === selectedPageId;
          const isHome = page.slug === '';
          return (
            <div key={page.id}>
              <div
                onClick={() => store().selectPage(page.id)}
                className={cn(
                  'group flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors',
                  active ? 'border-[#4a3a22] bg-[#2a2117]/60' : 'border-transparent hover:border-neutral-800 hover:bg-neutral-900',
                )}
              >
                <div className="min-w-0 flex-1">
                  {renaming === page.id ? (
                    <input
                      autoFocus
                      defaultValue={page.title}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        store().renamePage(page.id, e.target.value);
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-100 outline-none focus:border-[#c8a96a]"
                    />
                  ) : (
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setRenaming(page.id);
                      }}
                      className="truncate text-xs text-neutral-200"
                    >
                      {page.title}
                    </div>
                  )}
                  <div className="truncate text-[10px] text-neutral-500">{isHome ? '홈 · /' : `/${page.slug}`}</div>
                </div>
                <div className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                  <IconBtn
                    title={page.showInNav === false ? '내비에 표시' : '내비에서 숨김'}
                    onClick={() => store().setPageNav(page.id, { showInNav: page.showInNav === false })}
                  >
                    {page.showInNav === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </IconBtn>
                  <IconBtn title="위로" disabled={idx === 0} onClick={() => store().reorderPage(page.id, -1)}>
                    <ChevronUp className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="아래로" disabled={idx === pages.length - 1} onClick={() => store().reorderPage(page.id, 1)}>
                    <ChevronDown className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn title="복제" onClick={() => store().duplicatePage(page.id)}>
                    <Copy className="h-3 w-3" />
                  </IconBtn>
                  {!isHome ? (
                    <IconBtn title="삭제" danger onClick={() => store().deletePage(page.id)}>
                      <Trash2 className="h-3 w-3" />
                    </IconBtn>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 선택 페이지 주소(slug) 편집 — 홈은 '/' 고정 */}
      {selected && selected.slug !== '' ? (
        <div className="px-3 pb-3">
          <label className="mb-1 block text-[10px] text-neutral-500">주소 (영소문자·숫자·하이픈)</label>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-neutral-600">/</span>
            <input
              key={`${selected.id}-${selected.slug}`}
              defaultValue={slugEdit ?? selected.slug}
              onChange={(e) => setSlugEdit(e.target.value)}
              onBlur={(e) => {
                store().setPageSlug(selected.id, e.target.value);
                setSlugEdit(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className={cn(
                'h-7 flex-1 rounded border bg-neutral-900 px-2 text-xs text-neutral-100 outline-none focus:border-[#c8a96a]',
                slugEdit != null && slugEdit !== selected.slug && (!isValidPageSlug(slugEdit.trim().toLowerCase()) || slugEdit.trim() === '')
                  ? 'border-red-800'
                  : 'border-neutral-700',
              )}
            />
          </div>
          {navCount >= 2 ? null : (
            <p className="mt-1 text-[10px] text-neutral-600">내비는 표시 페이지가 2개 이상일 때 자동 노출됩니다.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
