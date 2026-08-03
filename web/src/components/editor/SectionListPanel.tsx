'use client';

/**
 * 좌측 섹션 리스트 — 선택/순서변경/복제/숨김/삭제/추가.
 * [v3 Phase 4] 하단에 "사업자 정보" 진입 — 모달 폼으로 draftConfig.businessInfo 편집.
 */
import { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react';
import type { SectionType } from '@/lib/types/site';
import { useEditorStore, activeSections} from '@/stores/editor';
import { Modal } from '@/components/dashboard/modal';
import { useToast } from '@/components/dashboard/toast';
import { cn } from '@/components/dashboard/ui';
import { BusinessInfoForm } from './BusinessInfoForm';
import { PageListPanel } from './PageListPanel';
import { SECTION_TYPE_LABELS } from './defaults';
import { DropMenu } from './DropMenu';
import { businessInfoRequiredForPublish } from '@/lib/legal/templates';

const SECTION_TYPES = Object.keys(SECTION_TYPE_LABELS) as SectionType[];

export function SectionListPanel() {
  const sections = useEditorStore((s) => activeSections(s.config));
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId);
  const businessInfo = useEditorStore((s) => s.businessInfo);
  const businessInfoRequired = useEditorStore((s) => businessInfoRequiredForPublish(s.config));
  const [bizModalOpen, setBizModalOpen] = useState(false);
  const { toast } = useToast();

  const selectAndScroll = (sectionId: string) => {
    useEditorStore.getState().selectSection(sectionId);
    // 캔버스 스크롤 동기화
    requestAnimationFrame(() => {
      document.getElementById(`sec-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[#DCE4F0] bg-[#F8FBFF]">
      {/* [v4 Phase 2] 페이지 목록 (선택 페이지 = 편집 스코프) */}
      <PageListPanel />
      <div className="flex items-center gap-2 border-b border-[#DCE4F0] px-4 py-3">
        <Layers className="h-3.5 w-3.5 text-[#667085]" />
        <span className="text-xs font-semibold text-[#344054]">section</span>
        <span className="text-[11px] text-[#667085] tabular-nums">{sections.length}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11px] leading-5 text-[#667085]">
            There are no sections.
            <br />
            Add yours below.
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
                  ? 'border-[#9DB7EB] bg-[#EDF4FF]/60'
                  : 'border-transparent hover:border-[#DCE4F0] hover:bg-white',
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
                    active ? 'bg-[#174DDA] text-white' : 'bg-[#E8EDF5] text-[#5F6B7C]',
                  )}
                >
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-xs font-medium',
                      active ? 'text-[#0B1736]' : 'text-[#344054]',
                      section.hidden && 'line-through opacity-60',
                    )}
                  >
                    {section.name}
                  </span>
                  <span className="block text-[10px] text-[#667085]">
                    {SECTION_TYPE_LABELS[section.type]} · Element {section.elements.length} items
                  </span>
                </span>
                {section.hidden ? <EyeOff className="h-3 w-3 shrink-0 text-[#667085]" /> : null}
              </button>

              <div className="mt-1.5 hidden items-center gap-0.5 group-hover:flex">
                <PanelIconButton
                  title="consolation"
                  disabled={idx === 0}
                  onClick={() => useEditorStore.getState().moveSection(section.id, -1)}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title="down"
                  disabled={idx === sections.length - 1}
                  onClick={() => useEditorStore.getState().moveSection(section.id, 1)}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title="replication"
                  onClick={() => useEditorStore.getState().duplicateSection(section.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </PanelIconButton>
                <PanelIconButton
                  title={section.hidden ? "mark" : "Hidden (except when published)"}
                  onClick={() =>
                    useEditorStore.getState().updateSection(section.id, { hidden: !section.hidden })
                  }
                >
                  {section.hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </PanelIconButton>
                <PanelIconButton
                  title="Delete"
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

      <div className="space-y-2 border-t border-[#DCE4F0] p-2">
        <DropMenu
          className="w-full"
          menuClassName="bottom-full top-auto mb-1 w-full"
          trigger={
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#CAD5E5] text-xs font-medium text-[#26354D] transition-colors hover:border-[#AEBACC] hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" /> Add section
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

        {/* [v3 Phase 4] 사업자 정보 — 발행 시 법적 푸터로 자동 표기 */}
        <button
          type="button"
          onClick={() => setBizModalOpen(true)}
          className={cn(
            'flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-colors',
            businessInfo
              ? 'border-[#CAD5E5] text-[#26354D] hover:border-[#AEBACC] hover:bg-white'
              : 'border-[#9DB7EB] bg-[#EDF4FF]/60 text-[#174DDA] hover:border-[#7EA2EA]',
          )}
        >
          <Building2 className="h-3.5 w-3.5" />
          Business information {businessInfo ? '' : businessInfoRequired ? '(Required before publication)' : '(Optional)'}
        </button>
      </div>

      <Modal open={bizModalOpen} onClose={() => setBizModalOpen(false)} title="Business information" className="max-w-lg">
        <BusinessInfoForm
          initial={businessInfo}
          submitLabel="Save"
          onSave={(info) => {
            useEditorStore.getState().setBusinessInfo(info);
            setBizModalOpen(false);
            toast('success', "The business information has been saved. When published, it will be automatically displayed at the bottom of the site.");
          }}
          extraActions={
            <button
              type="button"
              onClick={() => setBizModalOpen(false)}
              className="inline-flex h-9 items-center rounded-lg border border-[#CAD5E5] px-4 text-sm text-[#344054] transition-colors hover:border-[#AEBACC]"
            >
              Cancel
            </button>
          }
        />
      </Modal>
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
        'flex h-6 w-6 items-center justify-center rounded text-[#5F6B7C] transition-colors disabled:opacity-30',
        danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-[#E8EDF5] hover:text-[#0B1736]',
      )}
    >
      {children}
    </button>
  );
}
