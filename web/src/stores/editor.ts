/**
 * 캔버스 에디터 전역 상태 (zustand + zundo temporal).
 * - config(SiteConfig)만 undo/redo 히스토리에 기록 (partialize + equality).
 * - 드래그 중간값은 컴포넌트 로컬 상태로만 유지하고 종료 시점에 커밋 →
 *   히스토리는 커밋 단위로만 쌓인다. 연속 커밋(화살표 키 반복 등)은
 *   HISTORY_GROUP_MS 윈도우로 그룹핑.
 */
import { create } from 'zustand';
import { temporal } from 'zundo';
import type {
  BusinessInfo,
  CanvasElement,
  ElementKind,
  Frame,
  Section,
  SectionBackground,
  SectionType,
  SiteConfig,
  SiteMeta,
  SiteTheme,
} from '@/lib/types/site';
import { emptySiteConfig } from '@/lib/types/site';
import type { EditType } from '@/lib/types/domain';
import { createDefaultElement, createDefaultSection, uid } from '@/components/editor/defaults';
import { clampFrameToSection } from '@/components/editor/snap';

export type ZoomMode = 'fit' | number;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export type ZOrderOp = 'front' | 'back' | 'forward' | 'backward';
/** off = 편집 캔버스, desktop/mobile = SiteRenderer 실사 미리보기(애니메이션·버튼 동작) */
export type PreviewMode = 'off' | 'desktop' | 'mobile';

/** 스냅 가이드라인 (섹션 로컬 좌표, 디자인 px) */
export interface SnapGuides {
  sectionId: string;
  v: number[];
  h: number[];
}

interface ThemePatch {
  fonts?: Partial<SiteTheme['fonts']>;
  palette?: Partial<SiteTheme['palette']>;
  radius?: number;
  customCss?: string;
}

export interface EditorState {
  siteId: string;
  config: SiteConfig;
  /**
   * [v3 Phase 4] 사업자 정보 — config 밖 별도 필드로 관리해 zundo 히스토리에서 제외한다
   * (partialize가 { config }만 추적 → undo/redo가 businessInfo를 되돌리지 않음).
   * 자동저장이 draftConfig로 합성해 전송.
   */
  businessInfo: BusinessInfo | null;
  selectedSectionId: string | null;
  selectedElementId: string | null;
  /** 인라인 텍스트 편집 중인 요소 */
  editingElementId: string | null;
  zoom: ZoomMode;
  /** 캔버스가 측정한 'fit' 배율 — 툴바 줌 표시/증감 기준 (히스토리 비추적) */
  fitScale: number;
  preview: PreviewMode;
  dirty: boolean;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  guides: SnapGuides | null;
  /** 인스펙터 → AI 탭 전환 의도 (예: 이미지 패널의 "AI 생성" 버튼) */
  aiIntent: EditType | null;

