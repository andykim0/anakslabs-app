import type {
  ClinicHeroLayoutDecision,
  ButtonElement,
  CanvasElement,
  ImageElement,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import {
  resolveAboutLayoutVariant,
  resolveCtaLayoutVariant,
  resolveDirectionsLayoutVariant,
  resolveFeatureLayoutVariant,
  resolveGalleryLayoutVariant,
  resolveHeroLayoutVariant,
  type AboutLayoutContent,
  type AboutLayoutVariantId,
  type CtaLayoutVariantId,
  type DirectionsLayoutContent,
  type DirectionsLayoutVariantId,
  type FeatureLayoutContent,
  type FeatureLayoutVariantId,
  type GalleryLayoutContent,
  type GalleryLayoutVariantId,
  type HeroLayoutVariantId,
} from '@/lib/layout';
import { sourceTextIsOperationalBlob } from './source-text-gates';
import { CLINIC_RADIUS_TOKENS } from '@/lib/clinic-master/tokens';
import type { ClinicMasterSourceBlock } from '@/lib/clinic-master/compiler';

const AUTHORED_FRAME = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const FEATURE_MINIMUM_ITEMS = 2;
const FEATURE_MAXIMUM_ITEMS = 6;
const GALLERY_MINIMUM_ITEMS = 2;
const GALLERY_MAXIMUM_ITEMS = 12;

export interface ClinicLayoutImage {
  id: string;
  src: string;
  alt: string;
  sourceWidth?: number;
  sourceHeight?: number;
  /** Compile-time source ranking only. Render elements never persist this value. */
  selectionScore?: number;
  textDense?: boolean;
  heroTextRegionLuminance?: number;
  heroTextZone?: {
    side: 'left' | 'right';
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ClinicLayoutContentUnit {
  id: string;
  title: ClinicMasterSourceBlock;
  body?: ClinicMasterSourceBlock;
  /** Additional source nodes that stay distinct while sharing one visual item boundary. */
  details?: readonly ClinicMasterSourceBlock[];
  /** Resolver-required title binding rendered as body copy for short/non-semantic fragments. */
  titleAsCopy?: boolean;
  marker?: {
    source: ClinicMasterSourceBlock;
    text: string;
  };
  image?: ClinicLayoutImage;
  href?: string;
  /** Renderer chrome only. Factual item copy remains source-owned. */
  actionLabel?: string;
}

export function buildClinicHeroSection(input: {
  id: string;
  name?: string;
  title: ClinicMasterSourceBlock;
  lead?: ClinicMasterSourceBlock;
  articleEvidence?: {
    author: ClinicMasterSourceBlock;
    authorLabel?: ClinicMasterSourceBlock;
    dateModified?: string;
    /** Optional verbatim visible date. The normalized dateModified remains schema-only evidence. */
    visibleDate?: ClinicMasterSourceBlock;
    dateLabel?: ClinicMasterSourceBlock;
  };
  theme: SiteTheme;
  image?: ClinicLayoutImage;
  /** KO contract-import opt-in. Other clinic masters retain their byte-stable 0.78 pin. */
  enforceHeroContrast?: boolean;
  requestedId?: HeroLayoutVariantId;
  /**
   * [D2] Present only on the en-US demo compile. Its presence is the renderer's entire switch, so
   * it also turns off the scrim data this hero will never use.
   */
  clinicHeroLayout?: ClinicHeroLayoutDecision;
}): Section {
  const title = sourceText(input.title, 'hero-title', input.theme, 'lead');
  const lead = input.lead
    ? sourceText(input.lead, 'hero-sub', input.theme, 'body')
    : undefined;
  const section = baseSection({
    id: input.id,
    type: 'hero',
    name: input.name ?? 'Introduction',
    theme: input.theme,
    elements: [title, ...(lead ? [lead] : [])],
  });
  if (input.image) {
    const rawContrast = input.enforceHeroContrast
      && input.image.heroTextRegionLuminance !== undefined
      ? wcagContrast(
          input.image.heroTextRegionLuminance,
          relativeLuminance(input.theme.palette.text),
        )
      : 0;
    section.background.image = {
      src: input.image.src,
      overlayColor: input.theme.palette.background,
      /**
       * The legacy clinic contract remains 0.78. KO contract import explicitly opts into
       * generation-time evidence and a fail-closed stronger scrim when raw AA is unknown.
       *
       * [D2] A hero carrying a layout decision omits it entirely. Neither new mode washes its
       * photograph, and on the en-US path this number was never read anyway — only the ko-KR
       * renderer turns it into --clinic-hero-overlay-opacity. Emitting it there is load-bearing;
       * emitting it here was dead data that read like a scrim nobody could find.
       */
      ...(input.clinicHeroLayout
        ? {}
        : {
            overlayOpacity: input.enforceHeroContrast
              ? (rawContrast >= 4.5 ? 0.78 : 0.94)
              : 0.78,
          }),
    };
  }
  const resolved = resolveHeroLayoutVariant({
    requestedId: input.requestedId ?? 'hero.split-left',
    section,
    theme: input.theme,
    availableMedia: {
      image: Boolean(input.image),
      video: false,
      poster: false,
      referentialImage: Boolean(input.image),
      atmosphericBackdrop: Boolean(input.image),
    },
  });
  /**
   * [D2] Unrelated to clinicHeroLayout above. This projection is consumed by SectionCanvas, which
   * clinic pages never reach, so on a clinic hero its resolvedId is inert and describes no
   * geometry that renders. It stays because an existing contract test pins it and the flow
   * renderer reads it for a data attribute; the new hero path ignores it entirely.
   */
  section.heroLayout = resolved.projection;
  const heroTextZoneElement: CanvasElement | undefined = input.image?.heroTextZone
    ? (() => {
    const zone = input.image.heroTextZone;
    return {
      id: [
        input.id,
        'hero-text-zone',
        zone.side,
        `x${Math.round(zone.x * 10_000)}`,
        `y${Math.round(zone.y * 10_000)}`,
        `w${Math.round(zone.width * 10_000)}`,
        `h${Math.round(zone.height * 10_000)}`,
      ].join('-'),
      kind: 'shape',
      shape: 'rect',
      frame: AUTHORED_FRAME,
      z: 0,
      style: {},
      entrance: { effect: 'none' },
    };
  })()
    : undefined;
  const articleEvidence = input.articleEvidence
    ? [
        sourceText(input.articleEvidence.author, 'article-author', input.theme, 'body'),
        input.articleEvidence.authorLabel
          ? sourceText(
              input.articleEvidence.authorLabel,
              'article-author-label',
              input.theme,
              'body',
            )
          : undefined,
        input.articleEvidence.visibleDate && input.articleEvidence.dateModified
          ? sourceText(
              input.articleEvidence.visibleDate,
              `article-date-iso-${clinicDate(input.articleEvidence.dateModified)}`,
              input.theme,
              'body',
            )
          : input.articleEvidence.dateModified
            ? layoutText(
              `${input.id}-article-date`,
              clinicDate(input.articleEvidence.dateModified),
              input.theme,
              'caption',
            )
            : undefined,
        input.articleEvidence.dateLabel
          ? sourceText(
              input.articleEvidence.dateLabel,
              'article-date-label',
              input.theme,
              'body',
            )
          : undefined,
      ]
        .filter((element): element is TextElement => Boolean(element))
    : [];
  section.elements = [
    ...resolved.elements,
    ...articleEvidence,
    ...(heroTextZoneElement ? [heroTextZoneElement] : []),
  ];
  section.height = resolved.height;
  if (input.clinicHeroLayout) section.clinicHeroLayout = input.clinicHeroLayout;
  return section;
}

function relativeLuminance(value: string): number {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(value);
  if (!match) return 0;
  const channel = (hex: string) => {
    const normalized = Number.parseInt(hex, 16) / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(match[1])
    + 0.7152 * channel(match[2])
    + 0.0722 * channel(match[3])
  );
}

function wcagContrast(left: number, right: number): number {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

function clinicDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error('CLINIC_ARTICLE_DATE_INVALID');
  }
  return value;
}

function layoutText(
  id: string,
  text: string,
  theme: SiteTheme,
  role: 'title' | 'lead' | 'body' | 'caption',
): TextElement {
  const style = role === 'title'
    ? {
        fontSize: 48,
        fontWeight: 600,
        fontFamily: 'heading' as const,
        color: theme.palette.text,
        lineHeight: 1.2,
      }
    : role === 'lead'
      ? {
          fontSize: 22,
          fontWeight: 600,
          fontFamily: 'heading' as const,
          color: theme.palette.text,
          lineHeight: 1.35,
        }
      : role === 'caption'
        ? {
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'body' as const,
            color: theme.palette.primary,
            lineHeight: 1.4,
          }
        : {
            fontSize: 17,
            fontWeight: 400,
            fontFamily: 'body' as const,
            color: theme.palette.text,
            lineHeight: 1.7,
          };
  return {
    id,
    kind: 'text',
    frame: AUTHORED_FRAME,
    z: 2,
    text,
    style,
    entrance: { effect: 'none' },
  };
}

function sourceText(
  block: ClinicMasterSourceBlock,
  suffix: string,
  theme: SiteTheme,
  role: 'lead' | 'body' | 'caption',
): TextElement {
  return layoutText(`source-${block.id}-${suffix}`, block.text, theme, role);
}

export function buildClinicSourceMetadataElements(
  blocks: readonly ClinicMasterSourceBlock[],
  theme: SiteTheme,
): TextElement[] {
  return blocks.map((block) => (
    sourceText(block, 'source-breadcrumb-metadata', theme, 'body')
  ));
}

function sourceFragmentText(
  block: ClinicMasterSourceBlock,
  fragment: string,
  suffix: string,
  theme: SiteTheme,
): TextElement {
  if (!block.text.includes(fragment) || fragment.trim().length === 0) {
    throw new Error(`CLINIC_SOURCE_FRAGMENT_INVALID:${block.id}`);
  }
  return layoutText(`source-${block.id}-${suffix}`, fragment, theme, 'caption');
}

function layoutImage(image: ClinicLayoutImage, suffix: string): ImageElement {
  return {
    id: `source-image-${image.id}-${suffix}`,
    kind: 'image',
    src: image.src,
    alt: image.alt,
    frame: AUTHORED_FRAME,
    z: 1,
    style: {
      objectFit: 'cover',
      borderRadius: CLINIC_RADIUS_TOKENS.md,
      shadow: false,
    },
    entrance: { effect: 'none' },
  };
}

function baseSection(input: {
  id: string;
  type: Section['type'];
  name: string;
  theme: SiteTheme;
  elements: CanvasElement[];
  surface?: boolean;
}): Section {
  return {
    id: input.id,
    type: input.type,
    name: input.name,
    height: 1,
    layout: 'canvas',
    background: {
      color: input.surface ? input.theme.palette.surface : input.theme.palette.background,
    },
    elements: input.elements,
  };
}

/**
 * Catalog contracts accept 2..6 items. Split deterministically without ever leaving a one-item
 * tail: seven becomes 5+2, thirteen becomes 6+5+2.
 */
export function clinicFeatureGroups<T>(
  items: readonly T[],
  maximumItems = FEATURE_MAXIMUM_ITEMS,
): T[][] {
  const groups: T[][] = [];
  let cursor = 0;
  while (items.length - cursor > maximumItems) {
    const remaining = items.length - cursor;
    const take = remaining - maximumItems === 1
      ? maximumItems - 1
      : maximumItems;
    groups.push(items.slice(cursor, cursor + take));
    cursor += take;
  }
  if (cursor < items.length) groups.push(items.slice(cursor));
  return groups;
}

function resolveFeature(
  candidates: readonly FeatureLayoutVariantId[],
  section: Section,
  theme: SiteTheme,
  content: FeatureLayoutContent,
) {
  for (const requestedId of candidates) {
    const projection = resolveFeatureLayoutVariant({
      requestedId,
      elements: section.elements,
      theme,
      content,
    });
    if (projection) return projection;
  }
  return null;
}

export function buildClinicFeatureSections(input: {
  id: string;
  name: string;
  units: readonly ClinicLayoutContentUnit[];
  theme: SiteTheme;
  candidates: readonly FeatureLayoutVariantId[];
  titleSourceIdPrefix?: string;
  numbered?: boolean;
  numberOffset?: number;
  surface?: boolean;
  maximumItems?: number;
  allowSingleFeature?: boolean;
}): Section[] {
  if (input.units.length === 0) return [];
  if (input.units.length < FEATURE_MINIMUM_ITEMS && !input.allowSingleFeature) {
    const unit = input.units[0];
    return [buildClinicAboutSection({
      id: `${input.id}-single`,
      name: input.name,
      theme: input.theme,
      statement: unit.title,
      body: unit.body ? [unit.body] : [],
      ...(unit.image ? { image: unit.image } : {}),
      surface: input.surface,
      statementSourceIdPrefix: input.titleSourceIdPrefix,
      candidates: ['about.split-left', 'about.heading-body-columns'],
    })];
  }
  const maximumItems = input.maximumItems ?? FEATURE_MAXIMUM_ITEMS;
  const groups = clinicFeatureGroups(input.units, maximumItems);
  const title = layoutText(
    `${input.id}-layout-title`,
    input.name,
    input.theme,
    'title',
  );
  const elements: CanvasElement[] = [title];
  let globalIndex = 0;
  const detailIdsByItem = new Map<string, string[]>();
  const items = groups.flatMap((units, groupIndex) => (
    units.map((unit) => {
      const index = globalIndex;
      globalIndex += 1;
      const unitSuffix = `${groupIndex}-${index}`;
      const itemTitle = sourceText(
        unit.title,
        `${input.titleSourceIdPrefix ?? 'layout-title'}-${
          unit.titleAsCopy ? 'clinic-route-caption-only-' : ''
        }${unitSuffix}`,
        input.theme,
        unit.titleAsCopy ? 'caption' : 'lead',
      );
      elements.push(itemTitle);
      const body = unit.body
        ? sourceText(unit.body, `layout-body-${unitSuffix}`, input.theme, 'body')
        : undefined;
      if (body) elements.push(body);
      const details = (unit.details ?? []).map((detail, detailIndex) => (
        sourceText(
          detail,
          `layout-detail-${unitSuffix}-${detailIndex}`,
          input.theme,
          'body',
        )
      ));
      elements.push(...details);
      if (details.length > 0) detailIdsByItem.set(unit.id, details.map((detail) => detail.id));
      const marker = unit.marker
        ? sourceFragmentText(
            unit.marker.source,
            unit.marker.text,
            `layout-marker-${unitSuffix}`,
            input.theme,
          )
        : input.numbered
          ? layoutText(
            `${input.id}-marker-${index}`,
            String(index + 1 + (input.numberOffset ?? 0))
              .padStart(2, '0'),
            input.theme,
            'caption',
          )
          : undefined;
      if (marker) elements.push(marker);
      const media = unit.image ? layoutImage(unit.image, `layout-${unitSuffix}`) : undefined;
      if (media) elements.push(media);
      const cta: ButtonElement | undefined = unit.href
        ? {
            id: `${input.id}-item-link-${index}`,
            kind: 'button',
            label: unit.actionLabel ?? 'View treatment',
            href: unit.href,
            frame: AUTHORED_FRAME,
            z: 2,
            style: {
              variant: 'ghost',
              color: input.theme.palette.primary,
              textColor: input.theme.palette.primary,
              fontSize: 15,
              borderRadius: CLINIC_RADIUS_TOKENS.md,
            },
            entrance: { effect: 'none' },
          }
        : undefined;
      if (cta) elements.push(cta);
      return {
        id: unit.id,
        titleId: itemTitle.id,
        ...(body ? { bodyId: body.id } : {}),
        ...(marker ? { markerId: marker.id } : {}),
        ...(media ? { mediaId: media.id } : {}),
        ...(cta ? { ctaId: cta.id } : {}),
      };
    })
  ));
  const section = baseSection({
    id: input.id,
    type: 'features',
    name: input.name,
    theme: input.theme,
    elements,
    surface: input.surface,
  });
  const projection = resolveFeature(input.candidates, section, input.theme, {
    intro: { titleId: title.id },
    items,
    ...(groups.length > 1
      ? {
          groups: groups.map((units, groupIndex) => ({
            id: `${input.id}-${groupIndex + 1}`,
            itemIds: units.map((unit) => unit.id),
          })),
        }
      : {}),
  });
  if (!projection) {
    throw new Error(`CLINIC_FEATURE_LAYOUT_UNRESOLVED:${input.id}:${input.units.length}`);
  }
  section.sectionLayout = detailIdsByItem.size > 0
    ? {
        ...projection,
        items: projection.items.map((item) => ({
          ...item,
          elementIds: [
            ...item.elementIds,
            ...(detailIdsByItem.get(item.id) ?? []),
          ],
        })),
      }
    : projection;
  if (projection.surfaceTone) section.surfaceTone = projection.surfaceTone;
  section.height = projection.bands.wide.sectionHeight;
  return [section];
}

export function buildClinicAboutSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  statement: ClinicMasterSourceBlock;
  body: readonly ClinicMasterSourceBlock[];
  facts?: readonly ClinicMasterSourceBlock[];
  image?: ClinicLayoutImage;
  surface?: boolean;
  candidates?: readonly AboutLayoutVariantId[];
  sourceRole?: 'provider';
  statementIsProviderName?: boolean;
  statementSourceIdPrefix?: string;
}): Section {
  const title = layoutText(`${input.id}-layout-title`, input.name, input.theme, 'title');
  const statement = sourceText(
    input.statement,
    input.sourceRole === 'provider'
      ? input.statementIsProviderName
        ? 'provider-name'
        : 'provider-bio'
      : input.statementSourceIdPrefix ?? 'about-statement',
    input.theme,
    'lead',
  );
  const body = input.body.map((block, index) => (
    sourceText(
      block,
      input.sourceRole === 'provider' ? `provider-bio-${index}` : `about-body-${index}`,
      input.theme,
      'body',
    )
  ));
  const facts = (input.facts ?? []).map((block, index) => (
    sourceText(
      block,
      input.sourceRole === 'provider'
        ? `provider-credential-${index}`
        : `about-fact-${index}`,
      input.theme,
      'body',
    )
  ));
  const media = input.image ? layoutImage(input.image, 'about-media') : undefined;
  const elements: CanvasElement[] = [
    title,
    statement,
    ...body,
    ...facts,
    ...(media ? [media] : []),
  ];
  const section = baseSection({
    id: input.id,
    type: 'about',
    name: input.name,
    theme: input.theme,
    elements,
    surface: input.surface,
  });
  const content: AboutLayoutContent = {
    intro: { titleId: title.id },
    about: {
      id: `${input.id}-about`,
      statementId: statement.id,
      bodyIds: body.map((element) => element.id),
      factIds: facts.map((element) => element.id),
      ...(media ? { mediaId: media.id } : {}),
    },
  };
  const candidates = input.candidates ?? ['about.split-left', 'about.heading-body-columns'];
  for (const requestedId of candidates) {
    const projection = resolveAboutLayoutVariant({
      requestedId,
      elements,
      theme: input.theme,
      content,
      availableMedia: {
        referential: Boolean(media),
        atmospheric: false,
      },
    });
    if (!projection) continue;
    section.sectionLayout = projection;
    section.height = projection.bands.wide.sectionHeight;
    return section;
  }
  throw new Error(`CLINIC_ABOUT_LAYOUT_UNRESOLVED:${input.id}`);
}

