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
  MotionIntensity,
  Section,
  SectionBackground,
  SectionType,
  SiteConfig,
  SiteMeta,
  SitePage,
  SiteTheme,
} from '@/lib/types/site';
import { emptySiteConfig, isValidPageSlug } from '@/lib/types/site';
import type { EditType, Tier } from '@/lib/types/domain';
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
  /**
   * [gating] 소유자 요금제 tier — 등장 애니메이션 게이팅(인스펙터 잠금·프리뷰 animate).
   * businessInfo처럼 config 밖 필드라 undo/redo 히스토리에서 제외(partialize { config }).
   * initializeEditor에서 명시 전달 — 기본값 'basic'(fail-closed).
   */
  tier: Tier;
  /** [v4 Phase 2] 편집 중인 페이지 id — 요소/섹션 액션이 이 페이지 스코프로 동작 */
  selectedPageId: string;
  /** [v4 Phase 2] 프리뷰 중 페이지 slug — 내비/링크 클릭으로 전환 (편집 스코프와 별개) */
  previewPageSlug: string;
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

  // ----- [v4 Phase 2] 페이지 -----
  selectPage: (pageId: string) => void;
  addPage: (title: string) => string;
  renamePage: (pageId: string, title: string) => void;
  /** slug 정규화(소문자)+검증(유효/예약/유니크) 통과 시에만 적용, 아니면 no-op */
  setPageSlug: (pageId: string, slug: string) => void;
  reorderPage: (pageId: string, dir: -1 | 1) => void;
  /** 홈(slug '') 삭제 금지, 최소 1페이지 유지 */
  deletePage: (pageId: string) => void;
  duplicatePage: (pageId: string) => string | null;
  setPageNav: (pageId: string, patch: { showInNav?: boolean; navLabel?: string }) => void;
  /** 프리뷰 페이지 전환 (프리뷰 모드 내 내비/링크 클릭) */
  setPreviewPage: (slug: string) => void;

  // ----- 테마/메타 -----
  updateTheme: (patch: ThemePatch) => void;
  updateMeta: (patch: Partial<SiteMeta>) => void;

  // ----- [motion 3단계] 사이트 모션 프리셋/강도 (config.motion — undo 추적) -----
  /** 프리셋 교체 (같은 tier 내에서만 UI가 호출; 서버 sanitizeMotion이 최종 강제) */
  setMotionPreset: (presetId: string) => void;
  setMotionIntensity: (intensity: MotionIntensity) => void;

  // ----- [v3 Phase 4] 사업자 정보 (undo 비추적) -----
  setBusinessInfo: (info: BusinessInfo | null) => void;
}

type TrackedState = { config: SiteConfig };

/** 이 시간(ms) 안에 연속된 커밋은 하나의 undo 단계로 그룹핑 */
const HISTORY_GROUP_MS = 200;
const HISTORY_LIMIT = 100;

// ---------- 순수 헬퍼 ----------