  // ----- 선택/뷰 -----
  selectSection: (sectionId: string | null) => void;
  selectElement: (sectionId: string, elementId: string) => void;
  clearSelection: () => void;
  setEditingElement: (elementId: string | null) => void;
  setZoom: (zoom: ZoomMode) => void;
  setFitScale: (scale: number) => void;
  setPreview: (mode: PreviewMode) => void;
  setGuides: (guides: SnapGuides | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setAiIntent: (intent: EditType | null) => void;

  // ----- 요소 -----
  addElement: (sectionId: string, kind: ElementKind) => string | null;
  updateElement: (elementId: string, patch: Partial<CanvasElement>) => void;
  updateElementStyle: (elementId: string, stylePatch: Record<string, unknown>) => void;
  updateElementFrame: (elementId: string, frame: Frame) => void;
  /** 연속 캔버스에서 섹션 경계를 넘어 드롭 — 요소를 다른 섹션으로 재소속 (frame은 대상 섹션 로컬 좌표) */
  moveElementToSection: (elementId: string, targetSectionId: string, frame: Frame) => void;
  deleteElement: (elementId: string) => void;
  duplicateElement: (elementId: string) => string | null;
  reorderElement: (elementId: string, op: ZOrderOp) => void;

  // ----- 섹션 -----
  addSection: (type: SectionType, afterSectionId?: string | null) => string;
  updateSection: (sectionId: string, patch: Partial<Omit<Section, 'id' | 'elements'>>) => void;
  updateSectionBackground: (sectionId: string, background: SectionBackground) => void;
  deleteSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => string | null;
  moveSection: (sectionId: string, dir: -1 | 1) => void;

  // ----- 테마/메타 -----
  updateTheme: (patch: ThemePatch) => void;
  updateMeta: (patch: Partial<SiteMeta>) => void;

  // ----- [v3 Phase 4] 사업자 정보 (undo 비추적) -----
  setBusinessInfo: (info: BusinessInfo | null) => void;
}

type TrackedState = { config: SiteConfig };

/** 이 시간(ms) 안에 연속된 커밋은 하나의 undo 단계로 그룹핑 */
const HISTORY_GROUP_MS = 200;
const HISTORY_LIMIT = 100;

// ---------- 순수 헬퍼 ----------

/** [v4 Phase 1] 편집 대상 페이지 인덱스 — 홈(pages[0]) 고정. Phase 2에서 selectedPageId로 대체. */
export function activePageIndex(config: SiteConfig): number {
  void config;
  return 0;
}
/** 편집 대상 페이지의 섹션 배열 (에디터 컴포넌트가 공유 — 선택 페이지 단일 소스) */
export function activeSections(config: SiteConfig): Section[] {
  return config.pages[activePageIndex(config)]?.sections ?? [];
}
/** 편집 대상 페이지의 섹션을 교체한 새 config (다른 페이지 참조 유지) */
function withActiveSections(config: SiteConfig, sections: Section[]): SiteConfig {
  const idx = activePageIndex(config);
  return { ...config, pages: config.pages.map((p, i) => (i === idx ? { ...p, sections } : p)) };
}

export function findElementLocation(
  config: SiteConfig,
  elementId: string | null,
): { section: Section; element: CanvasElement } | null {
  if (!elementId) return null;
  for (const section of activeSections(config)) {
    const element = section.elements.find((e) => e.id === elementId);
    if (element) return { section, element };
  }
  return null;
}

function mapElement(
  config: SiteConfig,
  elementId: string,
  fn: (el: CanvasElement, section: Section) => CanvasElement,
): SiteConfig {
  let changed = false;
  const sections = activeSections(config).map((section) => {
    const idx = section.elements.findIndex((e) => e.id === elementId);
    if (idx < 0) return section;
    const el = section.elements[idx];
    const updated = fn(el, section);
    if (updated === el) return section;
    changed = true;
    const elements = section.elements.slice();
    elements[idx] = updated;
    return { ...section, elements };
  });
  return changed ? withActiveSections(config, sections) : config;
}

function maxZ(section: Section): number {
  return section.elements.reduce((m, e) => Math.max(m, e.z), -1);
}

function roundFrame(frame: Frame): Frame {
  return {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    w: Math.max(1, Math.round(frame.w)),
    h: Math.max(1, Math.round(frame.h)),
  };
}

// ---------- 스토어 ----------

export const useEditorStore = create<EditorState>()(
  temporal(
    (set) => ({
      siteId: '',
      config: emptySiteConfig(''),
      businessInfo: null,
      selectedSectionId: null,
      selectedElementId: null,
      editingElementId: null,
      zoom: 'fit' as ZoomMode,
      fitScale: 1,
      preview: 'off' as PreviewMode,
      dirty: false,
      saveStatus: 'idle' as SaveStatus,
      lastSavedAt: null,
      guides: null,
      aiIntent: null,

      // ----- 선택/뷰 -----
      selectSection: (sectionId) =>
        set({ selectedSectionId: sectionId, selectedElementId: null, editingElementId: null }),
      selectElement: (sectionId, elementId) =>
        set((state) => ({
          selectedSectionId: sectionId,
          selectedElementId: elementId,
          editingElementId: state.editingElementId === elementId ? state.editingElementId : null,
        })),
      clearSelection: () =>
        set({ selectedSectionId: null, selectedElementId: null, editingElementId: null }),
      setEditingElement: (elementId) => set({ editingElementId: elementId }),
      setZoom: (zoom) => set({ zoom }),
      setFitScale: (scale) => set({ fitScale: scale }),
      setPreview: (mode) =>
        set({ preview: mode, editingElementId: null, guides: null }),
      setGuides: (guides) => set({ guides }),
      setSaveStatus: (status) =>
        set(status === 'saved' ? { saveStatus: status, lastSavedAt: Date.now(), dirty: false } : { saveStatus: status }),
      setAiIntent: (intent) => set({ aiIntent: intent }),

      // ----- 요소 -----
      addElement: (sectionId, kind) => {
        let newId: string | null = null;
        set((state) => {
          const sIdx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          if (sIdx < 0) return state;
          const section = activeSections(state.config)[sIdx];
          const el = createDefaultElement(kind, state.config.theme, maxZ(section) + 1);
          const newEl = { ...el, frame: clampFrameToSection(el.frame, section.height) };
          newId = newEl.id;
          const sections = activeSections(state.config).slice();
          sections[sIdx] = { ...section, elements: [...section.elements, newEl] };
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: sectionId,
            selectedElementId: newEl.id,
            editingElementId: null,
          };
        });
        return newId;
      },

      updateElement: (elementId, patch) =>
        set((state) => {
          const next = mapElement(state.config, elementId, (el) => ({ ...el, ...patch } as CanvasElement));
          if (next === state.config) return state;
          return { config: next, dirty: true };
        }),

      updateElementStyle: (elementId, stylePatch) =>
        set((state) => {
          const next = mapElement(
            state.config,
            elementId,
            (el) => ({ ...el, style: { ...el.style, ...stylePatch } } as CanvasElement),
          );
          if (next === state.config) return state;
          return { config: next, dirty: true };
        }),

      updateElementFrame: (elementId, frame) =>
        set((state) => {
          const rounded = roundFrame(frame);
          const next = mapElement(state.config, elementId, (el) => {
            const f = el.frame;
            if (f.x === rounded.x && f.y === rounded.y && f.w === rounded.w && f.h === rounded.h) return el;
            return { ...el, frame: rounded };
          });
          if (next === state.config) return state;
          return { config: next, dirty: true };
        }),

      moveElementToSection: (elementId, targetSectionId, frame) =>
        set((state) => {
          const src = activeSections(state.config).find((s) => s.elements.some((e) => e.id === elementId));
          const dst = activeSections(state.config).find((s) => s.id === targetSectionId);
          if (!src || !dst || src.id === dst.id) return state;
          const el = src.elements.find((e) => e.id === elementId)!;
          const moved = { ...el, frame: roundFrame(frame), z: maxZ(dst) + 1 };
          const sections = activeSections(state.config).map((s) => {
            if (s.id === src.id) return { ...s, elements: s.elements.filter((e) => e.id !== elementId) };
            if (s.id === dst.id) return { ...s, elements: [...s.elements, moved] };
            return s;
          });
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: targetSectionId,
            selectedElementId: elementId,
          };
        }),

      deleteElement: (elementId) =>
        set((state) => {
          let found = false;
          const sections = activeSections(state.config).map((section) => {
            if (!section.elements.some((e) => e.id === elementId)) return section;
            found = true;
            return { ...section, elements: section.elements.filter((e) => e.id !== elementId) };
          });
          if (!found) return state;
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedElementId: state.selectedElementId === elementId ? null : state.selectedElementId,
            editingElementId: state.editingElementId === elementId ? null : state.editingElementId,
          };
        }),

      duplicateElement: (elementId) => {
        let newId: string | null = null;
        set((state) => {
          const loc = findElementLocation(state.config, elementId);
          if (!loc) return state;
          const { section, element } = loc;
          const copy = structuredClone(element) as CanvasElement;
          copy.id = uid();
          copy.z = maxZ(section) + 1;
          copy.frame = clampFrameToSection(
            { ...element.frame, x: element.frame.x + 16, y: element.frame.y + 16 },
            section.height,
          );
          newId = copy.id;
          const sections = activeSections(state.config).map((s) =>
            s.id === section.id ? { ...s, elements: [...s.elements, copy] } : s,
          );
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: section.id,
            selectedElementId: copy.id,
            editingElementId: null,
          };
        });
        return newId;
      },

