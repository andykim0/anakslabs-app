/**
 * [v3] 사업자정보 법적 푸터 — 모든 발행 사이트 최하단에 자동 렌더.
 * 소스는 SiteConfig.businessInfo(사이트 단위 계약, lib/types/site.ts) — 서빙(/s/[domain])은
 * site.siteConfig.businessInfo, Export는 동일 값을 legal-html이 전달한다.
 * 캔버스 요소가 아니므로 자유배치로 지워질 수 없고, 고객이 끌 수 없다
 * (전자상거래법·정보통신망법 표시 의무). 테마 팔레트 상속.
 * isPersonal(개인 운영)이면 상호/사업자번호/주소 없이 운영자·연락처만 표기.
 *
 * 순수 서버 컴포넌트 — 서빙(React)과 Export(renderToStaticMarkup) 양쪽에서 동일 출력.
 */
import type { BusinessInfo, SiteTheme } from '@/lib/types/site';

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
    info.businessName ? `상호 ${info.businessName}` : null,
    `${info.isPersonal ? '운영자' : '대표'} ${info.ownerName}`,
    info.businessNumber ? `사업자등록번호 ${info.businessNumber}` : null,
    info.mailOrderNumber ? `통신판매업신고 ${info.mailOrderNumber}` : null,
    info.address ? `주소 ${info.address}` : null,
    `전화 ${info.phone}`,
    info.email ? `이메일 ${info.email}` : null,
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