/** [v4 Phase 2] 편집 대상 페이지 인덱스 — 스토어의 selectedPageId 기준(없으면 홈/0). */
export function activePageIndex(config: SiteConfig): number {
  const selectedId = useEditorStore.getState().selectedPageId;
  const idx = config.pages.findIndex((p) => p.id === selectedId);
  return idx >= 0 ? idx : 0;
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

/** [v4 Phase 2] 제목 → slug 후보 (ASCII 소문자/숫자/하이픈; 한글 등은 제거돼 빈 문자열 가능) */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
/** [v4 Phase 2] pages 내 유니크·유효 slug 보장 (빈/예약/충돌이면 page 또는 base-N 폴백) */
function uniquePageSlug(pages: SitePage[], base: string, excludeId?: string): string {
  const taken = new Set(pages.filter((p) => p.id !== excludeId).map((p) => p.slug));
  const root = base && base !== '' && isValidPageSlug(base) ? base : 'page';
  let candidate = root;
  let n = 2;
  while (taken.has(candidate) || !isValidPageSlug(candidate) || candidate === '') {
    // 접미사를 붙일 때 총 길이 40 초과 방지 (root 절단) — 무한루프 방지
    candidate = `${root.slice(0, Math.max(1, 40 - String(n).length - 1))}-${n++}`;
  }
  return candidate;
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
      tier: 'basic' as Tier,
      selectedPageId: 'home',
      previewPageSlug: '',
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
        set((state) => {
          // [v4 Phase 2] 프리뷰 시작 시 편집 중이던 페이지로
          const page = state.config.pages.find((p) => p.id === state.selectedPageId);
          return { preview: mode, previewPageSlug: page?.slug ?? '', editingElementId: null, guides: null };
        }),
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

      // ----- [v4 Phase 2] 페이지 -----
      selectPage: (pageId) =>
        set((state) => {
          if (!state.config.pages.some((p) => p.id === pageId)) return state;
          return { selectedPageId: pageId, selectedSectionId: null, selectedElementId: null, editingElementId: null };
        }),

      addPage: (title) => {
        const newId = uid();
        set((state) => {
          const t = title.trim() || '새 페이지';
          const slug = uniquePageSlug(state.config.pages, slugify(t));
          const page: SitePage = { id: newId, title: t, slug, sections: [] };
          return {
            config: { ...state.config, pages: [...state.config.pages, page] },
            dirty: true,
            selectedPageId: newId,
            selectedSectionId: null,
            selectedElementId: null,
            editingElementId: null,
          };
        });
        return newId;
      },

      renamePage: (pageId, title) =>
        set((state) => {
          const t = title.trim();
          if (!t) return state;
          return {
            config: { ...state.config, pages: state.config.pages.map((p) => (p.id === pageId ? { ...p, title: t } : p)) },
            dirty: true,
          };
        }),

      setPageSlug: (pageId, slug) =>
        set((state) => {
          const target = state.config.pages.find((p) => p.id === pageId);
          if (!target || target.slug === '') return state; // 홈 slug('')는 불변
          const normalized = slug.trim().toLowerCase();
          if (normalized === '' || !isValidPageSlug(normalized)) return state; // 홈 외엔 빈 slug 불가
          if (state.config.pages.some((p) => p.id !== pageId && p.slug === normalized)) return state; // 중복
          return {
            config: { ...state.config, pages: state.config.pages.map((p) => (p.id === pageId ? { ...p, slug: normalized } : p)) },
            dirty: true,
          };
        }),

      reorderPage: (pageId, dir) =>
        set((state) => {
          const pages = state.config.pages;
          const idx = pages.findIndex((p) => p.id === pageId);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= pages.length) return state;
          const next = pages.slice();
          const [item] = next.splice(idx, 1);
          next.splice(to, 0, item);
          return { config: { ...state.config, pages: next }, dirty: true };
        }),

      deletePage: (pageId) =>
        set((state) => {
          const pages = state.config.pages;
          const target = pages.find((p) => p.id === pageId);
          if (!target || target.slug === '' || pages.length <= 1) return state; // 홈/최소1 보호
          const idx = pages.findIndex((p) => p.id === pageId);
          const next = pages.filter((p) => p.id !== pageId);
          const wasSelected = state.selectedPageId === pageId;
          const neighbor = next[Math.min(idx, next.length - 1)] ?? next[0];
          return {
            config: { ...state.config, pages: next },
            dirty: true,
            selectedPageId: wasSelected ? neighbor.id : state.selectedPageId,
            selectedSectionId: null,
            selectedElementId: null,
            editingElementId: null,
          };
        }),

      duplicatePage: (pageId) => {
        let newId: string | null = null;
        set((state) => {
          const pages = state.config.pages;
          const idx = pages.findIndex((p) => p.id === pageId);
          if (idx < 0) return state;
          const original = pages[idx];
          const copy = structuredClone(original) as SitePage;
          copy.id = uid();
          copy.title = `${original.title} 복사본`;
          copy.slug = uniquePageSlug(pages, original.slug || slugify(copy.title));
          copy.sections = copy.sections.map((s) => ({
            ...s,
            id: uid(),
            elements: s.elements.map((e) => ({ ...e, id: uid() })),
          }));
          newId = copy.id;
          const next = pages.slice();
          next.splice(idx + 1, 0, copy);
          return {
            config: { ...state.config, pages: next },
            dirty: true,
            selectedPageId: copy.id,
            selectedSectionId: null,
            selectedElementId: null,
          };
        });
        return newId;
      },

      setPageNav: (pageId, patch) =>
        set((state) => ({
          config: {
            ...state.config,
            pages: state.config.pages.map((p) =>
              p.id === pageId
                ? {
                    ...p,
                    ...('showInNav' in patch ? { showInNav: patch.showInNav } : {}),
                    ...('navLabel' in patch ? { navLabel: patch.navLabel } : {}),
                  }
                : p,
            ),
          },
          dirty: true,
        })),

      setPreviewPage: (slug) => set({ previewPageSlug: slug }),

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

      // ----- [motion 3단계] 모션 프리셋/강도 -----
      setMotionPreset: (presetId) =>
        set((state) => ({
          config: { ...state.config, motion: { presetId, intensity: state.config.motion?.intensity ?? 'normal' } },
          dirty: true,
        })),
      setMotionIntensity: (intensity) =>
        set((state) => ({
          config: {
            ...state.config,
            motion: { presetId: state.config.motion?.presetId ?? 'cafe-basic', intensity },
          },
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
export function initializeEditor(siteId: string, config: SiteConfig, tier: Tier) {
  // [v3 Phase 4] businessInfo는 undo 비추적 필드로 분리 (config에는 남기지 않는다)
  const { businessInfo, ...rest } = config;
  // [v4 Phase 2] 진입 시 홈 페이지 선택
  const home = rest.pages.find((p) => p.slug === '') ?? rest.pages[0];
  useEditorStore.setState({
    siteId,
    config: rest,
    businessInfo: businessInfo ?? null,
    tier,
    selectedPageId: home?.id ?? 'home',
    previewPageSlug: '',
    selectedSectionId: home?.sections[0]?.id ?? null,
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
