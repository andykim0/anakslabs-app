import type { CSSProperties, ReactNode } from 'react';
import type {
  CanvasElement,
  Section,
  SiteTheme,
  TextElement,
} from '@/lib/types/site';
import { fontRoleForTextElement } from '@/lib/fonts/resources';
import { resolveThemePaint } from '@/lib/design/site-theme-tokens';
import { ElementContent } from './ElementContent';

const CLINIC_FLOW_CSS = `
[data-clinic-flow-section] {
  position: relative;
  width: 100%;
  overflow: clip;
  padding-block: var(--clinic-section-block-desktop);
}
[data-clinic-flow-inner] {
  width: min(calc(100% - 3rem), var(--clinic-container-max));
  margin-inline: auto;
}
[data-clinic-flow-heading] {
  max-width: 44rem;
  margin: 0 0 var(--clinic-heading-gap);
  font-family: var(--clinic-heading-family);
  font-size: clamp(2rem, 4vw, 3.25rem);
  font-weight: var(--clinic-heading-weight);
  line-height: 1.12;
  letter-spacing: -.01em;
}
[data-clinic-flow-intro] {
  max-width: 46rem;
  margin: 0 0 var(--clinic-stack-rhythm);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  line-height: 1.7;
}
[data-clinic-flow-items] {
  display: grid;
  grid-template-columns: repeat(3,minmax(0,1fr));
  gap: var(--clinic-grid-gutter);
  align-items: start;
}
[data-clinic-flow-item] {
  min-width: 0;
  display: grid;
  gap: 1rem;
  align-content: start;
}
[data-clinic-flow-item-heading] {
  margin: 0;
  font-family: var(--clinic-heading-family);
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  font-weight: var(--clinic-heading-weight);
  line-height: 1.25;
}
[data-clinic-flow-copy] {
  margin: 0;
  font-size: clamp(1rem, 1.25vw, 1.125rem);
  line-height: 1.7;
}
[data-clinic-flow-marker] {
  color: var(--clinic-accent);
  font-family: var(--clinic-control-family);
  font-size: .875rem;
  font-weight: var(--clinic-control-weight);
  letter-spacing: .12em;
}
[data-clinic-flow-media] {
  width: 100%;
  min-width: 0;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: var(--clinic-radius-md);
}
[data-clinic-flow-media] > img,
[data-clinic-flow-media] > video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item] {
  grid-template-columns: minmax(0,1.05fr) minmax(0,.95fr);
  gap: var(--clinic-grid-gutter);
  align-items: center;
}
[data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item]:nth-child(even) [data-clinic-flow-media] {
  order: 2;
}
[data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-items],
[data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-items] {
  grid-template-columns: 1fr;
  gap: 0;
  border-top: 1px solid var(--clinic-border);
}
[data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item],
[data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item] {
  grid-template-columns: minmax(4rem,.3fr) minmax(0,1.7fr);
  gap: var(--clinic-grid-gutter);
  padding-block: 2rem;
  border-bottom: 1px solid var(--clinic-border);
}
[data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item]:first-child {
  grid-column: span 2;
}
@media (max-width: 767.98px) {
  [data-clinic-flow-section] {
    padding-block: var(--clinic-section-block-mobile);
  }
  [data-clinic-flow-inner] {
    width: min(calc(100% - 3rem), var(--clinic-container-max));
  }
  [data-clinic-flow-items],
  [data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item],
  [data-clinic-flow-section="features.numbered-list"] [data-clinic-flow-item],
  [data-clinic-flow-section="features.sticky-heading-two-column"] [data-clinic-flow-item] {
    grid-template-columns: 1fr;
  }
  [data-clinic-flow-section="features.zigzag-media"] [data-clinic-flow-item]:nth-child(even) [data-clinic-flow-media] {
    order: initial;
  }
  [data-clinic-flow-section="features.featured-first"] [data-clinic-flow-item]:first-child {
    grid-column: auto;
  }
}
`;

function textStyle(element: TextElement, theme: SiteTheme): CSSProperties {
  return {
    color: resolveThemePaint(theme, element.style.color ?? theme.palette.text, 'muted'),
    fontFamily: element.style.fontFamily === 'heading'
      ? theme.fonts.heading
      : theme.fonts.body,
    fontWeight: element.style.fontWeight,
    fontStyle: element.style.italic ? 'italic' : undefined,
    textAlign: element.style.align,
    whiteSpace: 'pre-wrap',
  };
}

function fontRole(element: TextElement, theme: SiteTheme): Record<string, string> {
  const role = theme.fontPairing ? fontRoleForTextElement(element) : undefined;
  return role ? { 'data-font-role': role } : {};
}

function FlowText({
  element,
  theme,
  role,
}: {
  element: TextElement;
  theme: SiteTheme;
  role: 'intro' | 'heading' | 'copy' | 'marker';
}) {
  const attributes = fontRole(element, theme);
  if (role === 'heading') {
    return (
      <h3
        data-clinic-flow-item-heading
        style={textStyle(element, theme)}
        {...attributes}
      >
        {element.text}
      </h3>
    );
  }
  if (role === 'marker') {
    return (
      <span
        data-clinic-flow-marker
        style={textStyle(element, theme)}
        {...attributes}
      >
        {element.text}
      </span>
    );
  }
  return (
    <p
      {...(role === 'intro'
        ? { 'data-clinic-flow-intro': true }
        : { 'data-clinic-flow-copy': true })}
      style={textStyle(element, theme)}
      {...attributes}
    >
      {element.text}
    </p>
  );
}