export function buildClinicGallerySections(input: {
  id: string;
  name: string;
  images: readonly ClinicLayoutImage[];
  theme: SiteTheme;
  candidates?: readonly GalleryLayoutVariantId[];
  surface?: boolean;
  /** Optional deterministic compiler chrome for split groups; source media remains unchanged. */
  groupName?: (groupIndex: number) => string;
}): Section[] {
  if (input.images.length < GALLERY_MINIMUM_ITEMS) return [];
  const result: Section[] = [];
  const imageGroups = clinicFeatureGroups(input.images, GALLERY_MAXIMUM_ITEMS);
  for (const [groupIndex, images] of imageGroups.entries()) {
    const suffix = groupIndex === 0 ? '' : `-${groupIndex + 1}`;
    const groupName = input.groupName?.(groupIndex) ?? input.name;
    const title = layoutText(
      `${input.id}${suffix}-layout-title`,
      groupName,
      input.theme,
      'title',
    );
    const media = images.map((image, index) => layoutImage(
      image,
      `gallery-${groupIndex}-${index}`,
    ));
    const elements: CanvasElement[] = [title, ...media];
    const section = baseSection({
      id: `${input.id}${suffix}`,
      type: 'gallery',
      name: groupName,
      theme: input.theme,
      elements,
      surface: input.surface,
    });
    const content: GalleryLayoutContent = {
      intro: { titleId: title.id },
      items: media.map((element, index) => ({
        id: `gallery-${groupIndex}-${index}`,
        mediaId: element.id,
        ...(images[index].sourceWidth && images[index].sourceHeight
          ? {
              sourceWidth: images[index].sourceWidth,
              sourceHeight: images[index].sourceHeight,
            }
          : {}),
      })),
    };
    const candidates = input.candidates ?? ['gallery.uniform-grid', 'gallery.masonry'];
    let resolved = false;
    for (const requestedId of candidates) {
      const projection = resolveGalleryLayoutVariant({
        requestedId,
        elements,
        theme: input.theme,
        content,
      });
      if (!projection) continue;
      section.sectionLayout = projection;
      section.height = projection.bands.wide.sectionHeight;
      resolved = true;
      break;
    }
    if (!resolved) {
      throw new Error(`CLINIC_GALLERY_LAYOUT_UNRESOLVED:${input.id}:${images.length}`);
    }
    result.push(section);
  }
  return result;
}

