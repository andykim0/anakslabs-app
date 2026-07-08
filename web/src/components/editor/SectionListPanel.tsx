'use client';

/**
 * 좌측 섹션 리스트 — 선택/순서변경/복제/숨김/삭제/추가.
 */
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react';
import type { SectionType } from '@/lib/types/site';
import { useEditorStore } from '@/stores/editor';
import { cn } from '@/components/dashboard/ui';
import { SECTION_TYPE_LABELS } from './defaults';
import { DropMenu } from './DropMenu';

const SECTION_TYPES = Object.keys(SECTION_TYPE_LABELS) as SectionType[];

export function SectionListPanel() {
  const sections = useEditorStore((s) => s.config.sections);
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId);

  const selectAndScroll = (sectionId: string) => {
    useEditorStore.getState().selectSection(sectionId);
    // 캔버스 스크롤 동기화
    requestAnimationFrame(() => {
      document.getElementById(`sec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-3">
        <Layers className="h-3.5 w-3.5 text-neutral-500" />
        <span className="text-xs font-semibold text-neutral-300">섹션</span>
        <span className="text-[11px] text-neutral-600 tabular-nums">{sections.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-5 text-neutral-600">
            섹션이 없습니다.
            <br />
            아래에서 추가해 보세요.
          </p>
        ) : null}

        {sections.map((section, idx) => {
          const active = selectedSectionId === section.id;
          return (
            <div
              key={section.id}
              className={cn(
                'group rounded-lg border px-2.5 py-2 transition-colors',
                active
                  ? 'border-[#4a3a22] bg-[#2a2117]/60'
                  : 'border-transparent hover:border-neutral-800 hover:bg-neutral-900',
              )}
            >
              <button
                type="button"
                onClick={() => selectAndScroll(section.id)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums',
                    active ? 'bg-[#c8a96a] text-neutral-950' : 'bg-neutral-800 text-neutral-400',
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-xs font-medium',
                      active ? 'text-neutral-50' : 'text-neutral-300',
                      section.hidden && 'line-through opacity-60',
                    )}
                  >
                    {section.name}
                  </span>
                  <span className="block text-[10px] text-neutral-600">
                    {SECTION_TYPE_LABELS[section.type]} · 요소 {section.elements.length}개
                  </span>
                </span>
                {section.hidden ? <EyeOff className="h-3 w-3 shrink-0 text-neutral-500" /> : null}
              </button>

              <div className="mt-1.5 hidden items-center gap-0.5 group-hover:flex">
                <PanelIconButton
                  title="위로"
                  disabled={idx === 0}
                  onClick={() => useEditorStore.getState().moveSection(section.id, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title="아래로"
                  disabled={idx === sections.length - 1}
                  onClick={() => useEditorStore.getState().moveSection(section.id, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title="복제"
                  onClick={() => useEditorStore.getState().duplicateSection(section.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title={section.hidden ? '표시' : '숨김 (발행 시 제외)'}
                  onClick={() =>
                    useEditorStore.getState().updateSection(section.id, { hidden: !section.hidden })
                  }
                >
                  {section.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </PanelIconButton>
                <PanelIconButton
                  title="삭제"
                  danger
                  onClick={() => useEditorStore.getState().deleteSection(section.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </PanelIconButton>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-800 p-2">
        <DropMenu
          className="w-full"
          menuClassName="bottom-full top-auto mb-1 w-full"
          trigger={
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-700 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900"
            >
              <Plus className="h-3.5 w-3.5" /> 섹션 추가
            </button>
          }
          items={SECTION_TYPES.map((type) => ({
            key: type,
            label: SECTION_TYPE_LABELS[type],
            onSelect: () => {
              const id = useEditorStore.getState().addSection(type);
              requestAnimationFrame(() => {
                document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              });
            },
          }))}
        />
      </div>
    </aside>
  );
}

function PanelIconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors disabled:opacity-30',
        danger ? 'hover:bg-red-950/60 hover:text-red-300' : 'hover:bg-neutral-800 hover:text-neutral-100',
      )}
    >
      {children}
    </button>
  );
}
