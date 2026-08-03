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
import {
  businessDirectionsHref,
  businessPhoneHref,
} from '@/lib/analytics/trackable-actions';
import { themeColor } from '@/lib/design/site-theme-tokens';

export function LegalFooter({
  info,
  theme,
  privacyHref = '/privacy',
  termsHref = '/terms',
  disableActions = false,
}: {
  info: BusinessInfo;
  theme: SiteTheme;
  /** 서빙: '/privacy' · Export: 'privacy.html' */
  privacyHref?: string;
  termsHref?: string;
  /** Code-owned fictional demos can display layout-safe placeholder values without activating them. */
  disableActions?: boolean;
}) {
  const phoneHref = disableActions ? undefined : businessPhoneHref(info.phone);
  const directionsHref = !disableActions && info.address ? businessDirectionsHref(info.address) : undefined;
  type FooterItem = { key: string; label: string; href?: string; external?: boolean };
  const items = [
    info.businessName ? { key: 'business', label: `Business ${info.businessName}` } : null,
    { key: 'owner', label: `${info.isPersonal ? 'Operator' : 'Representative'} ${info.ownerName}` },
    info.businessNumber ? { key: 'number', label: `Registration ${info.businessNumber}` } : null,
    info.mailOrderNumber ? { key: 'mail-order', label: `E-commerce registration ${info.mailOrderNumber}` } : null,
    info.address
      ? { key: 'address', label: `Address ${info.address}`, href: directionsHref, external: true }
      : null,
    { key: 'phone', label: `Phone ${info.phone}`, href: phoneHref },
    info.email ? { key: 'email', label: `Email ${info.email}` } : null,
  ].filter((item): item is FooterItem => Boolean(item));

  const actionStyle = {
    color: 'inherit',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  } as const;

  return (
    <footer
      className="anaks-legal-footer"
      style={{
        backgroundColor: themeColor(theme, 'surfaceSubtle'),
        color: themeColor(theme, 'muted'),
        borderTop: theme.tokens
          ? `1px solid ${themeColor(theme, 'border')}`
          : `1px solid ${theme.palette.muted}22`,
        padding: '28px 24px',
        fontFamily: theme.fonts.body,
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
        {items.map((item) => (
          <span key={item.key} style={{ whiteSpace: 'nowrap' }}>
            {item.href ? (
              <a
                href={item.href}
                {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                style={actionStyle}
              >
                {item.label}
              </a>
            ) : item.label}
          </span>
        ))}
      </div>
      <div style={{ maxWidth: 1200, margin: '10px auto 0', display: 'flex', gap: 16 }}>
        <a href={privacyHref} style={{ color: theme.palette.text, textDecoration: 'underline', opacity: 0.85 }}>
          Privacy
        </a>
        <a href={termsHref} style={{ color: theme.palette.text, textDecoration: 'underline', opacity: 0.85 }}>
          Terms
        </a>
      </div>
    </footer>
  );
}
