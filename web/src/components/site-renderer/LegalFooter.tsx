/**
 * [§6] 사업자정보 법적 푸터 — 모든 발행 사이트 최하단에 자동 렌더.
 * SiteConfig에 포함하지 않고(계약 불변), 서빙/Export 시점에 clients.business_info로 렌더한다.
 * 고객이 끌 수 없음(전자상거래법·정보통신망법 표시 의무). 테마 팔레트 상속.
 *
 * 순수 서버 컴포넌트 — 서빙(React)과 Export(renderToStaticMarkup) 양쪽에서 동일 출력.
 */
import type { BusinessInfo } from '@/lib/types/domain';
import type { SiteTheme } from '@/lib/types/site';

export function LegalFooter({
  info,
  theme,
  privacyHref = '/privacy',
  termsHref = '/terms',
}: {
  info: BusinessInfo;
  theme: SiteTheme;
  /** 서빙: '/privacy' · Export: 'privacy.html' */
  privacyHref?: string;
  termsHref?: string;
}) {
  const items = [
    `상호 ${info.legalName}`,
    `대표 ${info.representative}`,
    `사업자등록번호 ${info.bizRegNo}`,
    info.ecommerceRegNo ? `통신판매업신고 ${info.ecommerceRegNo}` : null,
    `주소 ${info.address}`,
    `전화 ${info.phone}`,
    `이메일 ${info.email}`,
  ].filter((x): x is string => Boolean(x));

  return (
    <footer
      className="anaks-legal-footer"
      style={{
        backgroundColor: theme.palette.surface,
        color: theme.palette.muted,
        borderTop: `1px solid ${theme.palette.muted}22`,
        padding: '28px 24px',
        fontFamily: theme.fonts.body,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {items.map((line, i) => (
          <span key={i} style={{ whiteSpace: 'nowrap' }}>
            {line}
          </span>
        ))}
      </div>
      <div style={{ maxWidth: 1200, margin: '10px auto 0', display: 'flex', gap: 16 }}>
        <a href={privacyHref} style={{ color: theme.palette.text, textDecoration: 'underline', opacity: 0.85 }}>
          개인정보처리방침
        </a>
        <a href={termsHref} style={{ color: theme.palette.text, textDecoration: 'underline', opacity: 0.85 }}>
          이용약관
        </a>
      </div>
    </footer>
  );
}