export function buildClinicDirectionsSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  rows: readonly {
    id: string;
    label: string;
    value: ClinicMasterSourceBlock;
  }[];
  googleMapsUrl?: string;
  surface?: boolean;
  candidates?: readonly DirectionsLayoutVariantId[];
}): Section | null {
  const rows = input.rows.slice(0, 4);
  if (rows.length === 0) return null;
  const title = layoutText(`${input.id}-layout-title`, input.name, input.theme, 'title');
  const elements: CanvasElement[] = [title];
  const bindings = rows.map((row, index) => {
    const label = layoutText(
      `${input.id}-directions-label-${index}`,
      row.label,
      input.theme,
      'caption',
    );
    const value = sourceText(row.value, `directions-value-${index}`, input.theme, 'body');
    elements.push(label, value);
    return { id: row.id, labelId: label.id, valueId: value.id };
  });
  const placeLink: ButtonElement | undefined = input.googleMapsUrl
    ? {
        id: `${input.id}-directions-place-link`,
        kind: 'button',
        label: 'View on Google Maps',
        href: input.googleMapsUrl,
        frame: AUTHORED_FRAME,
        z: 2,
        style: {
          variant: 'outline',
          color: input.theme.palette.primary,
          textColor: input.theme.palette.primary,
          fontSize: 16,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
        },
        entrance: { effect: 'none' },
      }
    : undefined;
  if (placeLink) elements.push(placeLink);
  const section = baseSection({
    id: input.id,
    type: 'contact',
    name: input.name,
    theme: input.theme,
    elements,
    surface: input.surface,
  });
  const content: DirectionsLayoutContent = {
    intro: { titleId: title.id },
    mode: 'full',
    rows: bindings,
    ...(placeLink ? { placeLinkId: placeLink.id } : {}),
  };
  const candidates = input.candidates ?? ['directions.info-card-stack'];
  for (const requestedId of candidates) {
    const projection = resolveDirectionsLayoutVariant({
      requestedId,
      elements,
      theme: input.theme,
      content,
    });
    if (!projection) continue;
    section.sectionLayout = projection;
    section.height = projection.bands.wide.sectionHeight;
    return section;
  }
  throw new Error(`CLINIC_DIRECTIONS_LAYOUT_UNRESOLVED:${input.id}:${rows.length}`);
}

