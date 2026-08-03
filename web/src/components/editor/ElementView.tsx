'use client';

/**
 * 캔버스 요소 1개 — 렌더 + 상호작용(드래그 이동 / 8핸들 리사이즈 / 더블클릭 인라인 편집).
 *
 * 성능 규약:
 *  - memo 컴포넌트. 드래그/리사이즈 중간값은 로컬 state(previewFrame)로만 그리고
 *    pointerup 시점에 스토어에 1회 커밋 → undo 히스토리는 제스처 단위.
 *  - 스냅 타깃은 제스처 시작 시 1회 수집 (스토어 구독 없음, getState 사용).
 *
 * 좌표계: 모든 frame 값은 디자인 px(1440 기준). 화면 배치는 px*scale.
 * 렌더 스타일은 site-renderer/ElementContent 와 동일한 규칙을 scale 배수로 미러링.
 */
import { memo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AtSign, BookOpen, Camera, Film, ImageIcon, Link2, MapPin, MessageCircle, Play } from 'lucide-react';
import type {
  ButtonElement,
  CanvasElement,
  DividerElement,
  FormElement,
  Frame,
  ImageElement,
  MapElement,
  ShapeElement,
  SiteTheme,
  SnsKind,
  SocialLinksElement,
  TextElement,
  VideoElement,
} from '@/lib/types/site';
import { safeMapEmbedUrl } from '@/lib/safe-url';
import { textFlowFor } from '@/lib/design/typography-scale';
import { useEditorStore, activeSections} from '@/stores/editor';
import {
  clampFrameToPage,
  clampFrameToSection,
  collectSnapTargets,
  resizeFrame,
  snapMoveFrame,
  type HandleDir,
  type SnapTargets,
} from './snap';

const DRAG_START_PX = 3;

interface GestureState {
  mode: 'move' | 'resize';
  handle?: HandleDir;
  startX: number;
  startY: number;
  frame0: Frame;
  targets: SnapTargets;
  moved: boolean;
  /** 연속 캔버스 기하 — 시작 섹션의 페이지 내 오프셋 / 전체 페이지 높이 */
  sectionTop: number;
  pageHeight: number;
}

const HANDLES: { dir: HandleDir; style: CSSProperties; cursor: string }[] = [
  { dir: 'nw', style: { left: -4, top: -4 }, cursor: 'nwse-resize' },
  { dir: 'n', style: { left: 'calc(50% - 4px)', top: -4 }, cursor: 'ns-resize' },
  { dir: 'ne', style: { right: -4, top: -4 }, cursor: 'nesw-resize' },
  { dir: 'e', style: { right: -4, top: 'calc(50% - 4px)' }, cursor: 'ew-resize' },
  { dir: 'se', style: { right: -4, bottom: -4 }, cursor: 'nwse-resize' },
  { dir: 's', style: { left: 'calc(50% - 4px)', bottom: -4 }, cursor: 'ns-resize' },
  { dir: 'sw', style: { left: -4, bottom: -4 }, cursor: 'nesw-resize' },
  { dir: 'w', style: { left: -4, top: 'calc(50% - 4px)' }, cursor: 'ew-resize' },
];

interface ElementViewProps {
  element: CanvasElement;
  sectionId: string;
  sectionHeight: number;
  theme: SiteTheme;
  scale: number;
  selected: boolean;
  editing: boolean;
}

