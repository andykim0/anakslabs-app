import type { Section, SiteTheme } from '@/lib/types/site';
import type { ReactElement } from 'react';
import { safeMediaSrc } from '@/lib/safe-url';
import { resolveThemePaint } from '@/lib/design/site-theme-tokens';

const CLINIC_INSURANCE_STRIP_ID = 'clinic-accepted-insurance';

export function isClinicInsuranceStripSection(section: Section): boolean {
  return section.id === CLINIC_INSURANCE_STRIP_ID
    && section.type === 'custom'
    && section.elements.some((element) => element.kind === 'image');
}

export function ClinicInsuranceStrip(input: {
  section: Section;
  theme: SiteTheme;
  variant: 'canvas' | 'stack';
}): ReactElement {
  const title = input.section.elements.find(
    (element) => element.kind === 'text' && element.id.endsWith('-title'),
  );
  const logos = input.section.elements.filter((element) => element.kind === 'image');
  const compact = input.variant === 'stack';
  return (
    <section
      id={compact ? undefined : input.section.id}
      data-anchor={compact ? input.section.id : undefined}
      data-section-type={input.section.type}
      data-clinic-insurance-strip
      aria-label={input.section.name}
      style={{
        backgroundColor: resolveThemePaint(
          input.theme,
          input.section.background.color,
          'backgroundSubtle',
        ),
        padding: compact ? '56px 24px' : '88px clamp(40px,8.333vw,120px)',
      }}
    >
      {title?.kind === 'text' ? (
        <h2
          style={{
            margin: 0,
            color: title.style.color ?? input.theme.palette.text,
            fontFamily: input.theme.fonts.heading,
            fontSize: compact ? 30 : 40,
            fontWeight: title.style.fontWeight ?? 600,
            lineHeight: 1.2,
          }}
        >
          {title.text}
        </h2>
      ) : null}
      <div
        data-clinic-insurance-logo-grid
        style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(2,minmax(0,1fr))'
            : 'repeat(auto-fit,minmax(148px,1fr))',
          gap: compact ? 12 : 16,
          marginTop: compact ? 28 : 36,
        }}
      >
        {logos.map((logo) => (
          <div
            key={logo.id}
            data-clinic-insurance-logo-box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: compact ? 84 : 96,
              padding: compact ? 14 : 18,
              border: `1px solid ${input.theme.tokens?.color.border ?? input.theme.palette.muted}`,
              borderRadius: input.theme.tokens?.radius.soft ?? '4px',
              backgroundColor: input.theme.palette.background,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={safeMediaSrc(logo.src)}
              alt={logo.alt ?? ''}
              loading="lazy"
              decoding="async"
              style={{
                display: 'block',
                width: '100%',
                height: compact ? 52 : 60,
                objectFit: 'contain',
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
