import { createDefaultElement, createDefaultSection } from '@/components/editor/defaults';
import type { AssetRef } from '@/lib/assets/provenance';
import type { EditRequest } from '@/lib/types/domain';
import type { CanvasElement, Section, SiteConfig } from '@/lib/types/site';

export type FulfillmentActorType = 'client' | 'system' | 'admin';

export interface EditRequestEvent {
  id: string;
  editRequestId: string;
  fromStatus: EditRequest['status'] | null;
  toStatus: EditRequest['status'];
  actorType: FulfillmentActorType;
  actorId: string;
  createdAt: string;
}

export interface EditFulfillmentTarget {
  pageId: string;
  sectionId?: string;
  elementId?: string;
}

interface EditOutput {
  text?: string;
  url?: string;
  poster?: string;
  assetId?: string;
  fulfillmentTarget?: EditFulfillmentTarget;
}

export class EditFulfillmentApplyError extends Error {
  constructor(readonly code: 'OUTPUT_INVALID' | 'TARGET_MISSING' | 'TARGET_KIND_MISMATCH') {
    super(code);
    this.name = 'EditFulfillmentApplyError';
  }
}

function outputOf(request: EditRequest): EditOutput {
  if (!request.aiOutput || typeof request.aiOutput !== 'object' || Array.isArray(request.aiOutput)) {
    throw new EditFulfillmentApplyError('OUTPUT_INVALID');
  }
  return request.aiOutput as EditOutput;
}

function targetOf(config: SiteConfig, output: EditOutput): {
  pageIndex: number;
  sectionIndex: number;
  target: EditFulfillmentTarget;
} {
  const target = output.fulfillmentTarget;
  if (!target?.pageId) throw new EditFulfillmentApplyError('TARGET_MISSING');
  const pageIndex = config.pages.findIndex((page) => page.id === target.pageId);
  if (pageIndex < 0) throw new EditFulfillmentApplyError('TARGET_MISSING');
  const sections = config.pages[pageIndex].sections;
  const sectionIndex = target.sectionId
    ? sections.findIndex((section) => section.id === target.sectionId)
    : 0;
  if (sectionIndex < 0 || !sections[sectionIndex]) {
    throw new EditFulfillmentApplyError('TARGET_MISSING');
  }
  return { pageIndex, sectionIndex, target };
}

function deterministicElementId(requestId: string): string {
  return `fulfilled-${requestId}`;
}

function deterministicSectionId(requestId: string): string {
  return `fulfilled-section-${requestId}`;
}

function withAssetRef(config: SiteConfig, output: EditOutput): SiteConfig {
  if (!output.assetId || !output.url) return config;
  const nextRef: AssetRef = { assetId: output.assetId, url: output.url };
  const refs = config.assetRefs ?? [];
  const existing = refs.findIndex((ref) => ref.assetId === nextRef.assetId);
  return {
    ...config,
    assetRefs: existing >= 0
      ? refs.map((ref, index) => index === existing ? nextRef : ref)
      : [...refs, nextRef],
  };
}

function maxZ(section: Section): number {
  return section.elements.reduce((highest, element) => Math.max(highest, element.z), -1);
}

function expectedKind(type: EditRequest['type']): CanvasElement['kind'] | null {
  if (type === 'text') return 'text';
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  return null;
}

function patchedElement(element: CanvasElement, request: EditRequest, output: EditOutput): CanvasElement {
  if (request.type === 'text' && element.kind === 'text' && output.text) {
    return { ...element, text: output.text };
  }
  if (request.type === 'image' && element.kind === 'image' && output.url) {
    return { ...element, src: output.url };
  }
  if (request.type === 'video' && element.kind === 'video' && output.url) {
    return { ...element, src: output.url, ...(output.poster ? { poster: output.poster } : {}) };
  }
  throw new EditFulfillmentApplyError(
    element.kind === expectedKind(request.type) ? 'OUTPUT_INVALID' : 'TARGET_KIND_MISMATCH',
  );
}

/**
 * Applies one reviewed output to an exact persisted target. IDs for additions
 * are derived from the request, so retrying the same completion is idempotent.
 */
export function applyEditRequestToConfig(config: SiteConfig, request: EditRequest): SiteConfig {
  const output = outputOf(request);
  const located = targetOf(config, output);
  const page = config.pages[located.pageIndex];

  if (request.type === 'structure') {
    if (!output.text) throw new EditFulfillmentApplyError('OUTPUT_INVALID');
    const sectionId = deterministicSectionId(request.id);
    const existingIndex = page.sections.findIndex((section) => section.id === sectionId);
    const section = createDefaultSection('custom');
    section.id = sectionId;
    section.name = 'AI 제안 섹션';
    const element = createDefaultElement('text', config.theme, 0);
    element.id = deterministicElementId(request.id);
    if (element.kind !== 'text') throw new EditFulfillmentApplyError('OUTPUT_INVALID');
    element.text = output.text;
    section.elements = [element];
    const sections = existingIndex >= 0
      ? page.sections.map((current, index) => index === existingIndex ? section : current)
      : [
          ...page.sections.slice(0, located.sectionIndex + 1),
          section,
          ...page.sections.slice(located.sectionIndex + 1),
        ];
    return {
      ...config,
      pages: config.pages.map((current, index) => (
        index === located.pageIndex ? { ...current, sections } : current
      )),
    };
  }

  const kind = expectedKind(request.type);
  if (!kind) throw new EditFulfillmentApplyError('OUTPUT_INVALID');
  const section = page.sections[located.sectionIndex];
  const deterministicId = deterministicElementId(request.id);
  const targetElementId = located.target.elementId ?? deterministicId;
  const elementIndex = section.elements.findIndex((element) => element.id === targetElementId);
  let elements: CanvasElement[];
  if (elementIndex >= 0) {
    elements = section.elements.map((element, index) => (
      index === elementIndex ? patchedElement(element, request, output) : element
    ));
  } else {
    if (located.target.elementId) throw new EditFulfillmentApplyError('TARGET_MISSING');
    const created = createDefaultElement(kind, config.theme, maxZ(section) + 1);
    created.id = deterministicId;
    elements = [...section.elements, patchedElement(created, request, output)];
  }
  const sections = page.sections.map((current, index) => (
    index === located.sectionIndex ? { ...current, elements } : current
  ));
  return withAssetRef({
    ...config,
    pages: config.pages.map((current, index) => (
      index === located.pageIndex ? { ...current, sections } : current
    )),
  }, output);
}
