import type { CSSProperties } from 'react';
import type { Section, SiteTheme } from '@/lib/types/site';
import { safeMediaSrc } from '@/lib/safe-url';
import { isCategoricalStockUrl } from '@/lib/stock/application';
import type {
  SectionLayoutBandProjection,
  SectionLayoutCompiledFrame,
  SectionLayoutProjection,
} from '@/lib/layout/section-layout-types';
import {
  isSplitText,
  motionFor,
  parseStatParts,
  revealDelayFor,
  type MotionPlan,
} from '@/lib/motion/apply';
import { resolveScrim } from '@/lib/design/scrim';
import {
  resolveSectionSurfaceTone,
  resolveThemePaint,
} from '@/lib/design/site-theme-tokens';
import { ElementContent } from './ElementContent';
import { cqw } from './scale';
import { ProceduralBackground } from './ProceduralBackground';

const SECTION_LAYOUT_CSS = `
[data-section-layout-stage]{container-type:inline-size;position:relative;overflow:hidden}
[data-section-layout-frame]{position:absolute;left:var(--section-layout-x);top:var(--section-layout-y);width:var(--section-layout-w);height:var(--section-layout-h);min-width:0;max-width:100%}
[data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-frame]{left:var(--section-layout-enhanced-x);top:var(--section-layout-enhanced-y);width:var(--section-layout-enhanced-w);height:var(--section-layout-enhanced-h)}
[data-section-layout-controls]{display:none;position:absolute;right:var(--section-layout-control-inline);bottom:var(--section-layout-control-block);z-index:8;gap:.5rem}
[data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-controls]{display:flex}
[data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-item]:not([data-layout-active]){display:none}
[data-section-layout-control]{display:inline-flex;align-items:center;justify-content:center;min-width:2.75rem;min-height:2.75rem;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
[data-section-layout-atmosphere]{position:absolute;inset:0;background:radial-gradient(circle at 18% 24%,var(--section-layout-accent),transparent 44%),linear-gradient(145deg,var(--section-layout-surface),var(--section-layout-background));opacity:.82}
[data-section-layout-atmosphere-scrim]{position:absolute;inset:0;background:linear-gradient(90deg,var(--section-layout-scrim),transparent 72%);opacity:.52}
[data-section-layout-stock-tint],
[data-section-layout-stock-scrim]{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
[data-section-layout-stock-tint]{z-index:1;background:var(--section-layout-stock-scrim);opacity:var(--section-layout-stock-tint-opacity)}
[data-section-layout-stock-scrim]{z-index:1;opacity:var(--section-layout-stock-opacity)}
[data-section-layout-stock-scrim][data-section-layout-stock-text-zone="left"]{background:linear-gradient(90deg,var(--section-layout-stock-scrim) 0%,var(--section-layout-stock-scrim) 48%,transparent 78%)}
[data-section-layout-stock-scrim][data-section-layout-stock-text-zone="right"]{background:linear-gradient(270deg,var(--section-layout-stock-scrim) 0%,var(--section-layout-stock-scrim) 48%,transparent 78%)}
[data-section-layout-stock-scrim][data-section-layout-stock-text-zone="center"]{background:linear-gradient(90deg,transparent 4%,var(--section-layout-stock-scrim) 26%,var(--section-layout-stock-scrim) 74%,transparent 96%)}
@media(max-width:767.98px){
  [data-section-layout-stage]{height:var(--section-layout-height-mobile)!important}
  [data-section-layout-frame]{left:var(--section-layout-x-mobile);top:var(--section-layout-y-mobile);width:var(--section-layout-w-mobile);height:var(--section-layout-h-mobile)}
  [data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-frame]{left:var(--section-layout-enhanced-x-mobile);top:var(--section-layout-enhanced-y-mobile);width:var(--section-layout-enhanced-w-mobile);height:var(--section-layout-enhanced-h-mobile)}
  [data-section-layout-stock-tint]{opacity:var(--section-layout-stock-tint-opacity-mobile)}
  [data-section-layout-stock-scrim][data-section-layout-stock-text-zone]{background:var(--section-layout-stock-scrim-mobile);opacity:var(--section-layout-stock-opacity-mobile)}
}
@media(prefers-reduced-motion:reduce){
  [data-section-layout-stage][data-layout-carousel-enhanced]{height:var(--section-layout-height)!important}
  [data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-frame]{display:block;left:var(--section-layout-x);top:var(--section-layout-y);width:var(--section-layout-w);height:var(--section-layout-h)}
  [data-section-layout-stage][data-layout-carousel-enhanced] [data-section-layout-controls]{display:none}
}
`;