      reorderElement: (elementId, op) =>
        set((state) => {
          const sIdx = activeSections(state.config).findIndex((s) => s.elements.some((e) => e.id === elementId));
          if (sIdx < 0) return state;
          const section = activeSections(state.config)[sIdx];
          const sorted = [...section.elements].sort((a, b) => a.z - b.z);
          const idx = sorted.findIndex((e) => e.id === elementId);
          const to =
            op === 'front' ? sorted.length - 1
            : op === 'back' ? 0
            : op === 'forward' ? Math.min(sorted.length - 1, idx + 1)
            : Math.max(0, idx - 1);
          if (to === idx) return state;
          const [item] = sorted.splice(idx, 1);
          sorted.splice(to, 0, item);
          const zById = new Map(sorted.map((e, i) => [e.id, i]));
          const elements = section.elements.map((e) => {
            const z = zById.get(e.id) ?? e.z;
            return e.z === z ? e : { ...e, z };
          });
          const sections = activeSections(state.config).slice();
          sections[sIdx] = { ...section, elements };
          return { config: withActiveSections(state.config, sections), dirty: true };
        }),

      // ----- 섹션 -----
      addSection: (type, afterSectionId) => {
        const section = createDefaultSection(type);
        set((state) => {
          const sections = activeSections(state.config).slice();
          const anchor = afterSectionId ?? state.selectedSectionId;
          const idx = anchor ? sections.findIndex((s) => s.id === anchor) : -1;
          if (idx >= 0) sections.splice(idx + 1, 0, section);
          else sections.push(section);
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: section.id,
            selectedElementId: null,
            editingElementId: null,
          };
        });
        return section.id;
      },

      updateSection: (sectionId, patch) =>
        set((state) => {
          const idx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          if (idx < 0) return state;
          const sections = activeSections(state.config).slice();
          sections[idx] = { ...sections[idx], ...patch };
          return { config: withActiveSections(state.config, sections), dirty: true };
        }),

      updateSectionBackground: (sectionId, background) =>
        set((state) => {
          const idx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          if (idx < 0) return state;
          const sections = activeSections(state.config).slice();
          sections[idx] = { ...sections[idx], background };
          return { config: withActiveSections(state.config, sections), dirty: true };
        }),

      deleteSection: (sectionId) =>
        set((state) => {
          const idx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          if (idx < 0) return state;
          const sections = activeSections(state.config).filter((s) => s.id !== sectionId);
          const wasSelected = state.selectedSectionId === sectionId;
          const neighbor = sections[Math.min(idx, sections.length - 1)] ?? null;
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: wasSelected ? (neighbor?.id ?? null) : state.selectedSectionId,
            selectedElementId: wasSelected ? null : state.selectedElementId,
            editingElementId: null,
          };
        }),

      duplicateSection: (sectionId) => {
        let newId: string | null = null;
        set((state) => {
          const idx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          if (idx < 0) return state;
          const original = activeSections(state.config)[idx];
          const copy = structuredClone(original) as Section;
          copy.id = uid();
          copy.name = `${original.name} 복사본`;
          copy.elements = copy.elements.map((e) => ({ ...e, id: uid() }));
          newId = copy.id;
          const sections = activeSections(state.config).slice();
          sections.splice(idx + 1, 0, copy);
          return {
            config: withActiveSections(state.config, sections),
            dirty: true,
            selectedSectionId: copy.id,
            selectedElementId: null,
          };
        });
        return newId;
      },

      moveSection: (sectionId, dir) =>
        set((state) => {
          const idx = activeSections(state.config).findIndex((s) => s.id === sectionId);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= activeSections(state.config).length) return state;
          const sections = activeSections(state.config).slice();
          const [item] = sections.splice(idx, 1);
          sections.splice(to, 0, item);
          return { config: withActiveSections(state.config, sections), dirty: true };
        }),

      // ----- 테마/메타 -----
      updateTheme: (patch) =>
        set((state) => {
          const theme = state.config.theme;
          const next: SiteTheme = {
            ...theme,
            ...(patch.radius !== undefined ? { radius: patch.radius } : null),
            ...(patch.customCss !== undefined ? { customCss: patch.customCss } : null),
            fonts: patch.fonts ? { ...theme.fonts, ...patch.fonts } : theme.fonts,
            palette: patch.palette ? { ...theme.palette, ...patch.palette } : theme.palette,
          };
          return { config: { ...state.config, theme: next }, dirty: true };
        }),

      updateMeta: (patch) =>
        set((state) => ({
          config: { ...state.config, meta: { ...state.config.meta, ...patch } },
          dirty: true,
        })),

      // ----- [v3 Phase 4] 사업자 정보 -----
      // config를 건드리지 않으므로 zundo equality(past.config === current.config)에 걸려
      // 히스토리에 쌓이지 않는다 — undo/redo가 businessInfo를 되돌리지 않음.
      setBusinessInfo: (info) => set({ businessInfo: info, dirty: true }),
    }),
    {
      partialize: (state): TrackedState => ({ config: state.config }),
      equality: (past, current) => past.config === current.config,
      limit: HISTORY_LIMIT,
      handleSet: (handleSet) => {
        let lastCommit = 0;
        const inner = handleSet as unknown as (
          pastState: unknown,
          replace: unknown,
          currentState?: unknown,
          deltaState?: unknown,
        ) => void;
        return (pastState, replace, currentState, deltaState) => {
          const now = Date.now();
          if (now - lastCommit < HISTORY_GROUP_MS) return;
          lastCommit = now;
          inner(pastState, replace, currentState, deltaState);
        };
      },
    },
  ),
);