/**
 * Product-owned notices and aggregate projections still use the shared information-card
 * geometry, but never masquerade as testimonial content or source-manifest facts.
 */
export function buildClinicProductInfoSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  rows: readonly { label: string; value: string }[];
  action?: { label: string; href: string };
  surface?: boolean;
}): Section | null {
  const rows = input.rows.slice(0, 4);
  if (rows.length === 0) return null;
  const title = layoutText(`${input.id}-layout-title`, input.name, input.theme, 'title');
  const elements: CanvasElement[] = [title];
  const bindings = rows.map((row, index) => {
    const label = layoutText(
      `${input.id}-info-label-${index}`,
      row.label,
      input.theme,
      'caption',
    );
    const value = layoutText(
      `${input.id}-info-value-${index}`,
      row.value,
      input.theme,
      'body',
    );
    elements.push(label, value);
    return {
      id: `${input.id}-info-${index}`,
      labelId: label.id,
      valueId: value.id,
    };
  });
  const action: ButtonElement | undefined = input.action
    ? {
        id: `${input.id}-info-action`,
        kind: 'button',
        label: input.action.label,
        href: input.action.href,
        frame: AUTHORED_FRAME,
        z: 2,
        style: {
          variant: 'outline',
          color: input.theme.palette.primary,
          textColor: input.theme.palette.primary,
          fontSize: 16,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
        },
        entrance: { effect: 'none' },
      }
    : undefined;
  if (action) elements.push(action);
  const section = baseSection({
    id: input.id,
    type: 'custom',
    name: input.name,
    theme: input.theme,
    elements,
    surface: input.surface,
  });
  const projection = resolveDirectionsLayoutVariant({
    requestedId: 'directions.info-card-stack',
    elements,
    theme: input.theme,
    content: {
      intro: { titleId: title.id },
      mode: 'full',
      rows: bindings,
      ...(action ? { placeLinkId: action.id } : {}),
    },
  });
  if (!projection) {
    throw new Error(`CLINIC_PRODUCT_INFO_LAYOUT_UNRESOLVED:${input.id}:${rows.length}`);
  }
  section.sectionLayout = projection;
  section.height = projection.bands.wide.sectionHeight;
  return section;
}