const BODY_STOCK_TINT = {
  desktop: { minimum: 0.06, maximum: 0.16, multiplier: 0.18 },
  mobile: { minimum: 0.05, maximum: 0.12, multiplier: 0.14 },
} as const;

function bodyStockTintOpacity(
  overlayOpacity: number,
  band: keyof typeof BODY_STOCK_TINT,
): number {
  const rule = BODY_STOCK_TINT[band];
  return Math.max(
    rule.minimum,
    Math.min(rule.maximum, overlayOpacity * rule.multiplier),
  );
}

const LIB3_GROUP_CSS = `
[data-section-layout-group]{position:absolute;left:var(--section-layout-x);top:var(--section-layout-y);width:var(--section-layout-w);height:var(--section-layout-h);z-index:1;pointer-events:none}
[data-section-layout-group-appearance="surface"],
[data-section-layout-group-appearance="testimonial-card"],
[data-section-layout-group-appearance="directions-card"]{background:var(--section-layout-surface);border:1px solid var(--section-layout-border);border-radius:var(--section-layout-radius);box-shadow:var(--section-layout-shadow)}
[data-section-layout-group-appearance="map-surface"]{background:var(--section-layout-surface);border:1px solid var(--section-layout-border);border-radius:var(--section-layout-radius);box-shadow:var(--section-layout-shadow);opacity:.96}
@media(max-width:767.98px){
  [data-section-layout-group]{left:var(--section-layout-x-mobile);top:var(--section-layout-y-mobile);width:var(--section-layout-w-mobile);height:var(--section-layout-h-mobile)}
}
`;

type LayoutVariables = CSSProperties & Record<`--section-layout-${string}`, string>;

function bandLength(value: number, width: number): string {
  return `${Number(((value / width) * 100).toFixed(5))}cqw`;
}

function canvasFrameVariables(
  fallback: SectionLayoutCompiledFrame,
  enhanced: SectionLayoutCompiledFrame,
): LayoutVariables {
  return {
    '--section-layout-x': cqw(fallback.x),
    '--section-layout-y': cqw(fallback.y),
    '--section-layout-w': cqw(fallback.w),
    '--section-layout-h': cqw(fallback.h),
    '--section-layout-enhanced-x': cqw(enhanced.x),
    '--section-layout-enhanced-y': cqw(enhanced.y),
    '--section-layout-enhanced-w': cqw(enhanced.w),
    '--section-layout-enhanced-h': cqw(enhanced.h),
  };
}

function stackFrameVariables(
  compactFallback: SectionLayoutCompiledFrame,
  mobileFallback: SectionLayoutCompiledFrame,
  compactEnhanced: SectionLayoutCompiledFrame,
  mobileEnhanced: SectionLayoutCompiledFrame,
): LayoutVariables {
  return {
    '--section-layout-x': bandLength(compactFallback.x, 768),
    '--section-layout-y': bandLength(compactFallback.y, 768),
    '--section-layout-w': bandLength(compactFallback.w, 768),
    '--section-layout-h': bandLength(compactFallback.h, 768),
    '--section-layout-x-mobile': bandLength(mobileFallback.x, 390),
    '--section-layout-y-mobile': bandLength(mobileFallback.y, 390),
    '--section-layout-w-mobile': bandLength(mobileFallback.w, 390),
    '--section-layout-h-mobile': bandLength(mobileFallback.h, 390),
    '--section-layout-enhanced-x': bandLength(compactEnhanced.x, 768),
    '--section-layout-enhanced-y': bandLength(compactEnhanced.y, 768),
    '--section-layout-enhanced-w': bandLength(compactEnhanced.w, 768),
    '--section-layout-enhanced-h': bandLength(compactEnhanced.h, 768),
    '--section-layout-enhanced-x-mobile': bandLength(mobileEnhanced.x, 390),
    '--section-layout-enhanced-y-mobile': bandLength(mobileEnhanced.y, 390),
    '--section-layout-enhanced-w-mobile': bandLength(mobileEnhanced.w, 390),
    '--section-layout-enhanced-h-mobile': bandLength(mobileEnhanced.h, 390),
  };
}

