'use client';

/**
 * 상단 툴바 — 나가기/저장상태 · undo/redo · 요소 추가 · 줌 · 편집/미리보기/모바일 토글 · 발행.
 */
import Link from 'next/link';
import { useStore } from 'zustand';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Eye,
  Film,
  FormInput,
  Image as ImageIcon,
  Loader2,
  Map as MapIcon,
  Maximize,
  Minus,
  Monitor,
  MousePointerClick,
  Plus,
  Redo2,
  Rocket,
  Share2,
  Smartphone,
  Square,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { ElementKind } from '@/lib/types/site';
import { redoEditor, undoEditor, useEditorStore, activeSections} from '@/stores/editor';
import { cn } from '@/components/dashboard/ui';
import { ELEMENT_KIND_LABELS } from './defaults';
import { DropMenu } from './DropMenu';
import { MAX_ZOOM, MIN_ZOOM } from './CanvasStage';

const ELEMENT_ICONS: Record<ElementKind, React.ReactNode> = {
  text: <Type className="h-3.5 w-3.5" />,
  image: <ImageIcon className="h-3.5 w-3.5" />,
  button: <MousePointerClick className="h-3.5 w-3.5" />,
  shape: <Square className="h-3.5 w-3.5" />,
  divider: <Minus className="h-3.5 w-3.5" />,
  video: <Film className="h-3.5 w-3.5" />,
  form: <FormInput className="h-3.5 w-3.5" />,
  map: <MapIcon className="h-3.5 w-3.5" />,
  socialLinks: <Share2 className="h-3.5 w-3.5" />,
};

const ELEMENT_KINDS = Object.keys(ELEMENT_KIND_LABELS) as ElementKind[];

function SaveStatusIndicator() {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const dirty = useEditorStore((s) => s.dirty);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

  if (saveStatus === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#545C70]">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (saveStatus === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-red-400">
        <AlertTriangle className="h-3 w-3" /> Save failed — automatically retrying
      </span>
    );
  }
  if (dirty) {
    return <span className="text-[11px] text-[#6a7286]">Waiting to save changes...</span>;
  }
  if (saveStatus === 'saved' && lastSavedAt) {
    const d = new Date(lastSavedAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#6a7286]">
        <Check className="h-3 w-3 text-emerald-500" /> saved {hh}:{mm}
      </span>
    );
  }
  return <span className="text-[11px] text-[#6a7286]">All changes saved</span>;
}

function ToolButton({
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg px-1.5 text-xs transition-colors disabled:opacity-30',
        active ? 'bg-[#E8EDF5] text-[#141A3A]' : 'text-[#344054] hover:bg-[#E8EDF5] hover:text-[#141A3A]',
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  siteName,
  exitHref,
  onPublish,
  publishing,
  onExit,
}: {
  siteName: string;
  /** [T1] 나가기 목적지 — 진입 경로(?from=) 우선, 폴백은 사이트 상세(딥링크 진입 대비) */
  exitHref: string;
  onPublish: () => void;
  publishing: boolean;
  onExit: () => void;
}) {
  const zoom = useEditorStore((s) => s.zoom);
  const fitScale = useEditorStore((s) => s.fitScale);
  const preview = useEditorStore((s) => s.preview);
  const previewing = preview !== 'off';
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);

  const effectiveScale = zoom === 'fit' ? fitScale : zoom;

  const stepZoom = (dir: 1 | -1) => {
    const next = Math.round((effectiveScale + dir * 0.1) * 10) / 10;
    useEditorStore.getState().setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  };

  const addElement = (kind: ElementKind) => {
    const store = useEditorStore.getState();
    let sectionId = store.selectedSectionId;
    if (!sectionId || !activeSections(store.config).some((s) => s.id === sectionId)) {
      sectionId = activeSections(store.config)[0]?.id ?? store.addSection('custom');
    }
    useEditorStore.getState().addElement(sectionId, kind);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#DFE1E6] bg-[#F6F7F9] px-3">
      {/* 좌: 나가기 + 사이트명 + 저장상태 */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href={exitHref}
          onClick={onExit}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-[#545C70] transition-colors hover:bg-[#E8EDF5] hover:text-[#141A3A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Exit
        </Link>
        <div className="h-4 w-px bg-[#E8EDF5]" />
        <span className="truncate text-sm font-semibold text-[#141A3A]">{siteName}</span>
        <SaveStatusIndicator />
      </div>

      {/* 중앙: 편집 도구 */}
      <div className="flex items-center gap-0.5">
        <ToolButton title="Undo (⌘Z)" disabled={!canUndo} onClick={undoEditor}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redoEditor}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>

        <div className="mx-1.5 h-4 w-px bg-[#E8EDF5]" />

        <DropMenu
          trigger={
            <button
              type="button"
              disabled={previewing}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[#D9DAE0] px-2.5 text-xs font-medium text-[#232C52] transition-colors hover:border-[#AEBACC] hover:bg-white disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> Add element
            </button>
          }
          items={ELEMENT_KINDS.map((kind) => ({
            key: kind,
            label: ELEMENT_KIND_LABELS[kind],
            icon: ELEMENT_ICONS[kind],
            onSelect: () => addElement(kind),
          }))}
        />

        <div className="mx-1.5 h-4 w-px bg-[#E8EDF5]" />

        <ToolButton title="reduction" onClick={() => stepZoom(-1)} disabled={previewing}>
          <ZoomOut className="h-4 w-4" />
        </ToolButton>
        <span className="w-11 text-center text-[11px] tabular-nums text-[#545C70]">
          {Math.round(effectiveScale * 100)}%
        </span>
        <ToolButton title="enlargement" onClick={() => stepZoom(1)} disabled={previewing}>
          <ZoomIn className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="Fit to screen"
          active={zoom === 'fit'}
          onClick={() => useEditorStore.getState().setZoom('fit')}
          disabled={previewing}
        >
          <Maximize className="h-3.5 w-3.5" />
        </ToolButton>

        <div className="mx-1.5 h-4 w-px bg-[#E8EDF5]" />

        {/* 편집 / 미리보기(발행본 동일: 애니메이션·버튼 동작) / 모바일(자동 스택) */}
        <div className="flex rounded-lg border border-[#D9DAE0] p-0.5">
          <button
            type="button"
            title="editing canvas"
            onClick={() => useEditorStore.getState().setPreview('off')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'off' ? 'bg-[#DFE1E6] text-[#141A3A]' : 'text-[#545C70] hover:text-[#232C52]',
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Preview — Appearance animation and buttons work the same as in the published version"
            onClick={() => useEditorStore.getState().setPreview('desktop')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'desktop' ? 'bg-[#DFE1E6] text-[#141A3A]' : 'text-[#545C70] hover:text-[#232C52]',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Mobile preview (automatic stacking by y-coordinate)"
            onClick={() => useEditorStore.getState().setPreview('mobile')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'mobile' ? 'bg-[#DFE1E6] text-[#141A3A]' : 'text-[#545C70] hover:text-[#232C52]',
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 우: 발행 */}
      <div className="flex flex-1 items-center justify-end">
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#2D63F0] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#2F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          publication
        </button>
      </div>
    </header>
  );
}