/** 페이지 진입 시 1회 초기화 — 히스토리도 함께 리셋 */
export function initializeEditor(siteId: string, config: SiteConfig) {
  // [v3 Phase 4] businessInfo는 undo 비추적 필드로 분리 (config에는 남기지 않는다)
  const { businessInfo, ...rest } = config;
  useEditorStore.setState({
    siteId,
    config: rest,
    businessInfo: businessInfo ?? null,
    selectedSectionId: rest.pages[0]?.sections[0]?.id ?? null,
    selectedElementId: null,
    editingElementId: null,
    zoom: 'fit',
    preview: 'off',
    dirty: false,
    saveStatus: 'idle',
    lastSavedAt: null,
    guides: null,
    aiIntent: null,
  });
  useEditorStore.temporal.getState().clear();
}

/**
 * undo/redo — zundo는 partialize된 { config }만 복원하므로,
 * 복원 후 dirty를 수동 마킹해 자동저장이 다시 돌게 한다.
 * (이 setState는 config 참조가 그대로라 equality 가드에 걸려 히스토리에 안 쌓인다)
 */
export function undoEditor() {
  const t = useEditorStore.temporal.getState();
  if (t.pastStates.length === 0) return;
  t.undo();
  useEditorStore.setState({ dirty: true, editingElementId: null, guides: null });
}

export function redoEditor() {
  const t = useEditorStore.temporal.getState();
  if (t.futureStates.length === 0) return;
  t.redo();
  useEditorStore.setState({ dirty: true, editingElementId: null, guides: null });
}
