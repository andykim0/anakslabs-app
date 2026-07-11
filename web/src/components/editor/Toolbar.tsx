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
      <span className="flex items-center gap-1 text-[11px] text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" /> 저장 중…
      </span>
    );
  }
  if (saveStatus === 'error') {
    return (
      <span className="flex items-center gap-1 text-[11px] text-red-400">
        <AlertTriangle className="h-3 w-3" /> 저장 실패 — 자동 재시도 중
      </span>
    );
  }
  if (dirty) {
    return <span className="text-[11px] text-neutral-500">변경사항 저장 대기 중…</span>;
  }
  if (saveStatus === 'saved' && lastSavedAt) {
    const d = new Date(lastSavedAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return (
      <span className="flex items-center gap-1 text-[11px] text-neutral-500">
        <Check className="h-3 w-3 text-emerald-500" /> 저장됨 {hh}:{mm}
      </span>
    );
  }
  return <span className="text-[11px] text-neutral-600">모든 변경사항 저장됨</span>;
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
        active ? 'bg-neutral-800 text-neutral-50' : 'text-neutral-300 hover:bg-neutral-800 hover:text-neutral-50',
      )}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  siteName,
  onPublish,
  publishing,
  onExit,
}: {
  siteName: string;
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-800 bg-neutral-950 px-3">
      {/* 좌: 나가기 + 사이트명 + 저장상태 */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href="/dashboard"
          onClick={onExit}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 나가기
        </Link>
        <div className="h-4 w-px bg-neutral-800" />
        <span className="truncate text-sm font-semibold text-neutral-100">{siteName}</span>
        <SaveStatusIndicator />
      </div>

      {/* 중앙: 편집 도구 */}
      <div className="flex items-center gap-0.5">
        <ToolButton title="실행 취소 (⌘Z)" disabled={!canUndo} onClick={undoEditor}>
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton title="다시 실행 (⇧⌘Z)" disabled={!canRedo} onClick={redoEditor}>
          <Redo2 className="h-4 w-4" />
        </ToolButton>

        <div className="mx-1.5 h-4 w-px bg-neutral-800" />

        <DropMenu
          trigger={
            <button
              type="button"
              disabled={previewing}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" /> 요소 추가
            </button>
          }
          items={ELEMENT_KINDS.map((kind) => ({
            key: kind,
            label: ELEMENT_KIND_LABELS[kind],
            icon: ELEMENT_ICONS[kind],
            onSelect: () => addElement(kind),
          }))}
        />

        <div className="mx-1.5 h-4 w-px bg-neutral-800" />

        <ToolButton title="축소" onClick={() => stepZoom(-1)} disabled={previewing}>
          <ZoomOut className="h-4 w-4" />
        </ToolButton>
        <span className="w-11 text-center text-[11px] tabular-nums text-neutral-400">
          {Math.round(effectiveScale * 100)}%
        </span>
        <ToolButton title="확대" onClick={() => stepZoom(1)} disabled={previewing}>
          <ZoomIn className="h-4 w-4" />
        </ToolButton>
        <ToolButton
          title="화면에 맞춤"
          active={zoom === 'fit'}
          onClick={() => useEditorStore.getState().setZoom('fit')}
          disabled={previewing}
        >
          <Maximize className="h-3.5 w-3.5" />
        </ToolButton>

        <div className="mx-1.5 h-4 w-px bg-neutral-800" />

        {/* 편집 / 미리보기(발행본 동일: 애니메이션·버튼 동작) / 모바일(자동 스택) */}
        <div className="flex rounded-lg border border-neutral-700 p-0.5">
          <button
            type="button"
            title="편집 캔버스"
            onClick={() => useEditorStore.getState().setPreview('off')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'off' ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200',
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="미리보기 — 등장 애니메이션·버튼이 발행본과 동일하게 동작"
            onClick={() => useEditorStore.getState().setPreview('desktop')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'desktop' ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="모바일 미리보기 (y좌표 순 자동 스택)"
            onClick={() => useEditorStore.getState().setPreview('mobile')}
            className={cn(
              'flex h-7 w-9 items-center justify-center rounded-md transition-colors',
              preview === 'mobile' ? 'bg-neutral-700 text-neutral-50' : 'text-neutral-400 hover:text-neutral-200',
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
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-3.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          발행
        </button>
      </div>
    </header>
  );
}
