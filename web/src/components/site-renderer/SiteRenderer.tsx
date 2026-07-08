/**
 * 발행된 SiteConfig → 실제 사이트 렌더 (서버 컴포넌트, JS 최소).
 *
 * 스케일링 전략:
 *  - 루트에 `container-type: inline-size` → 하위의 모든 cqw 단위가
 *    루트 폭 기준 퍼센트로 해석된다. 좌표/크기/폰트를 px/1440*100 cqw로
 *    환산하면 어떤 폭에서도 1440 디자인이 비례 축소/확대 (SSR 안전, JS 측정 0).
 *  - 대시보드 미리보기에서 좁은 컨테이너에 넣어도 그대로 비례 렌더.
 *
 * mode:
 *  - 'desktop' | 'mobile': 해당 레이아웃만 (에디터/대시보드 미리보기용)
 *  - 'auto'(기본): 두 레이아웃을 모두 렌더하고 Tailwind 브레이크포인트로 전환
 *    (hidden md:block / md:hidden) — <768px에서는 y순 세로 스택 재배치.
 */
import type { SiteConfig } from '@/lib/types/site';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from './fonts';
import { SectionCanvas } from './SectionCanvas';
import { SectionStack } from './SectionStack';

export type SiteRendererMode = 'desktop' | 'mobile' | 'auto';

/** 사이트 공통 베이스 CSS — hover 마이크로 인터랙션은 CSS로만 (JS 금지) */
const BASE_CSS = `
.anaks-site, .anaks-site *, .anaks-site *::before, .anaks-site *::after { box-sizing: border-box; }
.anaks-site { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.anaks-site a { -webkit-tap-highlight-color: transparent; }
.anaks-btn { transition: transform 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease; }
.anaks-btn:hover { transform: translateY(-2px); opacity: 0.92; }
.anaks-btn[data-variant="solid"]:hover { box-shadow: 0 12px 28px -10px rgba(0, 0, 0, 0.45); }
.anaks-btn[data-variant="ghost"]:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) {
  .anaks-btn { transition: none; }
  .anaks-btn:hover { transform: none; }
}
`;

/**
 * AI 생성 customCss를 사이트 루트 클래스로 스코프.
 * CSS 중첩(nesting)으로 감싸 내부 셀렉터가 전부 `.anaks-site` 하위로 한정된다.
 * `</` 시퀀스는 제거해 <style> 태그 탈출 방지.
 */
function scopeCustomCss(customCss: string | undefined): string {
  if (!customCss?.trim()) return '';
  return `\n.anaks-site {\n${customCss.replace(/<\//g, '')}\n}`;
}

export function SiteRenderer({
  config,
  mode = 'auto',
  interactive = true,
}: {
  config: SiteConfig;
  mode?: SiteRendererMode;
  /**
   * false면 버튼을 링크가 아닌 비대화형(<span>)으로 렌더한다.
   * 대시보드 미리보기(SitePreview)처럼 상위가 이미 <a>인 맥락에서
   * 앵커 중첩(하이드레이션 에러)을 막는다. 실서빙은 기본 true.
   */
  interactive?: boolean;
}) {
  const { theme } = config;
  const sections = config.sections.filter((s) => !s.hidden);
  const fontUrls = googleFontUrls(theme.fonts.googleFonts);
  const css = BASE_CSS + scopeCustomCss(theme.customCss);

  const showDesktop = mode === 'desktop' || mode === 'auto';
  const showMobile = mode === 'mobile' || mode === 'auto';

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fontUrls.map((href) => (
        // React 19: precedence 지정 시 <head>로 호이스팅 + 중복 제거
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {needsPretendard(theme) && <link rel="stylesheet" href={PRETENDARD_CSS_URL} precedence="default" />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div
        className="anaks-site"
        style={{
          containerType: 'inline-size',
          width: '100%',
          minHeight: '100dvh',
          backgroundColor: theme.palette.background,
          color: theme.palette.text,
          fontFamily: theme.fonts.body,
        }}
      >
        {showDesktop && (
          <div className={mode === 'auto' ? 'hidden md:block' : undefined}>
            {sections.map((section, i) => (
              <SectionCanvas key={section.id} section={section} theme={theme} isFirst={i === 0} interactive={interactive} />
            ))}
          </div>
        )}
        {showMobile && (
          <div className={mode === 'auto' ? 'md:hidden' : undefined}>
            {sections.map((section, i) => (
              <SectionStack key={section.id} section={section} theme={theme} isFirst={i === 0} interactive={interactive} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
