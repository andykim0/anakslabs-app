'use client';

/**
 * 에디터 캔버스용 테마 폰트 로더.
 * 렌더러와 동일한 URL 생성 로직(site-renderer/fonts)을 재사용해
 * 에디터·발행 사이트의 폰트 렌더가 일치하도록 한다.
 * React 19: precedence 지정 <link>는 <head>로 호이스팅 + 중복 제거.
 */
import type { SiteTheme } from '@/lib/types/site';
import { googleFontUrls, needsPretendard, PRETENDARD_CSS_URL } from '@/components/site-renderer/fonts';
import { fontPairingResources } from '@/lib/fonts/resources';

export function ThemeFonts({ theme }: { theme: SiteTheme }) {
  const pinned = fontPairingResources(theme);
  if (pinned) {
    return <style dangerouslySetInnerHTML={{ __html: pinned.css }} />;
  }
  const urls = googleFontUrls(theme.fonts.googleFonts);
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {urls.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {needsPretendard(theme) && <link rel="stylesheet" href={PRETENDARD_CSS_URL} precedence="default" />}
    </>
  );
}