export const ElementView = memo(function ElementView({
  element,
  sectionId,
  sectionHeight,
  theme,
  scale,
  selected,
  editing,
}: ElementViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const previewRef = useRef<Frame | null>(null);
  const [previewFrame, setPreviewFrame] = useState<Frame | null>(null);

  const frame = previewFrame ?? element.frame;
  const locked = element.locked === true;

  const setPreview = (f: Frame | null) => {
    previewRef.current = f;
    setPreviewFrame(f);
  };

  const collectTargets = (): SnapTargets => {
    const section = activeSections(useEditorStore.getState().config).find((s) => s.id === sectionId);
    return section ? collectSnapTargets(section, element.id) : { v: [], h: [] };
  };

  const beginGesture = (e: React.PointerEvent, mode: 'move' | 'resize', handle?: HandleDir) => {
    // 연속 캔버스 기하: 시작 섹션의 페이지 오프셋 + 전체 높이 (경계 통과 클램프/재소속 판정용)
    const sections = activeSections(useEditorStore.getState().config);
    let sectionTop = 0;
    let pageHeight = 0;
    for (const s of sections) {
      if (s.id === sectionId) sectionTop = pageHeight;
      pageHeight += s.height;
    }
    gestureRef.current = {
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      frame0: element.frame,
      targets: collectTargets(),
      moved: false,
      sectionTop,
      pageHeight,
    };
    rootRef.current?.setPointerCapture(e.pointerId);
  };

  const handleRootPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || editing) return;
    e.stopPropagation();
    const store = useEditorStore.getState();
    store.selectElement(sectionId, element.id);
    if (locked) return;
    beginGesture(e, 'move');
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_START_PX) return;
    g.moved = true;

    const dx = (e.clientX - g.startX) / scale;
    const dy = (e.clientY - g.startY) / scale;
    const store = useEditorStore.getState();

    if (g.mode === 'move') {
      const candidate: Frame = { ...g.frame0, x: g.frame0.x + dx, y: g.frame0.y + dy };
      const snapped = snapMoveFrame(candidate, g.targets);
      // 섹션이 아니라 페이지 범위로만 클램프 — 경계를 넘어 다른 섹션 위로 드래그 가능
      const clamped = clampFrameToPage({ ...candidate, x: snapped.x, y: snapped.y }, g.sectionTop, g.pageHeight);
      setPreview(clamped);
      store.setGuides({ sectionId, v: snapped.guidesV, h: snapped.guidesH });
    } else {
      const r = resizeFrame(g.frame0, g.handle!, dx, dy, {
        keepRatio: e.shiftKey,
        targets: g.targets,
        sectionHeight,
      });
      setPreview(r.frame);
      store.setGuides({ sectionId, v: r.guidesV, h: r.guidesH });
    }
  };

  const endGesture = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    gestureRef.current = null;
    try {
      rootRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // 이미 해제됨
    }
    const store = useEditorStore.getState();
    store.setGuides(null);
    if (g.moved && previewRef.current) {
      const f = previewRef.current;
      if (g.mode === 'move') {
        // 드롭 위치의 중심 y(페이지 좌표)가 속한 섹션으로 재소속 — 연속 캔버스의 핵심
        const sections = activeSections(store.config);
        const centerY = g.sectionTop + f.y + f.h / 2;
        let top = 0;
        let target = sections[sections.length - 1];
        let targetTop = g.pageHeight - (target?.height ?? 0);
        for (const s of sections) {
          if (centerY < top + s.height) {
            target = s;
            targetTop = top;
            break;
          }
          top += s.height;
        }
        if (target && target.id !== sectionId) {
          const local = clampFrameToSection({ ...f, y: g.sectionTop + f.y - targetTop }, target.height);
          store.moveElementToSection(element.id, target.id, local);
        } else {
          // 같은 섹션 내 드롭 — 발행 렌더가 섹션 단위로 클립하므로 안쪽으로 정착
          store.updateElementFrame(element.id, clampFrameToSection(f, sectionHeight));
        }
      } else {
        store.updateElementFrame(element.id, f);
      }
    }
    setPreview(null);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (element.kind !== 'text' || locked) return;
    e.stopPropagation();
    useEditorStore.getState().setEditingElement(element.id);
  };

  const gestureActive = previewFrame !== null;

  const rootStyle: CSSProperties = {
    position: 'absolute',
    left: frame.x * scale,
    top: frame.y * scale,
    width: frame.w * scale,
    height: frame.h * scale,
    // 제스처 중엔 최상위 — 연속 캔버스에서 섹션 경계를 넘을 때 다음 섹션에 가려지지 않게
    zIndex: gestureActive ? 9999 : element.z,
    opacity: element.opacity,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    cursor: locked ? 'default' : 'move',
    touchAction: 'none',
    userSelect: 'none',
  };

  return (
    <div
      ref={rootRef}
      className="group"
      style={rootStyle}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={handleDoubleClick}
    >
      {/* 콘텐츠 (포인터 이벤트는 루트가 소유) */}
      {!(element.kind === 'text' && editing) && (
        <div style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
          <ElementBody element={element} theme={theme} scale={scale} />
        </div>
      )}

      {/* 인라인 텍스트 편집 */}
      {element.kind === 'text' && editing ? (
        <InlineTextEditor element={element} theme={theme} scale={scale} />
      ) : null}

      {/* 호버 링 */}
      {!selected && !locked ? (
        <div className="pointer-events-none absolute -inset-px hidden border border-sky-500/40 group-hover:block" />
      ) : null}

      {/* 선택 링 */}
      {selected ? (
        <div
          className="pointer-events-none absolute -inset-px"
          style={{
            border: locked ? '1px dashed #f59e0b' : '1px solid #38bdf8',
          }}
        />
      ) : null}

      {/* 리사이즈 핸들 */}
      {selected && !locked && !editing
        ? HANDLES.map((h) => (
            <div
              key={h.dir}
              className="absolute h-2 w-2 rounded-[2px] border border-sky-500 bg-white"
              style={{ ...h.style, cursor: h.cursor, zIndex: 10 }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                beginGesture(e, 'resize', h.dir);
              }}
            />
          ))
        : null}

      {/* 제스처 중 좌표/크기 배지 */}
      {gestureActive ? (
        <div className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 rounded bg-white/95 px-1.5 py-0.5 text-[10px] whitespace-nowrap tabular-nums text-[#26354D] shadow">
          {Math.round(frame.x)}, {Math.round(frame.y)} · {Math.round(frame.w)}×{Math.round(frame.h)}
        </div>
      ) : null}
    </div>
  );
});

