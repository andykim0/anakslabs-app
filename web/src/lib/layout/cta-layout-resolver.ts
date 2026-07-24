import type { CanvasElement, SiteTheme } from '@/lib/types/site';
import {
  buttonById,
  layoutSectionIntro,
  layoutSpacing,
  putFrame,
  safeZoneFrame,
} from './compiler-primitives';
import { ctaLayoutById } from './cta-catalog';
import type {
  CtaLayoutContent,
  CtaLayoutVariantId,
  SectionLayoutBandProjection,
  SectionLayoutBreakpointBand,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
} from './section-layout-types';

const BANDS = ['wide', 'compact', 'mobile'] as const satisfies readonly SectionLayoutBreakpointBand[];

function estimatedActionWidth(label: string): number {
  return Array.from(label).reduce(
    (total, character) => total + (/[가-힣]/u.test(character) ? 16 : 9),
    0,
  ) + 52;
}

function actionWidth(label: string, available: number, mobile: boolean): number {
  if (mobile) return available;
  const estimated = estimatedActionWidth(label);
  return Math.min(available, Math.max(132, estimated));
}

function compileBand({
  band,
  requestedId,
  elements,
  theme,
  content,
}: {
  band: SectionLayoutBreakpointBand;
  requestedId: CtaLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: CtaLayoutContent;
}): SectionLayoutBandProjection {
  const recipe = ctaLayoutById(requestedId).bands[band];
  const zone = safeZoneFrame(band, recipe.textZone);
  const spacing = layoutSpacing(theme, band);
  const frames: Record<string, SectionLayoutCompiledFrame> = {};
  const fontSizes: Record<string, number> = {};
  const groupFrames: Record<string, SectionLayoutCompiledFrame> = {};
  const mobile = band === 'mobile';
  const actionIds = [content.primaryActionId, content.secondaryActionId]
    .filter((id): id is string => Boolean(id));

  const splitActionX = zone.x + zone.w * (band === 'wide' ? 0.74 : 0.68);
  const splitActionWidthLimit = zone.x + zone.w - splitActionX;
  const splitActionsFit = actionIds.every((id) => {
    const action = buttonById(elements, id);
    return Boolean(action && estimatedActionWidth(action.label) <= splitActionWidthLimit);
  });

  if (requestedId === 'cta.split-action' && !mobile && splitActionsFit) {
    const copyWidth = zone.w * (band === 'wide' ? 0.64 : 0.6);
    const intro = layoutSectionIntro({
      band,
      elements,
      theme,
      frames,
      ...content.intro,
      x: zone.x,
      y: zone.y,
      width: copyWidth,
    });
    Object.assign(fontSizes, intro.fontSizes);
    const actionHeight = 48;
    const actionGap = spacing.elementGap;
    const totalActionHeight = actionIds.length * actionHeight + Math.max(0, actionIds.length - 1) * actionGap;
    let actionY = zone.y + Math.max(0, (intro.bottom - zone.y - totalActionHeight) / 2);
    for (const id of actionIds) {
      const action = buttonById(elements, id);
      if (!action) continue;
      putFrame(
        frames,
        id,
        splitActionX,
        actionY,
        actionWidth(action.label, splitActionWidthLimit, false),
        actionHeight,
      );
      actionY += actionHeight + actionGap;
    }
    return {
      width: band === 'wide' ? 1440 : 768,
      sectionHeight: Math.ceil(Math.max(intro.bottom, actionY - actionGap) + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: ['cta-actions'],
    };
  }

  const surface = requestedId === 'cta.surface-card';
  const outerInset = surface ? spacing.sectionInline : 0;
  const innerX = zone.x + outerInset;
  const innerY = zone.y + outerInset;
  const innerWidth = zone.w - outerInset * 2;
  const surfaceActionX = innerX + innerWidth * 0.7;
  const surfaceActionWidthLimit = innerX + innerWidth - surfaceActionX;
  const surfaceActionsFit = actionIds.every((id) => {
    const action = buttonById(elements, id);
    return Boolean(action && estimatedActionWidth(action.label) <= surfaceActionWidthLimit);
  });
  const surfaceSideBySide = !mobile && surface && surfaceActionsFit;
  const copyWidth = surfaceSideBySide ? innerWidth * 0.62 : innerWidth;
  const intro = layoutSectionIntro({
    band,
    elements,
    theme,
    frames,
    ...content.intro,
    x: innerX,
    y: innerY,
    width: copyWidth,
    align: requestedId === 'cta.fullwidth-band' ? 'center' : 'left',
  });
  Object.assign(fontSizes, intro.fontSizes);
  const actionHeight = 48;

  if (surfaceSideBySide) {
    const totalActionHeight = actionIds.length * actionHeight
      + Math.max(0, actionIds.length - 1) * spacing.elementGap;
    let actionY = innerY + Math.max(0, (intro.bottom - innerY - totalActionHeight) / 2);
    for (const id of actionIds) {
      const action = buttonById(elements, id);
      if (!action) continue;
      putFrame(
        frames,
        id,
        surfaceActionX,
        actionY,
        actionWidth(action.label, surfaceActionWidthLimit, false),
        actionHeight,
      );
      actionY += actionHeight + spacing.elementGap;
    }
    const surfaceBottom = Math.max(intro.bottom, actionY - spacing.elementGap) + outerInset;
    groupFrames['cta-surface'] = {
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: surfaceBottom - zone.y,
    };
    return {
      width: band === 'wide' ? 1440 : 768,
      sectionHeight: Math.ceil(surfaceBottom + spacing.sectionBlock),
      frames,
      fontSizes,
      itemOrder: ['cta-actions'],
      groupFrames,
    };
  }

  const vertical = mobile || (
    actionIds.reduce((total, id) => {
      const action = buttonById(elements, id);
      return total + (action ? actionWidth(action.label, innerWidth, false) : 0);
    }, 0) + Math.max(0, actionIds.length - 1) * spacing.elementGap > innerWidth
  );
  const actionStart = intro.bottom + spacing.elementGap * 2;
  let actionBottom = actionStart;
  if (vertical) {
    for (const id of actionIds) {
      putFrame(frames, id, innerX, actionBottom, innerWidth, actionHeight);
      actionBottom += actionHeight + spacing.elementGap;
    }
    actionBottom -= spacing.elementGap;
  } else {
    const widths = actionIds.map((id) => {
      const action = buttonById(elements, id)!;
      return actionWidth(action.label, innerWidth, false);
    });
    const total = widths.reduce((sum, width) => sum + width, 0)
      + Math.max(0, widths.length - 1) * spacing.elementGap;
    let x = innerX + (innerWidth - total) / 2;
    actionIds.forEach((id, index) => {
      putFrame(frames, id, x, actionStart, widths[index], actionHeight);
      x += widths[index] + spacing.elementGap;
    });
    actionBottom = actionStart + actionHeight;
  }
  const bottom = actionBottom + outerInset;
  if (surface) {
    groupFrames['cta-surface'] = {
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: bottom - zone.y,
    };
  }
  return {
    width: band === 'wide' ? 1440 : band === 'compact' ? 768 : 390,
    sectionHeight: Math.ceil(bottom + spacing.sectionBlock),
    frames,
    fontSizes,
    itemOrder: ['cta-actions'],
    ...(surface ? { groupFrames } : {}),
  };
}

export function resolveCtaLayoutVariant({
  requestedId,
  elements,
  theme,
  content,
}: {
  requestedId: CtaLayoutVariantId;
  elements: readonly CanvasElement[];
  theme: SiteTheme;
  content: CtaLayoutContent;
}): SectionLayoutProjection | null {
  if (!buttonById(elements, content.primaryActionId)) return null;
  const bands = Object.fromEntries(BANDS.map((band) => [
    band,
    compileBand({ band, requestedId, elements, theme, content }),
  ])) as SectionLayoutProjection['bands'];
  const actionIds = [content.primaryActionId, content.secondaryActionId]
    .filter((id): id is string => Boolean(id));
  return {
    catalogVersion: 1,
    kind: 'cta',
    requestedId,
    resolvedId: requestedId,
    mediaRole: 'none',
    enhancement: 'none',
    items: [{ id: 'cta-actions', elementIds: actionIds }],
    ...(requestedId === 'cta.surface-card'
      ? { groups: [{ id: 'cta-surface', appearance: 'surface' }] as const }
      : {}),
    bands,
  };
}