function frameFor(
  projection: SectionLayoutProjection,
  band: SectionLayoutBandProjection,
  elementId: string,
): SectionLayoutCompiledFrame | undefined {
  return band.frames[elementId] ?? (
    projection.mediaRole === 'atmospheric-background'
      && projection.items.some((item) => item.mediaElementId === elementId)
      ? band.mediaFrame
      : undefined
  );
}

function itemIndexFor(projection: SectionLayoutProjection, elementId: string): number | undefined {
  const index = projection.items.findIndex((item) => item.elementIds.includes(elementId));
  return index >= 0 ? index : undefined;
}

function stockTextZone(
  section: Section,
  band: SectionLayoutBandProjection,
): 'left' | 'center' | 'right' {
  const frames = section.elements
    .filter((element) => element.kind === 'text')
    .map((element) => frameFor(section.sectionLayout!, band, element.id))
    .filter((frame): frame is SectionLayoutCompiledFrame => Boolean(frame));
  if (frames.length === 0) return 'center';
  const left = Math.min(...frames.map((frame) => frame.x));
  const right = Math.max(...frames.map((frame) => frame.x + frame.w));
  const centerRatio = ((left + right) / 2) / band.width;
  if (centerRatio <= 0.42) return 'left';
  if (centerRatio >= 0.58) return 'right';
  return 'center';
}

interface SectionLayoutProjectionRendererProps {
  section: Section;
  theme: SiteTheme;
  variant: 'canvas' | 'stack';
  isFirst?: boolean;
  interactive?: boolean;
  plan?: MotionPlan;
  siteId?: string;
  runtimeDelivery?: 'inline' | 'client';
}

