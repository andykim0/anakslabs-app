import type { CSSProperties } from 'react';
import type {
  ButtonElement,
  CanvasElement,
  ImageElement,
  Section,
  ShapeElement,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { resolveThemePaint, themeColor, themeRadius } from '@/lib/design/site-theme-tokens';
import { cqw } from './scale';
import { ElementContent, type RenderVariant } from './ElementContent';

type TeaserRole = 'card' | 'thumb' | 'title' | 'desc' | 'link';

interface UniformTeaserCard {
  index: number;
  surface: ShapeElement;
  thumb: ImageElement | ShapeElement;
  title: TextElement;
  desc: TextElement;
  link: ButtonElement;
}

const ROLE_PATTERN = /(?:^|-)teaser-(card|thumb|title|desc|link)-v2-(\d+)(?:-|$)/u;

const RESPONSIVE_GRID_CSS = `
@container (min-width: 640px) {
  [data-uniform-teaser-section][data-uniform-teaser-layout="responsive"] {
    --uniform-teaser-row: 360px;
    --uniform-teaser-card-height: 100%;
  }
}
`;

function roleOf(element: CanvasElement): { role: TeaserRole; index: number } | undefined {
  const match = ROLE_PATTERN.exec(element.id);
  if (!match) return undefined;
  return { role: match[1] as TeaserRole, index: Number(match[2]) };
}

export function uniformTeaserCards(section: Section): UniformTeaserCard[] | undefined {
  if (section.id !== 'sec-home-teaser') return undefined;
  const groups = new Map<number, Partial<Record<TeaserRole, CanvasElement>>>();
  for (const element of section.elements) {
    const match = roleOf(element);
    if (!match) continue;
    const group = groups.get(match.index) ?? {};
    group[match.role] = element;
    groups.set(match.index, group);
  }
  if (groups.size === 0) return undefined;
  const cards: UniformTeaserCard[] = [];
  for (const [index, group] of [...groups].sort(([a], [b]) => a - b)) {
    if (
      group.card?.kind !== 'shape' ||
      (group.thumb?.kind !== 'image' && group.thumb?.kind !== 'shape') ||
      group.title?.kind !== 'text' ||
      group.desc?.kind !== 'text' ||
      group.link?.kind !== 'button'
    ) return undefined;
    cards.push({
      index,
      surface: group.card,
      thumb: group.thumb,
      title: group.title,
      desc: group.desc,
      link: group.link,
    });
  }
  return cards;
}

export function isUniformTeaserSection(section: Section): boolean {
  return Boolean(uniformTeaserCards(section)?.length);
}

function length(value: string | number, variant: RenderVariant): string {
  if (typeof value === 'string') return value;
  return variant === 'canvas' ? cqw(value) : `${value}px`;
}

function ProceduralThumbnail({ theme }: { theme: SiteTheme }) {
  return (
    <div
      aria-hidden
      data-teaser-procedural-thumbnail="true"
      style={{
        width: '100%',
        height: '100%',
        background: `
          radial-gradient(circle at 78% 24%, color-mix(in srgb, ${theme.palette.accent} 42%, transparent) 0, transparent 29%),
          radial-gradient(circle at 18% 82%, color-mix(in srgb, ${theme.palette.primary} 28%, transparent) 0, transparent 34%),
          linear-gradient(138deg, ${themeColor(theme, 'surfaceSubtle')}, color-mix(in srgb, ${theme.palette.primary} 18%, ${themeColor(theme, 'backgroundSubtle')}))
        `,
      }}
    />
  );
}

export function UniformTeaserGrid({
  section,
  theme,
  variant,
  interactive,
  animate,
}: {
  section: Section;
  theme: SiteTheme;
  variant: RenderVariant;
  interactive: boolean;
  animate: boolean;
}) {
  const cards = uniformTeaserCards(section);
  if (!cards) return null;
  const intro = section.elements
    .filter((element) => !roleOf(element) && element.kind === 'text')
    .sort((a, b) => a.frame.y - b.frame.y) as TextElement[];
  const canvas = variant === 'canvas';
  const radius = length(themeRadius(theme, 'soft', theme.radius ?? 4), variant);
  const sectionStyle: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    minHeight: canvas ? cqw(section.height) : undefined,
    backgroundColor: resolveThemePaint(theme, section.background.color, 'backgroundSubtle'),
    backgroundImage: section.background.gradient,
    padding: canvas
      ? `${cqw(96)} ${cqw(120)} ${cqw(80)}`
      : theme.tokens
        ? `${theme.tokens.spacing.sectionBlock} ${theme.tokens.spacing.sectionInline}`
        : '64px 24px',
  };

  return (
    <section
      {...(canvas ? { id: section.id } : { 'data-anchor': section.id })}
      data-section-type={section.type}
      data-uniform-teaser-section="true"
      data-uniform-teaser-layout={canvas ? 'canvas' : 'responsive'}
      aria-label={section.name}
      style={sectionStyle}
    >
      {!canvas && <style>{RESPONSIVE_GRID_CSS}</style>}
      <div style={{ width: '100%', maxWidth: canvas ? cqw(1200) : '960px', margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gap: canvas ? cqw(12) : '12px',
            marginBottom: canvas ? cqw(54) : '40px',
          }}
        >
          {intro.map((element) => (
            <div key={element.id} style={{ minHeight: canvas ? cqw(element.frame.h) : undefined }}>
              <ElementContent element={element} theme={theme} variant={variant} interactive={interactive} />
            </div>
          ))}
        </div>
        <div
          data-uniform-teaser-grid="true"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
            gridAutoRows: canvas ? cqw(340) : 'var(--uniform-teaser-row, auto)',
            gap: canvas ? cqw(38) : '24px',
            alignItems: 'stretch',
          }}
        >
          {cards.map((card) => (
            <div
              key={card.index}
              data-uniform-teaser-card={String(card.index)}
              {...(animate ? {
                'data-m': 'reveal',
                'data-m-delay': String((card.index - 1) * 70),
              } : {})}
              style={{
                minWidth: 0,
                height: canvas ? '100%' : 'var(--uniform-teaser-card-height, auto)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: resolveThemePaint(theme, card.surface.style.fill, 'surfaceStrong'),
                border: `1px solid ${themeColor(theme, 'border')}`,
                borderRadius: radius,
                boxShadow: theme.tokens?.shadow.low,
              }}
            >
              <div
                data-uniform-teaser-thumbnail={card.thumb.kind === 'image' ? 'image' : 'procedural'}
                style={{ width: '100%', aspectRatio: '12 / 5', flex: '0 0 auto', overflow: 'hidden' }}
              >
                {card.thumb.kind === 'image' ? (
                  <ElementContent element={card.thumb} theme={theme} variant={variant} interactive={interactive} />
                ) : (
                  <ProceduralThumbnail theme={theme} />
                )}
              </div>
              <div
                data-uniform-teaser-card-body="true"
                style={{
                  minHeight: 0,
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: canvas ? 'flex-start' : 'center',
                  padding: canvas ? `${cqw(20)} ${cqw(28)} ${cqw(18)}` : '20px 24px 22px',
                }}
              >
                <div style={{ width: '100%', minHeight: canvas ? cqw(32) : '32px' }}>
                  <ElementContent element={card.title} theme={theme} variant={variant} interactive={interactive} />
                </div>
                <div
                  data-uniform-teaser-description="true"
                  style={{ width: '100%', minHeight: canvas ? cqw(46) : '48px', marginTop: canvas ? cqw(6) : '6px' }}
                >
                  <ElementContent element={card.desc} theme={theme} variant={variant} interactive={interactive} />
                </div>
                <div
                  data-uniform-teaser-cta="true"
                  style={{
                    width: canvas ? cqw(150) : 'fit-content',
                    height: canvas ? cqw(40) : undefined,
                    marginTop: canvas ? 'auto' : '12px',
                  }}
                >
                  <ElementContent element={card.link} theme={theme} variant={variant} interactive={interactive} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
