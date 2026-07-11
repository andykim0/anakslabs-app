'use client';

/**
 * 우측 인스펙터.
 *  - 요소 선택: 종류별 속성 + 공통(위치/크기/회전/불투명도/z/잠금/모바일 숨김)
 *  - 섹션 선택: 이름/유형/높이/배경(색·그라디언트·이미지+오버레이)/숨김
 *  - 미선택: 테마(팔레트 6색 / 폰트 큐레이션 셀렉트 / radius / 사이트 제목)
 */
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  ChevronUp,
  Copy,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  ButtonElement,
  CanvasElement,
  DividerElement,
  EntranceEffect,
  FormElement,
  ImageElement,
  MapElement,
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
import { findElementLocation, useEditorStore, activeSections} from '@/stores/editor';
import { cn } from '@/components/dashboard/ui';
import { clampFrameToSection, MIN_H, MIN_W } from './snap';
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

export function Inspector() {
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
  return (
    <button
      type="button"
      onClick={() => useEditorStore.getState().setAiIntent(type)}
      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-[#4a3a22] bg-[#2a2117] text-xs font-medium text-[#d9b878] transition-colors hover:border-[#6a5432]"
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label} ({CREDIT_COSTS[type]}크레딧)
    </button>
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
        'flex h-7 flex-1 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition-colors disabled:opacity-30',
        danger
          ? 'hover:border-red-900 hover:bg-red-950/50 hover:text-red-300'
          : 'hover:border-neutral-500 hover:bg-neutral-800 hover:text-neutral-50',
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
  // [gating] 등장 애니메이션은 Premium 전용 — Basic이면 FieldGroup을 잠금 카드로 대체
  const isPremium = useEditorStore((s) => s.tier) === 'premium';

  const commitFrame = (patch: Partial<CanvasElement['frame']>) => {
    const next = { ...element.frame, ...patch };
    next.w = Math.max(MIN_W, next.w);
    next.h = Math.max(MIN_H, next.h);
    store().updateElementFrame(element.id, clampFrameToSection(next, section.height));
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-xs font-semibold text-neutral-200">
          {ELEMENT_KIND_LABELS[element.kind]} 요소
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            title="복제 (⌘D)"
            onClick={() => store().duplicateElement(element.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="삭제 (Delete)"
            onClick={() => store().deleteElement(element.id)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-red-950/60 hover:text-red-300"
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
      <FieldGroup title="위치 · 크기">
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={Math.round(element.frame.x)} onCommit={(v) => commitFrame({ x: v })} />
          <NumberField label="Y" value={Math.round(element.frame.y)} onCommit={(v) => commitFrame({ y: v })} />
          <NumberField label="너비" value={Math.round(element.frame.w)} min={MIN_W} onCommit={(v) => commitFrame({ w: v })} />
          <NumberField label="높이" value={Math.round(element.frame.h)} min={MIN_H} onCommit={(v) => commitFrame({ h: v })} />
        </div>
        <NumberField
          label="회전 (°)"
          value={element.rotation ?? 0}
          min={-180}
          max={180}
          onCommit={(v) => store().updateElement(element.id, { rotation: v === 0 ? undefined : v })}
        />
        <RangeField
          label="불투명도"
          value={Math.round((element.opacity ?? 1) * 100)}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          onCommit={(v) => store().updateElement(element.id, { opacity: v >= 100 ? undefined : v / 100 })}
        />
      </FieldGroup>

      <FieldGroup title="쌓임 순서">
        <div className="flex gap-1.5">
          <SmallIconButton title="맨 앞으로" onClick={() => store().reorderElement(element.id, 'front')}>
            <ChevronsUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="앞으로" onClick={() => store().reorderElement(element.id, 'forward')}>
            <ChevronUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="뒤로" onClick={() => store().reorderElement(element.id, 'backward')}>
            <ChevronDown className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="맨 뒤로" onClick={() => store().reorderElement(element.id, 'back')}>
            <ChevronsDown className="h-3.5 w-3.5" />
          </SmallIconButton>
        </div>
      </FieldGroup>

      {isPremium ? (
        <FieldGroup title="등장 애니메이션">
          <SelectField<'auto' | EntranceEffect>
            label="효과 (미리보기 모드에서 재생 확인)"
            value={element.entrance?.effect ?? 'auto'}
            options={[
              { value: 'auto', label: '자동 (기본 연출 — 아래→위 순차)' },
              { value: 'none', label: '없음' },
              { value: 'fade', label: '페이드' },
              { value: 'fade-up', label: '아래→위' },
              { value: 'fade-down', label: '위→아래' },
              { value: 'slide-left', label: '왼쪽에서' },
              { value: 'slide-right', label: '오른쪽에서' },
              { value: 'zoom-in', label: '확대 등장' },
            ]}
            onCommit={(v) =>
              store().updateElement(element.id, {
                entrance: v === 'auto' ? undefined : { ...element.entrance, effect: v },
              })
            }
          />
          {element.entrance && element.entrance.effect !== 'none' ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="시간 (ms)"
                value={element.entrance.duration ?? 700}
                min={0}
                max={5000}
                onCommit={(v) => store().updateElement(element.id, { entrance: { ...element.entrance!, duration: v } })}
              />
              <NumberField
                label="지연 (ms)"
                value={element.entrance.delay ?? 0}
                min={0}
                max={5000}
                onCommit={(v) => store().updateElement(element.id, { entrance: { ...element.entrance!, delay: v } })}
              />
            </div>
          ) : null}
        </FieldGroup>
      ) : (
        <EntranceLockCard />
      )}

      <FieldGroup title="표시">
        <ToggleField
          label="잠금 (이동/편집 방지)"
          value={element.locked ?? false}
          onCommit={(v) => store().updateElement(element.id, { locked: v || undefined })}
        />
        <ToggleField
          label="모바일에서 숨김"
          value={element.hiddenOnMobile ?? false}
          onCommit={(v) => store().updateElement(element.id, { hiddenOnMobile: v || undefined })}
        />
      </FieldGroup>
    </div>
  );
}

/** [gating] Basic 요금제 — 등장 애니메이션 FieldGroup 대신 노출하는 업셀 잠금 카드 */
function EntranceLockCard() {
  return (
    <div className="border-t border-neutral-800 px-4 py-3">
      <div className="rounded-lg border border-[#4a3a22] bg-[#2a2117]/50 p-3.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 text-[#d9b878]" />
          <span className="text-xs font-semibold text-[#d9b878]">등장 애니메이션</span>
        </div>
        <p className="text-[11px] leading-5 text-neutral-400">
          등장 애니메이션은 Premium 전용입니다. 업그레이드하면 스크롤 시 요소가 부드럽게 나타나는 연출을 사용할 수 있어요.
        </p>
        <a
          href="/dashboard/billing"
          className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#c8a96a] px-3 text-[11px] font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
        >
          <Sparkles className="h-3 w-3" /> Premium으로 업그레이드
        </a>
      </div>
    </div>
  );
}

// ----- 텍스트 -----

function TextFields({ el }: { el: TextElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <>
      <FieldGroup title="텍스트">
        <TextAreaField label="내용" value={el.text} onCommit={(v) => store().updateElement(el.id, { text: v })} />
        <AiGenerateButton type="text" label="AI로 다시 쓰기" />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="크기" value={s.fontSize} min={8} max={220} onCommit={(v) => store().updateElementStyle(el.id, { fontSize: v })} />
          <SelectField
            label="굵기"
            value={String(s.fontWeight ?? 400)}
            options={['300', '400', '500', '600', '700', '800', '900'].map((w) => ({ value: w, label: w }))}
            onCommit={(v) => store().updateElementStyle(el.id, { fontWeight: Number(v) })}
          />
        </div>
        <SegmentedField
          label="폰트"
          value={s.fontFamily ?? 'body'}
          options={[
            { value: 'heading' as const, label: '제목용' },
            { value: 'body' as const, label: '본문용' },
          ]}
          onCommit={(v) => store().updateElementStyle(el.id, { fontFamily: v })}
        />
        <ColorField label="색상" value={s.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
        <SegmentedField
          label="정렬"
          value={s.align ?? 'left'}
          options={[
            { value: 'left' as const, label: <AlignLeft className="h-3.5 w-3.5" />, title: '왼쪽' },
            { value: 'center' as const, label: <AlignCenter className="h-3.5 w-3.5" />, title: '가운데' },
            { value: 'right' as const, label: <AlignRight className="h-3.5 w-3.5" />, title: '오른쪽' },
          ]}
          onCommit={(v) => store().updateElementStyle(el.id, { align: v })}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="행간" value={s.lineHeight ?? 1.45} min={0.8} max={3} step={0.05} onCommit={(v) => store().updateElementStyle(el.id, { lineHeight: v })} />
          <NumberField label="자간 (px)" value={s.letterSpacing ?? 0} min={-10} max={40} step={0.5} onCommit={(v) => store().updateElementStyle(el.id, { letterSpacing: v })} />
        </div>
        <ToggleField label="기울임 (이탤릭)" value={s.italic ?? false} onCommit={(v) => store().updateElementStyle(el.id, { italic: v || undefined })} />
      </FieldGroup>
    </>
  );
}

// ----- 이미지 -----

function ImageFields({ el }: { el: ImageElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="이미지">
      <TextField
        label="이미지 URL"
        value={el.src}
        allowEmpty={false}
        placeholder="https://…"
        hint="URL을 붙여넣거나 아래 AI 생성을 이용하세요."
        onCommit={(v) => store().updateElement(el.id, { src: v })}
      />
      <AiGenerateButton type="image" label="AI로 이미지 생성" />
      <TextField label="대체 텍스트 (alt)" value={el.alt ?? ''} onCommit={(v) => store().updateElement(el.id, { alt: v || undefined })} />
      <SegmentedField
        label="채우기 방식"
        value={s.objectFit ?? 'cover'}
        options={[
          { value: 'cover' as const, label: '꽉 채움' },
          { value: 'contain' as const, label: '전체 보임' },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { objectFit: v })}
      />
      <NumberField label="모서리 둥글기" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <ToggleField label="그림자" value={s.shadow ?? false} onCommit={(v) => store().updateElementStyle(el.id, { shadow: v || undefined })} />
    </FieldGroup>
  );
}

// ----- 버튼 -----

function ButtonFields({ el, theme }: { el: ButtonElement; theme: SiteTheme }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="버튼">
      <TextField label="라벨" value={el.label} onCommit={(v) => store().updateElement(el.id, { label: v })} />
      <TextField label="링크 (href)" value={el.href} placeholder="#, /menu, https://…" onCommit={(v) => store().updateElement(el.id, { href: v })} />
      <SegmentedField
        label="스타일"
        value={s.variant}
        options={[
          { value: 'solid' as const, label: '채움' },
          { value: 'outline' as const, label: '외곽선' },
          { value: 'ghost' as const, label: '텍스트' },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { variant: v })}
      />
      <ColorField label="버튼 색" value={s.color} clearable clearLabel="테마 포인트색" onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <ColorField label="글자 색" value={s.textColor} clearable onCommit={(v) => store().updateElementStyle(el.id, { textColor: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="글자 크기" value={s.fontSize ?? 16} min={10} max={40} onCommit={(v) => store().updateElementStyle(el.id, { fontSize: v })} />
        <NumberField label="둥글기" value={s.borderRadius ?? theme.radius ?? 8} min={0} max={60} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      </div>
    </FieldGroup>
  );
}

// ----- 도형 -----

function ShapeFields({ el }: { el: ShapeElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="도형">
      <SegmentedField
        label="모양"
        value={el.shape}
        options={[
          { value: 'rect' as const, label: '사각형' },
          { value: 'ellipse' as const, label: '원형' },
          { value: 'line' as const, label: '선' },
        ]}
        onCommit={(v) => store().updateElement(el.id, { shape: v })}
      />
      <ColorField label="채우기 색" value={s.fill} clearable onCommit={(v) => store().updateElementStyle(el.id, { fill: v })} />
      <ColorField label="테두리 색" value={s.borderColor} clearable onCommit={(v) => store().updateElementStyle(el.id, { borderColor: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="테두리 두께" value={s.borderWidth ?? 0} min={0} max={24} onCommit={(v) => store().updateElementStyle(el.id, { borderWidth: v || undefined })} />
        <NumberField label="둥글기" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      </div>
    </FieldGroup>
  );
}

// ----- 구분선 -----

function DividerFields({ el }: { el: DividerElement }) {
  const store = useEditorStore.getState;
  return (
    <FieldGroup title="구분선">
      <ColorField label="색상" value={el.style.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <NumberField label="두께" value={el.style.thickness ?? 1} min={1} max={24} onCommit={(v) => store().updateElementStyle(el.id, { thickness: v })} />
    </FieldGroup>
  );
}

// ----- 영상 -----

function VideoFields({ el }: { el: VideoElement }) {
  const store = useEditorStore.getState;
  const s = el.style;
  return (
    <FieldGroup title="영상">
      <TextField
        label="영상 URL"
        value={el.src}
        allowEmpty={false}
        placeholder="https://….mp4"
        onCommit={(v) => store().updateElement(el.id, { src: v })}
      />
      <AiGenerateButton type="video" label="AI로 영상 생성" />
      <TextField
        label="포스터 이미지 URL"
        value={el.poster ?? ''}
        placeholder="재생 전 표시할 이미지"
        onCommit={(v) => store().updateElement(el.id, { poster: v.trim() ? v : undefined })}
      />
      <SegmentedField
        label="채우기 방식"
        value={s.objectFit ?? 'cover'}
        options={[
          { value: 'cover' as const, label: '꽉 채움' },
          { value: 'contain' as const, label: '전체 보임' },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { objectFit: v })}
      />
      <NumberField label="모서리 둥글기" value={s.borderRadius ?? 0} min={0} max={300} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <ToggleField label="자동 재생" value={s.autoplay ?? false} onCommit={(v) => store().updateElementStyle(el.id, { autoplay: v })} />
      <ToggleField label="반복 재생" value={s.loop ?? true} onCommit={(v) => store().updateElementStyle(el.id, { loop: v })} />
      <ToggleField label="음소거" value={s.muted ?? true} onCommit={(v) => store().updateElementStyle(el.id, { muted: v })} />
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] 문의 폼 -----

const FORM_FIELD_OPTIONS: { value: FormElement['fields'][number]; label: string }[] = [
  { value: 'name', label: '이름' },
  { value: 'phone', label: '연락처' },
  { value: 'email', label: '이메일' },
  { value: 'message', label: '문의 내용' },
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
    <FieldGroup title="문의 폼">
      <div className="space-y-1.5">
        <span className="block text-[11px] text-neutral-500">받을 필드 (최소 1개)</span>
        {FORM_FIELD_OPTIONS.map((o) => (
          <ToggleField
            key={o.value}
            label={o.label}
            value={el.fields.includes(o.value)}
            onCommit={() => toggleField(o.value)}
          />
        ))}
      </div>
      <TextField label="버튼 라벨" value={el.submitLabel} onCommit={(v) => store().updateElement(el.id, { submitLabel: v || '문의 보내기' })} />
      <SegmentedField
        label="스타일"
        value={s.variant}
        options={[
          { value: 'card' as const, label: '카드' },
          { value: 'plain' as const, label: '투명' },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { variant: v })}
      />
      <ColorField label="버튼 색" value={s.color} clearable clearLabel="테마 포인트색" onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
      <NumberField label="둥글기" value={s.borderRadius ?? 8} min={0} max={40} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
      <p className="text-[11px] leading-4 text-neutral-600">
        제출된 문의는 대시보드 사이트 상세의 문의함에 쌓입니다.
      </p>
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] 지도 -----

function MapFields({ el }: { el: MapElement }) {
  const store = useEditorStore.getState;
  const invalid = el.embedUrl !== '' && !isSafeMapEmbedUrl(el.embedUrl);
  return (
    <FieldGroup title="지도">
      <TextField
        label="지도 embed URL"
        value={el.embedUrl}
        placeholder="https://map.naver.com/… 또는 구글 /maps/embed"
        hint="네이버/카카오 지도 공유 → 링크 복사, 구글 지도 공유 → 지도 퍼가기 URL"
        onCommit={(v) => store().updateElement(el.id, { embedUrl: v.trim() })}
      />
      {invalid ? (
        <p className="rounded-md border border-red-900 bg-red-950/40 px-2.5 py-2 text-[11px] leading-4 text-red-300">
          허용되지 않은 주소예요. map.naver.com · map.kakao.com · www.google.com/maps/embed 만 사용할 수
          있습니다. (저장 시에도 거부됩니다)
        </p>
      ) : null}
      <NumberField label="둥글기" value={el.style.borderRadius ?? 8} min={0} max={40} onCommit={(v) => store().updateElementStyle(el.id, { borderRadius: v })} />
    </FieldGroup>
  );
}

// ----- [v3 Phase 3] SNS 링크 -----

const SNS_KIND_OPTIONS: { value: SnsKind; label: string }[] = [
  { value: 'instagram', label: '인스타그램' },
  { value: 'kakao_channel', label: '카카오 채널' },
  { value: 'naver_blog', label: '네이버 블로그' },
  { value: 'youtube', label: '유튜브' },
  { value: 'x', label: 'X (트위터)' },
  { value: 'custom', label: '기타 링크' },
];

function SocialLinksFields({ el }: { el: SocialLinksElement }) {
  const store = useEditorStore.getState;
  const commitLinks = (links: SocialLinksElement['links']) => {
    if (links.length === 0) return; // zod min(1)
    store().updateElement(el.id, { links });
  };
  return (
    <FieldGroup title="SNS 링크">
      {el.links.map((link, i) => {
        const badUrl = link.url !== '' && !isHttpsUrl(link.url);
        return (
          <div key={i} className="space-y-1.5 rounded-lg border border-neutral-800 p-2">
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <SelectField
                  label={`링크 ${i + 1}`}
                  value={link.kind}
                  options={SNS_KIND_OPTIONS}
                  onCommit={(v) => commitLinks(el.links.map((l, j) => (j === i ? { ...l, kind: v as SnsKind } : l)))}
                />
              </div>
              <button
                type="button"
                title="링크 삭제"
                disabled={el.links.length <= 1}
                onClick={() => commitLinks(el.links.filter((_, j) => j !== i))}
                className="mt-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition-colors hover:border-red-900 hover:bg-red-950/50 hover:text-red-300 disabled:opacity-30"
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
            {badUrl ? <p className="text-[11px] text-red-300">https:// 주소만 사용할 수 있어요.</p> : null}
          </div>
        );
      })}
      <button
        type="button"
        disabled={el.links.length >= 8}
        onClick={() => commitLinks([...el.links, { kind: 'custom', url: '' }])}
        className="h-8 w-full rounded-md border border-dashed border-neutral-700 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-40"
      >
        + 링크 추가
      </button>
      <SegmentedField
        label="배치"
        value={el.style.direction}
        options={[
          { value: 'row' as const, label: '가로' },
          { value: 'column' as const, label: '세로' },
        ]}
        onCommit={(v) => store().updateElementStyle(el.id, { direction: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="아이콘 크기" value={el.style.size ?? 40} min={24} max={96} onCommit={(v) => store().updateElementStyle(el.id, { size: v })} />
      </div>
      <ColorField label="아이콘 색" value={el.style.color} clearable onCommit={(v) => store().updateElementStyle(el.id, { color: v })} />
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
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-xs font-semibold text-neutral-200">섹션 설정</span>
        <div className="flex gap-1">
          <SmallIconButton title="위로 이동" disabled={idx <= 0} onClick={() => store().moveSection(section.id, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="아래로 이동" disabled={idx >= sections.length - 1} onClick={() => store().moveSection(section.id, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="복제" onClick={() => store().duplicateSection(section.id)}>
            <Copy className="h-3.5 w-3.5" />
          </SmallIconButton>
          <SmallIconButton title="삭제" danger onClick={() => store().deleteSection(section.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </SmallIconButton>
        </div>
      </div>

      <FieldGroup title="기본">
        <TextField label="이름" value={section.name} onCommit={(v) => store().updateSection(section.id, { name: v })} />
        <SelectField
          label="유형"
          value={section.type}
          options={(Object.keys(SECTION_TYPE_LABELS) as Section['type'][]).map((t) => ({
            value: t,
            label: SECTION_TYPE_LABELS[t],
          }))}
          onCommit={(v) => store().updateSection(section.id, { type: v })}
        />
        <NumberField label="높이 (px)" value={section.height} min={160} max={4000} step={10} onCommit={(v) => store().updateSection(section.id, { height: v })} />
        <ToggleField label="숨김 (발행 시 제외)" value={section.hidden ?? false} onCommit={(v) => store().updateSection(section.id, { hidden: v || undefined })} />
      </FieldGroup>

      <FieldGroup title="배경">
        <SegmentedField
          label="배경 유형"
          value={mode}
          options={[
            { value: 'color' as const, label: '단색' },
            { value: 'gradient' as const, label: '그라디언트' },
            { value: 'image' as const, label: '이미지' },
          ]}
          onCommit={switchMode}
        />

        {mode === 'color' ? (
          <ColorField
            label="배경색"
            value={bg.color}
            clearable
            clearLabel="테마 배경색"
            onCommit={(v) => store().updateSectionBackground(section.id, v === undefined ? {} : { color: v })}
          />
        ) : null}

        {mode === 'gradient' ? (
          <>
            <TextField
              label="CSS 그라디언트"
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
              className="h-7 w-full rounded-md border border-neutral-700 text-[11px] text-neutral-300 transition-colors hover:border-neutral-500"
            >
              팔레트 색으로 그라디언트 만들기
            </button>
          </>
        ) : null}

        {mode === 'image' && bg.image ? (
          <>
            <TextField
              label="배경 이미지 URL"
              value={bg.image.src}
              allowEmpty={false}
              placeholder="https://…"
              onCommit={(v) => store().updateSectionBackground(section.id, { image: { ...bg.image!, src: v } })}
            />
            <ColorField
              label="오버레이 색"
              value={bg.image.overlayColor}
              clearable
              clearLabel="오버레이 없음"
              onCommit={(v) =>
                store().updateSectionBackground(section.id, {
                  image: { src: bg.image!.src, overlayOpacity: bg.image!.overlayOpacity, overlayColor: v },
                })
              }
            />
            <RangeField
              label="오버레이 진하기"
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

      <div className="px-4 py-3 text-[11px] leading-5 text-neutral-600">
        요소를 선택하면 상세 속성을, 빈 곳을 클릭하면 사이트 테마를 편집할 수 있습니다.
      </div>
    </div>
  );
}

// ---------- 테마 인스펙터 ----------

const PALETTE_LABELS: { key: keyof SiteTheme['palette']; label: string }[] = [
  { key: 'background', label: '배경' },
  { key: 'surface', label: '표면 (카드)' },
  { key: 'text', label: '본문 텍스트' },
  { key: 'muted', label: '보조 텍스트' },
  { key: 'primary', label: '포인트' },
  { key: 'accent', label: '강조' },
];

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
    });
  };

  const fontValue = (css: string) => matchFontOption(css)?.family ?? '__custom__';
  const fontOptions = (css: string) => {
    const opts = FONT_OPTIONS.map((o) => ({ value: o.family, label: o.label }));
    if (!matchFontOption(css)) opts.unshift({ value: '__custom__', label: `현재: ${css.split(',')[0].replace(/['"]/g, '')}` });
    return opts;
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-neutral-800 px-4 py-3">
        <span className="text-xs font-semibold text-neutral-200">사이트 테마</span>
        <p className="mt-0.5 text-[11px] text-neutral-500">요소를 선택하지 않은 상태 — 사이트 전체 스타일</p>
      </div>

      <FieldGroup title="팔레트">
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

      <FieldGroup title="타이포그래피">
        <SelectField label="제목 폰트" value={fontValue(theme.fonts.heading)} options={fontOptions(theme.fonts.heading)} onCommit={(v) => setFont('heading', v)} />
        <SelectField label="본문 폰트" value={fontValue(theme.fonts.body)} options={fontOptions(theme.fonts.body)} onCommit={(v) => setFont('body', v)} />
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-3">
          <p className="truncate text-lg leading-6" style={{ fontFamily: theme.fonts.heading, color: theme.palette.text }}>
            여섯 가지 요리, 하나의 불
          </p>
          <p className="mt-1 truncate text-xs" style={{ fontFamily: theme.fonts.body, color: theme.palette.muted }}>
            본문 미리보기 — 매일 아침 참숯을 피웁니다.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="기타">
        <NumberField label="기본 둥글기 (px)" value={theme.radius ?? 8} min={0} max={40} onCommit={(v) => store().updateTheme({ radius: v })} />
        <TextField label="사이트 제목 (브라우저 탭)" value={title} allowEmpty={false} onCommit={(v) => store().updateMeta({ title: v })} />
      </FieldGroup>
    </div>
  );
}