// ---------- 인라인 텍스트 편집 ----------

function InlineTextEditor({
  element,
  theme,
  scale,
}: {
  element: TextElement;
  theme: SiteTheme;
  scale: number;
}) {
  const s = element.style;
  const commit = (value: string) => {
    const store = useEditorStore.getState();
    if (value !== element.text) store.updateElement(element.id, { text: value });
    store.setEditingElement(null);
  };

  return (
    <textarea
      autoFocus
      defaultValue={element.text}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.blur(); // blur → 커밋
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 0,
        border: 'none',
        outline: '1.5px dashed #38bdf8',
        outlineOffset: 2,
        background: 'transparent',
        resize: 'none',
        overflow: 'hidden',
        fontSize: s.fontSize * scale,
        fontWeight: s.fontWeight ?? 400,
        fontFamily: s.fontFamily === 'heading' ? theme.fonts.heading : theme.fonts.body,
        fontStyle: s.italic ? 'italic' : undefined,
        color: s.color ?? theme.palette.text,
        textAlign: s.align ?? 'left',
        lineHeight: s.lineHeight ?? 1.45,
        letterSpacing: s.letterSpacing != null ? s.letterSpacing * scale : undefined,
        caretColor: s.color ?? theme.palette.text,
        whiteSpace: 'pre-wrap',
        ...textFlowFor(s.fontFamily),
      }}
    />
  );
}

// ---------- 요소 콘텐츠 렌더 (renderer의 ElementContent를 scale 배수로 미러링) ----------

function ElementBody({
  element,
  theme,
  scale,
}: {
  element: CanvasElement;
  theme: SiteTheme;
  scale: number;
}) {
  switch (element.kind) {
    case 'text':
      return <TextBody el={element} theme={theme} scale={scale} />;
    case 'image':
      return <ImageBody el={element} theme={theme} scale={scale} />;
    case 'button':
      return <ButtonBody el={element} theme={theme} scale={scale} />;
    case 'shape':
      return <ShapeBody el={element} theme={theme} scale={scale} />;
    case 'divider':
      return <DividerBody el={element} theme={theme} scale={scale} />;
    case 'video':
      return <VideoBody el={element} scale={scale} />;
    case 'form':
      return <FormBody el={element} theme={theme} scale={scale} />;
    case 'map':
      return <MapBody el={element} theme={theme} scale={scale} />;
    case 'socialLinks':
      return <SocialLinksBody el={element} theme={theme} scale={scale} />;
    default:
      return null;
  }
}

