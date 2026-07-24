import type { PublicContact, SiteTheme } from '@/lib/types/site';

/** 법적 푸터가 생기기 전에도 설문에서 확인한 전화·주소를 모든 페이지에 보이는 단일 표면. */
export function PublicContactBar({
  contact,
  theme,
}: {
  contact: PublicContact;
  theme: SiteTheme;
}) {
  const entries = [
    contact.phone ? ['전화', contact.phone] : null,
    contact.address ? ['주소', contact.address] : null,
  ].filter((entry): entry is [string, string] => Boolean(entry));
  if (entries.length === 0) return null;
  return (
    <aside
      data-public-contact-surface="survey"
      aria-label="연락처와 주소"
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
        <strong>연락처와 찾아오는 길</strong>
        <span style={{ marginLeft: 8 }}>
          사장님이 직접 확인한 정보입니다. 방문이나 문의 전에 아래 전화번호와 주소를 확인해 주세요.
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
