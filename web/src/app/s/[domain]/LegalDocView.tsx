/**
 * [§6] 법무 페이지(개인정보처리방침/이용약관) 공용 렌더 — 고정 템플릿 기반.
 * 테마 팔레트를 상속해 사이트와 이질감 없이 표시. 순수 서버 컴포넌트.
 */
import type { LegalDocument } from '@/lib/legal/templates';
import type { BusinessInfo, SiteTheme } from '@/lib/types/site';
import { LegalFooter } from '@/components/site-renderer';
import Link from 'next/link';

export function LegalDocView({
  doc,
  theme,
  info,
}: {
  doc: LegalDocument;
  theme: SiteTheme;
  info: BusinessInfo;
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: theme.palette.background,
        color: theme.palette.text,
        fontFamily: theme.fonts.body,
      }}
    >
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px 40px' }}>
        <Link href="/" style={{ color: theme.palette.muted, fontSize: 13, textDecoration: 'none' }}>
          ← 홈으로
        </Link>
        <h1
          style={{
            fontFamily: theme.fonts.heading,
            fontSize: 30,
            fontWeight: 700,
            margin: '18px 0 6px',
          }}
        >
          {doc.title}
        </h1>
        <p style={{ color: theme.palette.muted, fontSize: 12, marginBottom: 28 }}>{doc.updatedNote}</p>

        {doc.sections.map((section, i) => (
          <section key={i} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{section.heading}</h2>
            {section.body.map((p, j) => (
              <p key={j} style={{ fontSize: 14, lineHeight: 1.75, color: theme.palette.text, opacity: 0.9, margin: '0 0 6px' }}>
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
      <LegalFooter info={info} theme={theme} />
    </div>
  );
}