// ---------- [v3 Phase 3] 부가기능 3종 — 에디터 프리뷰(비대화형 lookalike) ----------

const FORM_FIELD_LABELS: Record<FormElement['fields'][number], string> = {
  name: "name",
  phone: "contact",
  email: "email",
  message: "Inquiry details",
};

function FormBody({ el, theme, scale }: { el: FormElement; theme: SiteTheme; scale: number }) {
  const s = el.style;
  const radius = (s.borderRadius ?? theme.radius ?? 8) * scale;
  const accent = s.color ?? theme.palette.primary;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 10 * scale,
        padding: s.variant === 'card' ? 20 * scale : 0,
        backgroundColor: s.variant === 'card' ? theme.palette.surface : 'transparent',
        borderRadius: s.variant === 'card' ? radius : undefined,
        fontFamily: theme.fonts.body,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {el.fields.map((f) => (
        <div
          key={f}
          style={{
            padding: `${10 * scale}px ${13 * scale}px`,
            fontSize: 14 * scale,
            color: theme.palette.muted,
            backgroundColor: theme.palette.background,
            border: `1px solid ${theme.palette.muted}55`,
            borderRadius: Math.min(radius, 12 * scale),
            flex: f === 'message' ? 1 : undefined,
            minHeight: f === 'message' ? 48 * scale : undefined,
          }}
        >
          {FORM_FIELD_LABELS[f]}
        </div>
      ))}
      <div
        style={{
          padding: `${11 * scale}px ${16 * scale}px`,
          textAlign: 'center',
          fontSize: 14 * scale,
          fontWeight: 600,
          color: theme.palette.background,
          backgroundColor: accent,
          borderRadius: Math.min(radius, 12 * scale),
        }}
      >
        {el.submitLabel || "Send inquiry"}
      </div>
    </div>
  );
}

function MapBody({ el, theme, scale }: { el: MapElement; theme: SiteTheme; scale: number }) {
  const radius = (el.style.borderRadius ?? theme.radius ?? 8) * scale;
  const valid = Boolean(safeMapEmbedUrl(el.embedUrl));
  let host = '';
  try {
    host = el.embedUrl ? new URL(el.embedUrl).hostname : '';
  } catch {
    host = '';
  }
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5"
      style={{
        backgroundColor: theme.palette.surface,
        color: theme.palette.muted,
        border: `1px dashed ${theme.palette.muted}66`,
        borderRadius: radius,
        fontFamily: theme.fonts.body,
      }}
    >
      <MapPin style={{ width: 20 * scale, height: 20 * scale }} />
      <span style={{ fontSize: 12 * scale }}>
        {valid ? `map -${host}(Indicated at time of publication)` : el.embedUrl ? "Map URL not allowed" : "Please enter the map URL"}
      </span>
    </div>
  );
}

const SNS_ICONS: Record<SnsKind, typeof Camera> = {
  instagram: Camera,
  kakao_channel: MessageCircle,
  naver_blog: BookOpen,
  youtube: Play,
  x: AtSign,
  custom: Link2,
};

function SocialLinksBody({ el, theme, scale }: { el: SocialLinksElement; theme: SiteTheme; scale: number }) {
  const size = (el.style.size ?? 40) * scale;
  const color = el.style.color ?? theme.palette.text;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: el.style.direction === 'column' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12 * scale,
      }}
    >
      {el.links.map((link, i) => {
        const Icon = SNS_ICONS[link.kind] ?? Link2;
        return (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              color,
              border: `1px solid ${color}44`,
              borderRadius: '50%',
              opacity: link.url ? 1 : 0.4,
            }}
          >
            <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
          </span>
        );
      })}
    </div>
  );
}

function TextBody({ el, theme, scale }: { el: TextElement; theme: SiteTheme; scale: number }) {
  const s = el.style;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        fontSize: s.fontSize * scale,
        fontWeight: s.fontWeight ?? 400,
        fontFamily: s.fontFamily === 'heading' ? theme.fonts.heading : theme.fonts.body,
        fontStyle: s.italic ? 'italic' : undefined,
        color: s.color ?? theme.palette.text,
        textAlign: s.align ?? 'left',
        lineHeight: s.lineHeight ?? 1.45,
        letterSpacing: s.letterSpacing != null ? s.letterSpacing * scale : undefined,
        whiteSpace: 'pre-wrap',
        ...textFlowFor(s.fontFamily),
      }}
    >
      {el.text}
    </div>
  );
}