export function buildClinicCtaSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  title: ClinicMasterSourceBlock;
  href: string;
  phoneHref?: string;
  candidates?: readonly CtaLayoutVariantId[];
}): Section {
  const title = sourceText(input.title, 'cta-title', input.theme, 'lead');
  const primary: ButtonElement = {
    id: `${input.id}-cta-primary`,
    kind: 'button',
    label: 'Book Appointment',
    href: input.href,
    frame: AUTHORED_FRAME,
    z: 2,
    style: {
      variant: 'solid',
      color: input.theme.palette.primary,
      textColor: '#FFFFFF',
      fontSize: 16,
      borderRadius: CLINIC_RADIUS_TOKENS.md,
    },
    entrance: { effect: 'none' },
  };
  const secondary: ButtonElement | undefined = input.phoneHref
    ? {
        id: `${input.id}-cta-secondary`,
        kind: 'button',
        label: 'Call',
        href: input.phoneHref,
        frame: AUTHORED_FRAME,
        z: 2,
        style: {
          variant: 'outline',
          color: input.theme.palette.primary,
          textColor: input.theme.palette.primary,
          fontSize: 16,
          borderRadius: CLINIC_RADIUS_TOKENS.md,
        },
        entrance: { effect: 'none' },
      }
    : undefined;
  const elements: CanvasElement[] = [title, primary, ...(secondary ? [secondary] : [])];
  const section = baseSection({
    id: input.id,
    type: 'cta',
    name: input.name,
    theme: input.theme,
    elements,
    surface: true,
  });
  const candidates = input.candidates ?? ['cta.split-action', 'cta.fullwidth-band'];
  for (const requestedId of candidates) {
    const projection = resolveCtaLayoutVariant({
      requestedId,
      elements,
      theme: input.theme,
      content: {
        intro: { titleId: title.id },
        primaryActionId: primary.id,
        ...(secondary ? { secondaryActionId: secondary.id } : {}),
      },
    });
    if (!projection) continue;
    section.sectionLayout = projection;
    section.height = projection.bands.wide.sectionHeight;
    return section;
  }
  throw new Error(`CLINIC_CTA_LAYOUT_UNRESOLVED:${input.id}`);
}

