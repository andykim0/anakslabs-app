import type { PublicContact, SiteTheme } from '@/lib/types/site';

/** 법적 푸터가 생기기 전에도 설문에서 확인한 전화·주소를 모든 페이지에 보이는 단일 표면. */
export function PublicContactBar({
  contact,
  theme,
  locale,
}: {
  contact: PublicContact;
  theme: SiteTheme;
  locale?: 'en-US';
}) {
  const english = locale === 'en-US';
  const entries = [
    contact.phone ? ['Phone', contact.phone] : null,
    contact.address ? ['Address', contact.address] : null,
  ].filter((entry): entry is [string, string] => Boolean(entry));
  if (entries.length === 0) return null;
  return (
    <aside
      data-public-contact-surface="survey"
      aria-label="Contact and address"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px 28px',
        padding: '18px clamp(20px, 6vw, 96px)',
        color: theme.palette.text,
        background: theme.palette.surface,
        borderTop: `1px solid ${theme.palette.muted}`,
        fontFamily: theme.fonts.body,
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <span style={{ flexBasis: '100%' }}>
        <strong>Contact and visit information</strong>
        <span style={{ marginLeft: 8 }}>
          {english
            ? 'Public information reproduced from the clinic source for this private preview.'
            : 'This information was confirmed by the business. Verify the phone number and address before visiting or contacting the practice.'}
        </span>
      </span>
      {entries.map(([label, value]) => (
        <span key={label}>
          <strong style={{ marginRight: 8 }}>{label}</strong>
          {value}
        </span>
      ))}
    </aside>
  );
}