function isMarker(element: CanvasElement): boolean {
  return element.kind === 'text' && /(?:^|-)marker-\d+$/u.test(element.id);
}

function FlowElement({
  element,
  theme,
  isFirst,
  interactive,
  siteId,
}: {
  element: CanvasElement;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
}) {
  if (element.kind === 'text') {
    return (
      <FlowText
        element={element}
        theme={theme}
        role={isMarker(element) ? 'marker' : 'copy'}
      />
    );
  }
  if (element.kind === 'image' || element.kind === 'video') {
    return (
      <div data-clinic-flow-media>
        <ElementContent
          element={element}
          theme={theme}
          variant="stack"
          eager={isFirst}
          interactive={interactive}
          siteId={siteId}
        />
      </div>
    );
  }
  if (element.kind === 'shape' || element.kind === 'divider') return null;
  return (
    <div data-clinic-flow-control>
      <ElementContent
        element={element}
        theme={theme}
        variant="stack"
        eager={isFirst}
        interactive={interactive}
        siteId={siteId}
      />
    </div>
  );
}

function FeatureItem({
  elements,
  theme,
  isFirst,
  interactive,
  siteId,
}: {
  elements: CanvasElement[];
  theme: SiteTheme;
  isFirst?: boolean;
  interactive: boolean;
  siteId?: string;
}) {
  const heading = elements.find((element): element is TextElement => (
    element.kind === 'text' && !isMarker(element)
  ));
  const remainder = heading
    ? elements.filter((element) => element.id !== heading.id)
    : elements;
  const media = remainder.filter(
    (element) => element.kind === 'image' || element.kind === 'video',
  );
  const content = remainder.filter(
    (element) => element.kind !== 'image' && element.kind !== 'video',
  );
  return (
    <article
      data-clinic-flow-item
      data-clinic-flow-has-media={media.length > 0 ? 'true' : 'false'}
    >
      {media.map((element) => (
        <FlowElement
          key={element.id}
          element={element}
          theme={theme}
          isFirst={isFirst}
          interactive={interactive}
          siteId={siteId}
        />
      ))}
      <div data-clinic-flow-item-copy>
        {heading?.kind === 'text' ? (
          <FlowText element={heading} theme={theme} role="heading" />
        ) : null}
        {content.map((element) => (
          <FlowElement
            key={element.id}
            element={element}
            theme={theme}
            isFirst={isFirst}
            interactive={interactive}
            siteId={siteId}
          />
        ))}
      </div>
    </article>
  );
}

export function ClinicFlowSection({
  section,
  theme,
  isFirst,
  interactive = true,
  siteId,
}: {
  section: Section;
  theme: SiteTheme;
  isFirst?: boolean;
  interactive?: boolean;
  siteId?: string;
}) {
  const projection = section.sectionLayout;
  if (!projection || projection.kind !== 'features') return null;
  const elements = new Map(section.elements.map((element) => [element.id, element]));
  const itemElementIds = new Set(projection.items.flatMap((item) => item.elementIds));
  const introElements = section.elements.filter((element) => !itemElementIds.has(element.id));
  const introTitle = introElements.find((element) => element.kind === 'text');
  const introRemainder = introElements.filter((element) => element.id !== introTitle?.id);
  const sectionTitle = section.name.trim() || (
    introTitle?.kind === 'text' ? introTitle.text : 'Section'
  );
  const introNodes: ReactNode[] = [];
  if (
    introTitle?.kind === 'text'
    && introTitle.text.trim().toLocaleLowerCase('en-US')
      !== sectionTitle.toLocaleLowerCase('en-US')
  ) {
    introNodes.push(
      <FlowText key={introTitle.id} element={introTitle} theme={theme} role="intro" />,
    );
  }
  for (const element of introRemainder) {
    introNodes.push(
      <FlowElement
        key={element.id}
        element={element}
        theme={theme}
        isFirst={isFirst}
        interactive={interactive}
        siteId={siteId}
      />,
    );
  }

  return (
    <section
      id={section.id}
      data-anchor={section.id}
      data-section-type={section.type}
      data-clinic-flow-section={projection.resolvedId}
      data-clinic-archetype={projection.resolvedId}
      aria-label={section.name}
      style={{
        backgroundColor: resolveThemePaint(
          theme,
          section.background.color,
          'backgroundSubtle',
        ),
        backgroundImage: section.background.gradient,
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: CLINIC_FLOW_CSS }} />
      <div data-clinic-flow-inner>
        <h2
          data-clinic-flow-heading
          data-font-role="heading"
          style={{ color: theme.palette.text }}
        >
          {sectionTitle}
        </h2>
        {introNodes}
        <div data-clinic-flow-items>
          {projection.items.map((item) => (
            <FeatureItem
              key={item.id}
              elements={item.elementIds.flatMap((id) => {
                const element = elements.get(id);
                return element ? [element] : [];
              })}
              theme={theme}
              isFirst={isFirst}
              interactive={interactive}
              siteId={siteId}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