export function buildClinicFaqSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  items: readonly {
    question: ClinicMasterSourceBlock;
    answer?: ClinicMasterSourceBlock;
  }[];
}): Section | null {
  const items = input.items
    .filter((item): item is { question: ClinicMasterSourceBlock; answer: ClinicMasterSourceBlock } => (
      Boolean(item.answer)
      && /[?？]\s*$/u.test(item.question.text)
      && !sourceTextIsOperationalBlob(item.question.text, item.answer?.text)
    ))
    .slice(0, 8);
  if (items.length < 3) return null;
  const section = buildClinicFeatureSections({
    id: input.id,
    name: input.name,
    theme: input.theme,
    units: items.map((item) => ({
      id: `clinic-faq-item-${item.question.id}`,
      title: item.question,
      body: item.answer,
    })),
    candidates: ['features.faq-accordion'],
    maximumItems: 8,
  })[0];
  section.type = 'faq';
  return section;
}

export function buildClinicStatStripSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  units: readonly ClinicLayoutContentUnit[];
}): Section | null {
  const units = input.units
    .filter((unit) => Boolean(unit.marker && unit.title.text.includes(unit.marker.text)))
    .slice(0, 4);
  if (units.length < 2) return null;
  return buildClinicFeatureSections({
    id: input.id,
    name: input.name,
    theme: input.theme,
    units,
    candidates: ['features.stat-strip'],
    maximumItems: 4,
  })[0];
}

export function buildClinicDarkValueBandSection(input: {
  id: string;
  name: string;
  theme: SiteTheme;
  statement: ClinicLayoutContentUnit;
}): Section {
  return buildClinicFeatureSections({
    id: input.id,
    name: input.name,
    theme: input.theme,
    units: [input.statement],
    candidates: ['features.dark-value-band'],
    maximumItems: 1,
    allowSingleFeature: true,
  })[0];
}
