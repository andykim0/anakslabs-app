'use client';

/**
 * 우측 인스펙터.
 *  - 요소 선택: 종류별 속성 + 공통(위치/크기/회전/불투명도/z/잠금/모바일 숨김)
 *  - 섹션 선택: 이름/유형/높이/배경(색·그라디언트·이미지+오버레이)/숨김
 *  - 미선택: 테마(팔레트 6색 / 폰트 큐레이션 셀렉트 / radius / 사이트 제목)
 */
import { createContext, useContext, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Copy,
  Lock,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  ButtonElement,
  CanvasElement,
  DividerElement,
  FormElement,
  ImageElement,
  MapElement,
  MotionIntensity,
  Section,
  ShapeElement,
  SiteTheme,
  SnsKind,
  SocialLinksElement,
  TextElement,
  VideoElement,
} from '@/lib/types/site';
import type { EditType } from '@/lib/types/domain';
import { CREDIT_COSTS } from '@/lib/credits/constants';
import { isHttpsUrl, isSafeMapEmbedUrl } from '@/lib/safe-url';
import { ACTIVE_PRESET_IDS, MOTION_PRESETS, type PresetId } from '@/lib/motion/presets';
import { MOTION_TECHNIQUES } from '@/lib/motion/registry';
import { contrastRatio } from '@/lib/design/quality-standards';
import { findElementLocation, useEditorStore, activeSections} from '@/stores/editor';
import { cn } from '@/components/dashboard/ui';
import { clampFrameToSection, MIN_H, MIN_W } from './snap';
import { uploadEditorImage } from './api';
import { ELEMENT_KIND_LABELS, SECTION_TYPE_LABELS } from './defaults';
import { computeGoogleFonts, FONT_OPTIONS, matchFontOption } from './fonts';
import {
  ColorField,
  FieldGroup,
  NumberField,
  RangeField,
  SegmentedField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from './fields';

const AiEditAvailabilityContext = createContext(false);

export function Inspector({ aiEditAvailable = false }: { aiEditAvailable?: boolean }) {
  return (
    <AiEditAvailabilityContext.Provider value={aiEditAvailable}>
      <InspectorContent />
    </AiEditAvailabilityContext.Provider>
  );
}

function InspectorContent() {
  const config = useEditorStore((s) => s.config);
  const selectedElementId = useEditorStore((s) => s.selectedElementId);
  const selectedSectionId = useEditorStore((s) => s.selectedSectionId);

  const loc = findElementLocation(config, selectedElementId);
  if (loc) {
    return <ElementInspector element={loc.element} section={loc.section} theme={config.theme} />;
  }

  const section = activeSections(config).find((s) => s.id === selectedSectionId) ?? null;
  if (section) {
    return <SectionInspector section={section} theme={config.theme} />;
  }

  return <ThemeInspector theme={config.theme} title={config.meta.title} />;
}

// ---------- 공용 조각 ----------

function AiGenerateButton({ type, label }: { type: EditType; label: string }) {
  const aiEditAvailable = useContext(AiEditAvailabilityContext);
  if (!aiEditAvailable) return null;
  return (
    <button
      type="button"
      onClick={() => useEditorStore.getState().setAiIntent(type)}
      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#9DB7EB] bg-[#EDF4FF] text-xs font-medium text-[#174DDA] transition-colors hover:border-[#7EA2EA]"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label} ({CREDIT_COSTS[type]}credit)
    </button>
  );
}

/** [F3 #4] 파일에서 이미지 교체 — 로고·이미지 요소 공용. 업로드 후 src 커밋 */
function ImageUploadButton({ onUploaded }: { onUploaded: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setErr(null);
          try {
            onUploaded(await uploadEditorImage(file));
          } catch (ex) {
            setErr(ex instanceof Error ? ex.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#CAD5E5] text-xs font-medium text-[#344054] transition-colors hover:border-[#AEBACC] hover:bg-[#E8EDF5] disabled:opacity-40"
      >
        <Upload className="h-3.5 w-3.5" />
        {busy ? "Uploading..." : "replace from file"}
      </button>
      {err ? <p className="mt-1 text-[11px] text-red-400">{err}</p> : null}
    </div>
  );
}

function SmallIconButton({
  title,
  onClick,
  danger,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-7 flex-1 items-center justify-center rounded-md border border-[#CAD5E5] text-[#344054] transition-colors disabled:opacity-30',
        danger
          ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-700'
          : 'hover:border-[#AEBACC] hover:bg-[#E8EDF5] hover:text-[#0B1736]',
      )}
    >
      {children}
    </button>
  );
}

// ---------- 요소 인스펙터 ----------

function ElementInspector({
  element,
  section,
  theme,
}: {
  element: CanvasElement;
  section: Section;
  theme: SiteTheme;
}) {
  const store = useEditorStore.getState;

  const commitFrame = (patch: Partial<CanvasElement['frame']>) => {
    const next = { ...element.frame, ...patch };
    next.w = Math.max(MIN_W, next.w);
    next.h = Math.max(MIN_H, next.h);
    store().updateElementFrame(element.id, clampFrameToSection(next, section.height));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[#DCE4F0] px-4 py-3">
        <span className="text-xs font-semibold text-[#26354D]">
          {ELEMENT_KIND_LABELS[element.kind]} element
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            title="Duplicate (⌘D)"
            onClick={() => store().duplicateElement(element.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#5F6B7C] transition-colors hover:bg-[#E8EDF5] hover:text-[#0B1736]"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={() => store().deleteElement(element.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#5F6B7C] transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 종류별 속성 */}
      {element.kind === 'text' ? <TextFields el={element} /> : null}
      {element.kind === 'image' ? <ImageFields el={element} /> : null}
      {element.kind === 'button' ? <ButtonFields el={element} theme={theme} /> : null}
      {element.kind === 'shape' ? <ShapeFields el={element} /> : null}
      {element.kind === 'divider' ? <DividerFields el={element} /> : null}
      {element.kind === 'video' ? <VideoFields el={element} /> : null}
      {element.kind === 'form' ? <FormFields el={element} /> : null}
      {element.kind === 'map' ? <MapFields el={element} /> : null}
      {element.kind === 'socialLinks' ? <SocialLinksFields el={element} /> : null}

      {/* 공통 속성 */}
      <FieldGroup title="Location/Size">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={Math.round(element.frame.x)} onCommit={(v) => commitFrame({ x: v })} />
          <NumberField label="Y" value={Math.round(element.frame.y)} onCommit={(v) => commitFrame({ y: v })} />
          <NumberField label="width" value={Math.round(element.frame.w)} min={MIN_W} onCommit={(v) => commitFrame({ w: v })} />
          <NumberField label="height" value={Math.round(element.frame.h)} min={MIN_H} onCommit={(v) => commitFrame({ h: v })} />
        </div>
        <NumberField
          label="rotation (°)"
          value={element.rotation ?? 0}
          min={-180}
          max={180}
          onCommit={(v) => store().updateElement(element.id, { rotation: v === 0 ? undefined : v })}
        />
        <RangeField
          label="opacity"
          value={Math.round((element.opacity ?? 1) * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onCommit={(v) => store().updateElement(element.id, { opacity: v >= 100 ? undefined : v / 100 })}
        />
      </FieldGroup>

      <FieldGroup title="stacking order">
        <div className="flex gap-1.5">
          <SmallIconButton title="to the front" onClick={() => store().reorderElement(element.id, 'front')}>
            <ChevronsUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="from now on" onClick={() => store().reorderElement(element.id, 'forward')}>
            <ChevronUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="back" onClick={() => store().reorderElement(element.id, 'backward')}>
            <ChevronDown className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="back" onClick={() => store().reorderElement(element.id, 'back')}>
            <ChevronsDown className="h-3.5 w-3.5" />
          </SmallIconButton>
        </div>
      </FieldGroup>

      {/* [motion 3단계] 요소별 등장 애니메이션 UI 제거 — 모션은 사이트 레벨 프리셋(테마 패널의 모션 섹션)이
          단일 소스다. 구 element.entrance는 렌더러가 더 이상 읽지 않는다(2단계에서 Reveal 흡수·삭제). */}

      <FieldGroup title="mark">
        <ToggleField
          label="Lock (prevent movement/editing)"
          value={element.locked ?? false}
          onCommit={(v) => store().updateElement(element.id, { locked: v || undefined })}
        />
        <ToggleField
          label="Hidden on mobile"
          value={element.hiddenOnMobile ?? false}
          onCommit={(v) => store().updateElement(element.id, { hiddenOnMobile: v || undefined })}
        />
      </FieldGroup>
    </div>
  );
}

// ----- 텍스트 -----

function TextFields({ el }: { el: TextElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <>
      <FieldGroup title="text">
        <TextAreaField label="detail" value={el.text} onCommit={(v) => store().updateElement(el.id, { text: v })} />
        <AiGenerateButton type="text" label="Rewrite with AI" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="size" value={s.fontSize} min={8} max={220} onCommit={(v) => store().updateElementStyle(el.id, { fontSize: v })} />
          <SelectField
            label="Thickness"
            value={String(s.fontWeight ?? 400)}
            options={['300', '400', '500', '600', '700', '800', '900'].map((w) => ({ value: w, label: w }))}
            onCommit={(v) => store().updateElementStyle(el.id, { fontWeight: Number(v) })}
          />
        </div>
        <SegmentedField
          label="font"
          value={s.fontFamily ?? 'body'}
          options={[
            { value: 'heading' as const, label: "For title" },
            { value: 'body' as const, label: "For main text" },
          ]}
          onCommit={(v) => store().updateElementStyle(el.id, { fontFamily: v })}
        />
        <ColorField label="color" value={s.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
        <SegmentedField
          label="array"
          value={s.align ?? 'left'}
          options={[
            { value: 'left' as const, label: <AlignLeft className="h-3.5 w-3.5" />, title: "left" },
            { value: 'center' as const, label: <AlignCenter className="h-3.5 w-3.5" />, title: "middle" },
            { value: 'right' as const, label: <AlignRight className="h-3.5 w-3.5" />, title: "right" },
          ]}
          onCommit={(v) => store().updateElementStyle(el.id, { align: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="space between lines" value={s.lineHeight ?? 1.45} min={0.8} max={3} step={0.05} onCommit={(v) => store().updateElementStyle(el.id, { lineHeight: v })} />
          <NumberField label="Tracking (px)" value={s.letterSpacing ?? 0} min={-10} max={40} step={0.5} onCommit={(v) => store().updateElementStyle(el.id, { letterSpacing: v })} />
        </div>
        <ToggleField label="italic (italic)" value={s.italic ?? false} onCommit={(v) => store().updateElementStyle(el.id, { italic: v || undefined })} />
      </FieldGroup>
    </>
  );
}

// ----- 이미지 -----

function ImageFields({ el }: { el: ImageElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="image">
      <TextField
        label="image url"
        value={el.src}
        allowEmpty={false}
        placeholder="https://…"
        hint="Paste the URL or use AI generation below."
        onCommit={(v) => store().updateElement(el.id, { src: v })}
      />
      <ImageUploadButton onUploaded={(url) => store().updateElement(el.id, { src: url })} />
      <AiGenerateButton type="image" label="Create images with AI" />
      <TextField label="Alternative text (alt)" value={el.alt ?? ''} onCommit={(v) => store().updateElement(el.id, { alt: v || undefined })} />
      <SegmentedField
        label="Fill method"
        value={s.objectFit ?? 'cover'}
        options={[
          { value: 'cover' as const, label: "full" },
          { value: 'contain' as const, label: "fully visible" },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { objectFit: v })}
      />
      <NumberField label="rounded corners" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <ToggleField label="shadow" value={s.shadow ?? false} onCommit={(v) => store().updateElementStyle(el.id, { shadow: v || undefined })} />
    </FieldGroup>
  );
}

// ----- 버튼 -----

function ButtonFields({ el, theme }: { el: ButtonElement; theme: SiteTheme }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="button">
      <TextField label="label" value={el.label} onCommit={(v) => store().updateElement(el.id, { label: v })} />
      <TextField label="link (href)" value={el.href} placeholder="#, /menu, https://…" onCommit={(v) => store().updateElement(el.id, { href: v })} />
      <SegmentedField
        label="style"
        value={s.variant}
        options={[
          { value: 'solid' as const, label: "replenishment" },
          { value: 'outline' as const, label: "outline" },
          { value: 'ghost' as const, label: "text" },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { variant: v })}
      />
      <ColorField label="button color" value={s.color} clearable clearLabel="theme point color" onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <ColorField label="letter color" value={s.textColor} clearable onCommit={(v) => store().updateElementStyle(el.id, { textColor: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="font size" value={s.fontSize ?? 16} min={10} max={40} onCommit={(v) => store().updateElementStyle(el.id, { fontSize: v })} />
        <NumberField label="roundness" value={s.borderRadius ?? theme.radius ?? 8} min={0} max={60} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      </div>
    </FieldGroup>
  );
}

// ----- 도형 -----

function ShapeFields({ el }: { el: ShapeElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="diagram">
      <SegmentedField
        label="shape"
        value={el.shape}
        options={[
          { value: 'rect' as const, label: "quadrangle" },
          { value: 'ellipse' as const, label: "circle" },
          { value: 'line' as const, label: "line" },
        ]}
        onCommit={(v) => store().updateElement(el.id, { shape: v })}
      />
      <ColorField label="fill color" value={s.fill} clearable onCommit={(v) => store().updateElementStyle(el.id, { fill: v })} />
      <ColorField label="border color" value={s.borderColor} clearable onCommit={(v) => store().updateElementStyle(el.id, { borderColor: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="border thickness" value={s.borderWidth ?? 0} min={0} max={24} onCommit={(v) => store().updateElementStyle(el.id, { borderWidth: v || undefined })} />
        <NumberField label="roundness" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      </div>
    </FieldGroup>
  );
}

// ----- 구분선 -----

function DividerFields({ el }: { el: DividerElement }) {
  const store = useEditorStore.getState;
  return (
    <FieldGroup title="contour">
      <ColorField label="color" value={el.style.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <NumberField label="thickness" value={el.style.thickness ?? 1} min={1} max={24} onCommit={(v) => store().updateElementStyle(el.id, { thickness: v })} />
    </FieldGroup>
  );
}

// ----- 영상 -----

function VideoFields({ el }: { el: VideoElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="video">
      <TextField
        label="Video URL"
        value={el.src}
        allowEmpty={false}
        placeholder="https://….mp4"
        onCommit={(v) => store().updateElement(el.id, { src: v })}
      />
      <AiGenerateButton type="video" label="Video creation with AI" />
      <TextField
        label="Poster image URL"
        value={el.poster ?? ''}
        placeholder="Image to display before playback"
        onCommit={(v) => store().updateElement(el.id, { poster: v.trim() ? v : undefined })}
      />
      <SegmentedField
        label="Fill method"
        value={s.objectFit ?? 'cover'}
        options={[
          { value: 'cover' as const, label: "full" },
          { value: 'contain' as const, label: "fully visible" },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { objectFit: v })}
      />
      <NumberField label="rounded corners" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <ToggleField label="auto play" value={s.autoplay ?? false} onCommit={(v) => store().updateElementStyle(el.id, { autoplay: v })} />
      <ToggleField label="repeat play" value={s.loop ?? true} onCommit={(v) => store().updateElementStyle(el.id, { loop: v })} />
      <ToggleField label="mute" value={s.muted ?? true} onCommit={(v) => store().updateElementStyle(el.id, { muted: v })} />
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] 문의 폼 -----

const FORM_FIELD_OPTIONS: { value: FormElement['fields'][number]; label: string }[] = [
  { value: 'name', label: "name" },
  { value: 'phone', label: "contact" },
  { value: 'email', label: "email" },
  { value: 'message', label: "Inquiry details" },
];

function FormFields({ el }: { el: FormElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  const toggleField = (f: FormElement['fields'][number]) => {
    const has = el.fields.includes(f);
    const next = has ? el.fields.filter((x) => x !== f) : [...el.fields, f];
    if (next.length === 0) return; // 최소 1개 유지 (zod min(1))
    // 순서는 옵션 정의 순으로 정규화
    const ordered = FORM_FIELD_OPTIONS.map((o) => o.value).filter((v) => next.includes(v));
    store().updateElement(el.id, { fields: ordered });
  };
  return (
    <FieldGroup title="Inquiry form">
      <div className="space-y-1.5">
        <span className="block text-[11px] text-[#667085]">Fields to receive (minimum 1)</span>
        {FORM_FIELD_OPTIONS.map((o) => (
          <ToggleField
            key={o.value}
            label={o.label}
            value={el.fields.includes(o.value)}
            onCommit={() => toggleField(o.value)}
          />
        ))}
      </div>
      <TextField label="button label" value={el.submitLabel} onCommit={(v) => store().updateElement(el.id, { submitLabel: v || "Send inquiry" })} />
      <SegmentedField
        label="style"
        value={s.variant}
        options={[
          { value: 'card' as const, label: "card" },
          { value: 'plain' as const, label: "transparency" },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { variant: v })}
      />
      <ColorField label="button color" value={s.color} clearable clearLabel="theme point color" onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <NumberField label="roundness" value={s.borderRadius ?? 8} min={0} max={40} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <p className="text-[11px] leading-4 text-[#667085]">
        Submitted inquiries are accumulated in the inquiry box in the dashboard site details.
      </p>
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] 지도 -----

function MapFields({ el }: { el: MapElement }) {
  const store = useEditorStore.getState;
  const invalid = el.embedUrl !== '' && !isSafeMapEmbedUrl(el.embedUrl);
  return (
    <FieldGroup title="map">
      <TextField
        label="Map embed URL"
        value={el.embedUrl}
        placeholder="https://www.google.com/maps/embed?..."
        hint="In Google Maps, choose Share → Embed a map and paste the iframe src URL."
        onCommit={(v) => store().updateElement(el.id, { embedUrl: v.trim() })}
      />
      {invalid ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-2.5 py-2 text-[11px] leading-4 text-red-300">
          This address is not allowed. Use a www.google.com/maps/embed URL. Saving is blocked until it is valid.
        </p>
      ) : null}
      <NumberField label="roundness" value={el.style.borderRadius ?? 8} min={0} max={40} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] SNS 링크 -----

const SNS_KIND_OPTIONS: { value: SnsKind; label: string }[] = [
  { value: 'instagram', label: "Instagram" },
  { value: 'youtube', label: "YouTube" },
  { value: 'x', label: "X (Twitter)" },
  { value: 'custom', label: "Other Links" },
];

function SocialLinksFields({ el }: { el: SocialLinksElement }) {
  const store = useEditorStore.getState;
  const commitLinks = (links: SocialLinksElement['links']) => {
    if (links.length === 0) return; // zod min(1)
    store().updateElement(el.id, { links });
  };
  return (
    <FieldGroup title="SNS Links">
      {el.links.map((link, i) => {
        const badUrl = link.url !== '' && !isHttpsUrl(link.url);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-[#DCE4F0] p-2">
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <SelectField
                  label={`link${i + 1}`}
                  value={link.kind}
                  options={SNS_KIND_OPTIONS}
                  onCommit={(v) => commitLinks(el.links.map((l, j) => (j === i ? { ...l, kind: v as SnsKind } : l)))}
                />
              </div>
              <button
                type="button"
                title="Delete link"
                disabled={el.links.length <= 1}
                onClick={() => commitLinks(el.links.filter((_, j) => j !== i))}
                className="mt-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#CAD5E5] text-[#5F6B7C] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <TextField
              label="URL (https)"
              value={link.url}
              placeholder="https://instagram.com/…"
              onCommit={(v) => commitLinks(el.links.map((l, j) => (j === i ? { ...l, url: v.trim() } : l)))}
            />
            {badUrl ? <p className="text-[11px] text-red-300">Only https:// addresses can be used.</p> : null}
          </div>
        );
      })}
      <button
        type="button"
        disabled={el.links.length >= 8}
        onClick={() => commitLinks([...el.links, { kind: 'custom', url: '' }])}
        className="h-8 w-full rounded-md border border-dashed border-[#CAD5E5] text-xs text-[#5F6B7C] transition-colors hover:border-[#AEBACC] hover:text-[#26354D] disabled:opacity-40"
      >
        + Add link
      </button>
      <SegmentedField
        label="arrangement"
        value={el.style.direction}
        options={[
          { value: 'row' as const, label: "width" },
          { value: 'column' as const, label: "length" },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { direction: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="icon size" value={el.style.size ?? 40} min={24} max={96} onCommit={(v) => store().updateElementStyle(el.id, { size: v })} />
      </div>
      <ColorField label="icon color" value={el.style.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
    </FieldGroup>
  );
}

// ---------- 섹션 인스펙터 ----------

type BgMode = 'color' | 'gradient' | 'image';

function SectionInspector({ section, theme }: { section: Section; theme: SiteTheme }) {
  const store = useEditorStore.getState;
  const sections = useEditorStore((s) => activeSections(s.config));
  const idx = sections.findIndex((s) => s.id === section.id);
  const bg = section.background;
  const mode: BgMode = bg.image ? 'image' : bg.gradient ? 'gradient' : 'color';

  const switchMode = (next: BgMode) => {
    if (next === mode) return;
    if (next === 'color') {
      store().updateSectionBackground(section.id, { color: bg.color ?? theme.palette.background });
    } else if (next === 'gradient') {
      store().updateSectionBackground(section.id, {
        gradient: bg.gradient ?? `linear-gradient(165deg, ${theme.palette.surface} 0%, ${theme.palette.background} 100%)`,
      });
    } else {
      store().updateSectionBackground(section.id, {
        image: {
          // zod가 src min(1)을 요구 — 빈 문자열 저장 방지를 위해 즉시 플레이스홀더 지정
          src: bg.image?.src ?? `https://picsum.photos/seed/${section.id.slice(0, 8)}/1920/1080`,
          overlayColor: bg.image?.overlayColor ?? '#000000',
          overlayOpacity: bg.image?.overlayOpacity ?? 0.4,
        },
      });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[#DCE4F0] px-4 py-3">
        <span className="text-xs font-semibold text-[#26354D]">Section settings</span>
        <div className="flex gap-1">
          <SmallIconButton title="move up" disabled={idx <= 0} onClick={() => store().moveSection(section.id, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="move down" disabled={idx >= sections.length - 1} onClick={() => store().moveSection(section.id, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="replication" onClick={() => store().duplicateSection(section.id)}>
            <Copy className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="Delete" danger onClick={() => store().deleteSection(section.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </SmallIconButton>
        </div>
      </div>

      <FieldGroup title="basic">
        <TextField label="name" value={section.name} onCommit={(v) => store().updateSection(section.id, { name: v })} />
        <SelectField
          label="category"
          value={section.type}
          options={(Object.keys(SECTION_TYPE_LABELS) as Section['type'][]).map((t) => ({
            value: t,
            label: SECTION_TYPE_LABELS[t],
          }))}
          onCommit={(v) => store().updateSection(section.id, { type: v })}
        />
        <NumberField label="Height (px)" value={section.height} min={160} max={4000} step={10} onCommit={(v) => store().updateSection(section.id, { height: v })} />
        <SelectField
          label="layout"
          value={section.layout ?? 'canvas'}
          options={[
            { value: 'canvas' as const, label: "Canvas (free placement)" },
            { value: 'marquee' as const, label: "Flow strip (logo/menu horizontal flow)" },
          ]}
          onCommit={(v) => store().updateSection(section.id, { layout: v === 'canvas' ? undefined : v })}
        />
        <ToggleField label="Hidden (except when published)" value={section.hidden ?? false} onCommit={(v) => store().updateSection(section.id, { hidden: v || undefined })} />
      </FieldGroup>

      <FieldGroup title="background">
        <SegmentedField
          label="background type"
          value={mode}
          options={[
            { value: 'color' as const, label: "solid color" },
            { value: 'gradient' as const, label: "gradient" },
            { value: 'image' as const, label: "image" },
          ]}
          onCommit={switchMode}
        />

        {mode === 'color' ? (
          <ColorField
            label="background color"
            value={bg.color}
            clearable
            clearLabel="theme background color"
            onCommit={(v) => store().updateSectionBackground(section.id, v === undefined ? {} : { color: v })}
          />
        ) : null}

        {mode === 'gradient' ? (
          <>
            <TextField
              label="CSS gradients"
              value={bg.gradient ?? ''}
              allowEmpty={false}
              placeholder="linear-gradient(…)"
              onCommit={(v) => store().updateSectionBackground(section.id, { gradient: v })}
            />
            <button
              type="button"
              onClick={() =>
                store().updateSectionBackground(section.id, {
                  gradient: `linear-gradient(165deg, ${theme.palette.primary} 0%, ${theme.palette.accent} 100%)`,
                })
              }
              className="h-7 w-full rounded-md border border-[#CAD5E5] text-[11px] text-[#344054] transition-colors hover:border-[#AEBACC]"
            >
              Create a gradient with palette colors
            </button>
          </>
        ) : null}

        {mode === 'image' && bg.image ? (
          <>
            <TextField
              label="Background image URL"
              value={bg.image.src}
              allowEmpty={false}
              placeholder="https://…"
              onCommit={(v) => store().updateSectionBackground(section.id, { image: { ...bg.image!, src: v } })}
            />
            <ColorField
              label="overlay color"
              value={bg.image.overlayColor}
              clearable
              clearLabel="No overlay"
              onCommit={(v) =>
                store().updateSectionBackground(section.id, {
                  image: { src: bg.image!.src, overlayOpacity: bg.image!.overlayOpacity, overlayColor: v },
                })
              }
            />
            <RangeField
              label="Darken the overlay"
              value={Math.round((bg.image.overlayOpacity ?? 0.45) * 100)}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              onCommit={(v) =>
                store().updateSectionBackground(section.id, { image: { ...bg.image!, overlayOpacity: v / 100 } })
              }
            />
          </>
        ) : null}
      </FieldGroup>

      <div className="px-4 py-3 text-[11px] leading-5 text-[#667085]">
        Select an element to edit its detailed properties, or click in an empty space to edit the site theme.
      </div>
    </div>
  );
}

// ---------- 테마 인스펙터 ----------

const PALETTE_LABELS: { key: keyof SiteTheme['palette']; label: string }[] = [
  { key: 'background', label: "background" },
  { key: 'surface', label: "surface (card)" },
  { key: 'text', label: "body text" },
  { key: 'muted', label: "secondary text" },
  { key: 'primary', label: "point" },
  { key: 'accent', label: "stress" },
];

// ----- [motion 3단계] 사이트 모션 프리셋 피커 + 강도 -----

const INTENSITY_LABELS: Record<MotionIntensity, string> = { off: "Off", subtle: "Subtly", normal: "basic" };
const PRESET_LABELS: Record<PresetId, string> = {
  'cafe-basic': "Cafe/Workshop",
  'academy-basic': "Academy/Education",
  'office-basic': "Company/Office",
  'clinic-premium': "clinic",
  'dining-premium': "Fine Dining",
  'beauty-premium': "Beauty·Wellness",
  'cinematic-hero': "cinematic video",
  'base-calm-v2': "Calm basic motion",
  'base-flow-v2': "local flow motion",
  'base-editorial-v2': "Editorial Motion",
  'base-premium-v2': "Premium basic motion",
};

/** 프리셋이 쓰는 기법 role 요약 (registry role 앞부분 — 규칙 파일 단일 소스) */
function presetTechniqueSummary(pid: PresetId): string {
  const p = MOTION_PRESETS[pid];
  return [p.hero, ...p.accents].map((id) => MOTION_TECHNIQUES[id].role.split(' — ')[0]).join(' · ');
}

function PresetCard({ pid, active, onSelect }: { pid: PresetId; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-2 text-left transition-colors',
        active ? 'border-[#174DDA] bg-[#EDF4FF]/60' : 'border-[#CAD5E5] hover:border-[#AEBACC]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-[#0B1736]">{PRESET_LABELS[pid]}</span>
        {active ? <Check className="ml-auto h-3.5 w-3.5 text-[#174DDA]" /> : null}
      </div>
      <p className="mt-0.5 text-[10px] leading-4 text-[#667085]">{presetTechniqueSummary(pid)}</p>
    </button>
  );
}

/** AI 영상 홈페이지 미적용 계정에 영상 프리셋을 잠금 카드로 안내한다. */
function PresetLockCard({ pid }: { pid: PresetId }) {
  return (
    <div className="w-full rounded-lg border border-[#9DB7EB] bg-[#EDF4FF]/40 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <Lock className="h-3 w-3 text-[#174DDA]" />
        <span className="text-xs font-semibold text-[#174DDA]">{PRESET_LABELS[pid]}</span>
        <span className="ml-auto text-[9px] font-semibold tracking-wide text-[#174DDA]/70">AI video</span>
      </div>
      <p className="mt-0.5 text-[10px] leading-4 text-[#667085]">{presetTechniqueSummary(pid)}</p>
      <a
        href="/dashboard/billing"
        className="mt-1.5 inline-flex h-7 items-center gap-1 rounded-md bg-[#174DDA] px-2.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#245FE5]"
      >
        <Sparkles className="h-3 w-3" /> AI video website inquiry
      </a>
    </div>
  );
}

function MotionPanel() {
  const motion = useEditorStore((s) => s.config.motion);
  const tier = useEditorStore((s) => s.tier);
  const store = useEditorStore.getState;
  const current = motion?.presetId ?? 'base-calm-v2';
  const intensity = motion?.intensity ?? 'normal';
  const presetIds: PresetId[] = (ACTIVE_PRESET_IDS as readonly string[]).includes(current)
    ? [...ACTIVE_PRESET_IDS]
    : [current as PresetId, ...ACTIVE_PRESET_IDS];
  return (
    <FieldGroup title="motion">
      <p className="text-[11px] leading-4 text-[#667085]">
        Site-wide motion — 1 preset + just pick the intensity. The selected preset/strength will be applied to the site once published.
      </p>
      <div>
        <span className="mb-1 block text-[11px] text-[#5F6B7C]">robbery</span>
        <div className="flex gap-1">
          {(['off', 'subtle', 'normal'] as MotionIntensity[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => store().setMotionIntensity(v)}
              className={cn(
                'h-7 flex-1 rounded-md border text-[11px] transition-colors',
                intensity === v ? 'border-[#174DDA] bg-[#EDF4FF]/60 text-[#174DDA]' : 'border-[#CAD5E5] text-[#344054] hover:border-[#AEBACC]',
              )}
            >
              {INTENSITY_LABELS[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-1.5">
        {presetIds.map((pid) => {
          const locked = MOTION_PRESETS[pid].tier === 'premium' && tier === 'basic';
          return locked ? (
            <PresetLockCard key={pid} pid={pid} />
          ) : (
            <PresetCard key={pid} pid={pid} active={pid === current} onSelect={() => store().setMotionPreset(pid)} />
          );
        })}
      </div>
    </FieldGroup>
  );
}

/** [motion 3단계 재해석] 테마 편집 경고 — 대비/동일폰트. 편집=경고(저장 허용), 발행=차단(preflight). 단일 소스(contrastRatio·4.5). */
function ThemeWarnings({ theme }: { theme: SiteTheme }) {
  const warnings: string[] = [];
  const ratio = contrastRatio(theme.palette.text, theme.palette.background);
  if (ratio < 4.5) warnings.push(`Contrast with text${ratio.toFixed(2)}:1 — Below WCAG AA (4.5:1). Please adjust the background/body color as it will be blocked upon publication.`);
  if (theme.fonts.heading === theme.fonts.body) warnings.push("Use the same font for the title and body — pair the display font with the body font to create hierarchy.");
  if (!warnings.length) return null;
  return (
    <div className="px-4 pt-1">
      {warnings.map((w, i) => (
        <div key={i} className="mb-1.5 flex gap-1.5 rounded-md border border-amber-900/60 bg-amber-950/30 px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-[11px] leading-4 text-amber-200/90">{w}</p>
        </div>
      ))}
    </div>
  );
}

function ThemeInspector({ theme, title }: { theme: SiteTheme; title: string }) {
  const store = useEditorStore.getState;

  const setFont = (slot: 'heading' | 'body', family: string) => {
    const opt = FONT_OPTIONS.find((o) => o.family === family);
    if (!opt) return;
    const headingCss = slot === 'heading' ? opt.css : theme.fonts.heading;
    const bodyCss = slot === 'body' ? opt.css : theme.fonts.body;
    const googleFonts = computeGoogleFonts(headingCss, bodyCss);
    store().updateTheme({
      fonts: slot === 'heading' ? { heading: opt.css, googleFonts } : { body: opt.css, googleFonts },
      clearFontPairing: true,
    });
  };

  const fontValue = (css: string) => matchFontOption(css)?.family ?? '__custom__';
  const fontOptions = (css: string) => {
    const opts = FONT_OPTIONS.map((o) => ({ value: o.family, label: o.label }));
    if (!matchFontOption(css)) opts.unshift({ value: '__custom__', label: `today:${css.split(',')[0].replace(/['"]/g, '')}` });
    return opts;
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[#DCE4F0] px-4 py-3">
        <span className="text-xs font-semibold text-[#26354D]">site theme</span>
        <p className="mt-0.5 text-[11px] text-[#667085]">With no elements selected — site-wide styles</p>
      </div>

      <FieldGroup title="palette">
        {PALETTE_LABELS.map(({ key, label }) => (
          <ColorField
            key={key}
            label={label}
            value={theme.palette[key]}
            onCommit={(v) => {
              if (v !== undefined) store().updateTheme({ palette: { [key]: v } as Partial<SiteTheme['palette']> });
            }}
          />
        ))}
      </FieldGroup>

      <ThemeWarnings theme={theme} />

      <MotionPanel />

      <FieldGroup title="typography">
        <SelectField label="title font" value={fontValue(theme.fonts.heading)} options={fontOptions(theme.fonts.heading)} onCommit={(v) => setFont('heading', v)} />
        <SelectField label="body font" value={fontValue(theme.fonts.body)} options={fontOptions(theme.fonts.body)} onCommit={(v) => setFont('body', v)} />
        <div className="rounded-lg border border-[#DCE4F0] bg-white/90 px-3 py-3">
          <p className="truncate text-lg leading-6" style={{ fontFamily: theme.fonts.heading, color: theme.palette.text }}>
            Six dishes, one fire
          </p>
          <p className="mt-1 truncate text-xs" style={{ fontFamily: theme.fonts.body, color: theme.palette.muted }}>
            Preview of text — I light charcoal every morning.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="etc">
        <NumberField label="Default roundness (px)" value={theme.radius ?? 8} min={0} max={40} onCommit={(v) => store().updateTheme({ radius: v })} />
        <TextField label="Site title (browser tab)" value={title} allowEmpty={false} onCommit={(v) => store().updateMeta({ title: v })} />
      </FieldGroup>
    </div>
  );
}