export function SectionLayoutProjectionRenderer({
  section,
  theme,
  variant,
  isFirst,
  interactive = true,
  plan,
  siteId,
  runtimeDelivery = 'client',
}: SectionLayoutProjectionRendererProps) {
  const projection = section.sectionLayout!;
  const fallback = projection.fallbackBands ?? projection.bands;
  const primaryBand = variant === 'canvas' ? projection.bands.wide : projection.bands.compact;
  const fallbackBand = variant === 'canvas' ? fallback.wide : fallback.compact;
  const mobilePrimary = projection.bands.mobile;
  const mobileFallback = fallback.mobile;
  const scrim = resolveScrim(theme.palette);
  const adaptiveScrim = section.background.image?.adaptiveScrim;
  const atmosphericStock = projection.mediaRole === 'atmospheric-background'
    && adaptiveScrim?.source === 'licensed-stock'
    && isCategoricalStockUrl(section.background.image?.src);
  const responsiveScrim = variant === 'canvas'
    ? adaptiveScrim?.wide
    : adaptiveScrim?.compact;
  const responsiveStockTextZone = stockTextZone(section, primaryBand);
  const stageVariables = {
    '--section-layout-height': variant === 'canvas'
      ? cqw(fallbackBand.sectionHeight)
      : bandLength(fallbackBand.sectionHeight, fallbackBand.width),
    '--section-layout-height-mobile': bandLength(mobileFallback.sectionHeight, 390),
    '--section-layout-control-inline': theme.tokens?.spacing.sectionInline ?? '1.5rem',
    '--section-layout-control-block': theme.tokens?.spacing.sectionBlock ?? '3rem',
    '--section-layout-accent': theme.palette.accent,
    '--section-layout-surface': theme.palette.surface,
    '--section-layout-background': theme.palette.background,
    '--section-layout-scrim': scrim.overlayColor,
    ...(atmosphericStock && responsiveScrim && adaptiveScrim
      ? {
          '--section-layout-stock-scrim': responsiveScrim.overlayColor,
          '--section-layout-stock-opacity': String(responsiveScrim.overlayOpacity),
          '--section-layout-stock-scrim-mobile': adaptiveScrim.mobile.overlayColor,
          '--section-layout-stock-opacity-mobile': String(adaptiveScrim.mobile.overlayOpacity),
          '--section-layout-stock-tint-opacity': String(
            bodyStockTintOpacity(responsiveScrim.overlayOpacity, 'desktop'),
          ),
          '--section-layout-stock-tint-opacity-mobile': String(
            bodyStockTintOpacity(adaptiveScrim.mobile.overlayOpacity, 'mobile'),
          ),
        }
      : {}),
    ...(projection.groups?.length
      ? {
          '--section-layout-border': theme.tokens?.color.border ?? theme.palette.muted,
          '--section-layout-radius': theme.tokens?.radius.soft ?? `${theme.radius ?? 8}px`,
          '--section-layout-shadow': theme.tokens?.shadow.low ?? 'none',
        }
      : {}),
  } as LayoutVariables;
  const atmospheric = projection.mediaRole === 'atmospheric-background';
  const requestedSurfaceTone = section.surfaceTone ?? projection.surfaceTone;
  const surfacePaint = requestedSurfaceTone
    ? resolveSectionSurfaceTone(theme, requestedSurfaceTone)
    : null;

  return (
    <section
      id={variant === 'canvas' ? section.id : undefined}
      data-anchor={variant === 'stack' ? section.id : undefined}
      data-section-type={section.type}
      {...(surfacePaint
        ? { 'data-section-surface-tone': surfacePaint.resolvedTone }
        : {})}
      data-section-layout-stage={projection.resolvedId}
      {...(projection.enhancement === 'carousel'
        ? { 'data-section-layout-carousel': 'true' }
        : {})}
      aria-label={section.name}
      style={{
        ...stageVariables,
        height: 'var(--section-layout-height)',
        backgroundColor: surfacePaint?.background
          ?? resolveThemePaint(theme, section.background.color, 'backgroundSubtle'),
        backgroundImage: section.background.gradient,
        ...(surfacePaint ? { color: surfacePaint.text } : {}),
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: SECTION_LAYOUT_CSS }} />
      {projection.groups?.length
        ? <style dangerouslySetInnerHTML={{ __html: LIB3_GROUP_CSS }} />
        : null}
      {atmosphericStock && adaptiveScrim ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            aria-hidden
            data-section-layout-stock-image
            src={safeMediaSrc(section.background.image?.src)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '50% 50%',
              pointerEvents: 'none',
            }}
          />
          <div
            aria-hidden
            data-section-layout-stock-tint
          />
          <div
            aria-hidden
            data-section-layout-stock-scrim
            data-section-layout-stock-text-zone={responsiveStockTextZone}
            data-section-layout-adaptive-scrim={variant === 'canvas' ? 'wide' : 'responsive'}
            data-minimum-contrast={responsiveScrim?.minimumContrast.toFixed(2)}
            data-minimum-contrast-mobile={adaptiveScrim.mobile.minimumContrast.toFixed(2)}
          />
        </>
      ) : atmospheric ? (
        section.proceduralBackground ? (
          <ProceduralBackground
            spec={section.proceduralBackground}
            theme={theme}
            band={variant === 'canvas' ? 'wide' : 'responsive'}
          />
        ) : (
          <>
            <div aria-hidden data-section-layout-atmosphere />
            <div aria-hidden data-section-layout-atmosphere-scrim />
          </>
        )
      ) : null}
      {projection.groups?.map((group) => {
        const wideFrame = projection.bands.wide.groupFrames?.[group.id];
        const compactFrame = projection.bands.compact.groupFrames?.[group.id];
        const mobileFrame = projection.bands.mobile.groupFrames?.[group.id];
        if (!wideFrame || !compactFrame || !mobileFrame) return null;
        const variables = variant === 'canvas'
          ? canvasFrameVariables(wideFrame, wideFrame)
          : stackFrameVariables(compactFrame, mobileFrame, compactFrame, mobileFrame);
        return (
          <div
            key={group.id}
            aria-hidden
            data-section-layout-group={group.id}
            data-section-layout-group-appearance={group.appearance}
            {...(group.itemId ? { 'data-section-layout-group-item': group.itemId } : {})}
            style={variables}
          />
        );
      })}
      {[...section.elements].sort((left, right) => left.z - right.z).map((element) => {
        const fallbackFrame = frameFor(projection, fallbackBand, element.id);
        const primaryFrame = frameFor(projection, primaryBand, element.id);
        const mobileFallbackFrame = frameFor(projection, mobileFallback, element.id);
        const mobilePrimaryFrame = frameFor(projection, mobilePrimary, element.id);
        if (!fallbackFrame || !primaryFrame) return null;
        if (variant === 'stack' && (!mobileFallbackFrame || !mobilePrimaryFrame)) return null;
        const motion = plan ? motionFor(plan, section.id, element.id) : undefined;
        const dataM = motion === 'reveal' || motion === 'mask' ? motion : undefined;
        const countup = motion === 'countup' && element.kind === 'text'
          ? parseStatParts(element.text) ?? undefined
          : undefined;
        const itemIndex = itemIndexFor(projection, element.id);
        const isAtmosphericMedia = atmospheric
          && projection.items.some((item) => item.mediaElementId === element.id);
        if (atmosphericStock && isAtmosphericMedia) return null;
        const isLayoutBackdrop = projection.kind === 'directions'
          && projection.resolvedId === 'directions.full-map-overlay'
          && element.kind === 'map';
        const fontSize = primaryBand.fontSizes[element.id];
        const mobileFontSize = mobilePrimary.fontSizes[element.id];
        const layoutFontSize = variant === 'canvas'
          ? fontSize != null ? cqw(fontSize) : undefined
          : fontSize != null && mobileFontSize != null
            ? `clamp(${mobileFontSize}px,${bandLength(fontSize, 768)},${fontSize}px)`
            : undefined;
        // The adaptive scrim is solved against the semantic text token. Accent-colored
        // kickers can fall below AA on real photographs even when the main copy passes,
        // so every text foreground in this new atmospheric-stock path consumes the same
        // contrast-safe token. Non-stock and persisted legacy markup remain untouched.
        const renderedElement = atmosphericStock && element.kind === 'text'
          ? {
              ...element,
              style: {
                ...element.style,
                color: theme.palette.text,
              },
            }
          : element;
        const frameVariables = variant === 'canvas'
          ? canvasFrameVariables(fallbackFrame, primaryFrame)
          : stackFrameVariables(
              fallbackFrame,
              mobileFallbackFrame!,
              primaryFrame,
              mobilePrimaryFrame!,
            );
        return (
          <div
            key={element.id}
            data-section-layout-frame
            {...(itemIndex != null ? { 'data-section-layout-item': String(itemIndex) } : {})}
            {...(itemIndex === 0 ? { 'data-layout-active': 'true' } : {})}
            {...(dataM ? { 'data-m': dataM } : {})}
            {...(motion === 'reveal' && plan
              ? { 'data-m-delay': String(revealDelayFor(plan, section.id, element.id)) }
              : {})}
            {...(atmosphericStock && element.kind === 'text'
              ? { 'data-image-contrast-foreground': element.id }
              : {})}
            style={{
              ...frameVariables,
              zIndex: isAtmosphericMedia || isLayoutBackdrop ? 0 : Math.max(2, element.z),
              opacity: element.opacity,
              transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
              textShadow: atmospheric && element.kind === 'text'
                ? `0 1px 2px ${responsiveScrim?.overlayColor ?? scrim.overlayColor}`
                : undefined,
            }}
          >
            <ElementContent
              element={renderedElement}
              theme={theme}
              variant={variant}
              eager={isFirst}
              interactive={interactive}
              siteId={siteId}
              countup={countup}
              splitText={plan ? isSplitText(plan, section.id, element.id) : false}
              layoutFontSize={layoutFontSize}
              layoutFillFrame={element.kind === 'button'}
              runtimeDelivery={runtimeDelivery}
            />
          </div>
        );
      })}
      {projection.enhancement === 'carousel' ? (
        <div data-section-layout-controls>
          <button type="button" data-section-layout-control data-carousel-step="-1" aria-label="Previous photo">←</button>
          <button type="button" data-section-layout-control data-carousel-step="1" aria-label="Next photo">→</button>
        </div>
      ) : null}
    </section>
  );
}