function EmptySourcePlaceholder({
  icon,
  label,
  radius,
}: {
  icon: React.ReactNode;
  label: string;
  radius: number;
}) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1.5 border border-dashed border-[#AEBACC]/60 bg-[#E8EDF5]/80 text-[#5F6B7C]"
      style={{ borderRadius: radius }}
    >
      {icon}
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

function ImageBody({ el, theme, scale }: { el: ImageElement; theme: SiteTheme; scale: number }) {
  const s = el.style;
  const radius = (s.borderRadius ?? 0) * scale;
  if (!el.src) {
    return <EmptySourcePlaceholder icon={<ImageIcon className="h-5 w-5" />} label="Please enter image URL" radius={radius} />;
  }
  return (
    // 고객 콘텐츠 이미지는 next/image 대신 plain <img> (규약)
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={el.src}
      alt={el.alt ?? ''}
      draggable={false}
      decoding="async"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: s.objectFit ?? 'cover',
        borderRadius: radius || undefined,
        boxShadow: s.shadow ? '0 24px 48px -16px rgba(0, 0, 0, 0.4)' : undefined,
        backgroundColor: theme.palette.surface,
      }}
    />
  );
}

function ButtonBody({ el, theme, scale }: { el: ButtonElement; theme: SiteTheme; scale: number }) {
  const s = el.style;
  const color = s.color ?? theme.palette.primary;
  const radius = (s.borderRadius ?? theme.radius ?? 8) * scale;
  const fontSize = (s.fontSize ?? 16) * scale;

  const variants: Record<ButtonElement['style']['variant'], CSSProperties> = {
    solid: { backgroundColor: color, color: s.textColor ?? theme.palette.background, border: 'none' },
    outline: {
      backgroundColor: 'transparent',
      color: s.textColor ?? color,
      border: `1.5px solid ${color}`,
    },
    ghost: { backgroundColor: 'transparent', color: s.textColor ?? color, border: 'none' },
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: theme.fonts.body,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        fontSize,
        borderRadius: radius,
        ...variants[s.variant],
      }}
    >
      {el.label}
    </div>
  );
}

function ShapeBody({ el, theme, scale }: { el: ShapeElement; theme: SiteTheme; scale: number }) {
  const s = el.style;

  if (el.shape === 'line') {
    const thickness = Math.max(1, (s.borderWidth ?? 2) * scale);
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: '100%',
            height: thickness,
            backgroundColor: s.borderColor ?? s.fill ?? theme.palette.muted,
          }}
        />
      </div>
    );
  }

  const radius =
    el.shape === 'ellipse' ? '50%' : (s.borderRadius != null ? s.borderRadius : (theme.radius ?? 0)) * scale;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: s.fill ?? theme.palette.surface,
        border: s.borderWidth
          ? `${Math.max(1, s.borderWidth * scale)}px solid ${s.borderColor ?? theme.palette.muted}`
          : undefined,
        borderRadius: radius,
      }}
    />
  );
}

function DividerBody({ el, theme, scale }: { el: DividerElement; theme: SiteTheme; scale: number }) {
  const thickness = Math.max(1, (el.style.thickness ?? 1) * scale);
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}>
      <div style={{ width: '100%', height: thickness, backgroundColor: el.style.color ?? theme.palette.muted }} />
    </div>
  );
}

function VideoBody({ el, scale }: { el: VideoElement; scale: number }) {
  const s = el.style;
  const radius = (s.borderRadius ?? 0) * scale;
  if (!el.src) {
    return <EmptySourcePlaceholder icon={<Film className="h-5 w-5" />} label="Enter the video URL" radius={radius} />;
  }
  return (
    <video
      src={el.src}
      poster={el.poster}
      muted
      playsInline
      autoPlay={s.autoplay ?? false}
      loop={s.loop ?? true}
      preload="metadata"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: s.objectFit ?? 'cover',
        borderRadius: radius || undefined,
        backgroundColor: '#000',
      }}
    />
  );
}
