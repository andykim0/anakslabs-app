import {
  asStrictRecord,
  documentShell,
  embeddedKoreanFontCss,
  escapeHtml,
  exactText,
  scenePalette,
  supportedFont,
} from './shared';

export interface TypographyHeroVariables {
  businessName: string;
  tagline: string;
  font: 'noto-sans-kr';
  palette: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
  };
}

export async function typographyHeroScene(value: unknown): Promise<string> {
  const record = asStrictRecord(value, 'typography-hero 입력', [
    'businessName',
    'tagline',
    'font',
    'palette',
  ]);
  const businessName = exactText(record, 'businessName', 32);
  const tagline = exactText(record, 'tagline', 80);
  supportedFont(record);
  const palette = scenePalette(record.palette);
  const fontCss = await embeddedKoreanFontCss(`${businessName}${tagline}TYPOGRAPHY HERO 01`);
  const title = escapeHtml(businessName);
  const subtitle = escapeHtml(tagline);

  return documentShell({
    compositionId: 'typography-hero',
    width: 1920,
    height: 1080,
    duration: 6,
    fontCss,
    styles: `
      :root{--bg:${palette.background};--surface:${palette.surface};--primary:${palette.primary};--accent:${palette.accent};--text:${palette.text}}
      *{box-sizing:border-box}html,body{width:1920px;height:1080px;margin:0;overflow:hidden;background:var(--bg)}
      body{font-family:"Anaks Labs Noto Sans KR",sans-serif}#root{position:relative;width:100%;height:100%;overflow:hidden;color:var(--text);isolation:isolate}
      .field{position:absolute;inset:-12%;background:radial-gradient(circle at 74% 25%,color-mix(in srgb,var(--accent) 72%,transparent),transparent 23%),radial-gradient(circle at 22% 80%,color-mix(in srgb,var(--primary) 70%,transparent),transparent 30%),var(--bg);animation:hero-field 6s linear both}
      .orbit{position:absolute;width:760px;height:760px;right:-110px;top:-170px;border:2px solid color-mix(in srgb,var(--text) 24%,transparent);border-radius:50%;animation:hero-orbit 6s cubic-bezier(.2,.8,.2,1) both}
      .orbit::before,.orbit::after{content:"";position:absolute;border-radius:50%;border:1px solid color-mix(in srgb,var(--accent) 58%,transparent)}.orbit::before{inset:110px}.orbit::after{inset:245px;background:color-mix(in srgb,var(--surface) 52%,transparent)}
      .rail{position:absolute;left:118px;top:96px;right:118px;display:flex;align-items:center;justify-content:space-between;color:color-mix(in srgb,var(--text) 68%,transparent);font-size:22px;font-weight:660;letter-spacing:.18em;animation:hero-rail 6s ease both}.rail i{display:block;width:46%;height:1px;background:color-mix(in srgb,var(--text) 34%,transparent)}
      .lockup{position:absolute;left:118px;right:118px;bottom:118px;display:grid;grid-template-columns:minmax(0,1fr) 310px;align-items:end;gap:80px}
      .copy{position:relative;padding:62px 68px 72px;border-left:6px solid var(--accent);background:linear-gradient(100deg,color-mix(in srgb,var(--surface) 90%,transparent),color-mix(in srgb,var(--surface) 18%,transparent) 78%,transparent);animation:hero-copy 6s cubic-bezier(.18,.8,.2,1) both}
      h1{margin:0;max-width:1220px;font-size:176px;line-height:.92;letter-spacing:-.075em;font-weight:850;word-break:keep-all;text-wrap:balance}p{margin:40px 0 0;max-width:1000px;font-size:40px;line-height:1.42;font-weight:560;letter-spacing:-.025em;word-break:keep-all;text-wrap:balance;color:color-mix(in srgb,var(--text) 82%,var(--accent))}
      .index{justify-self:end;display:grid;gap:18px;text-align:right;font-size:20px;font-weight:720;letter-spacing:.14em;color:color-mix(in srgb,var(--text) 64%,transparent);animation:hero-index 6s ease both}.index strong{font-size:100px;line-height:.8;letter-spacing:-.08em;color:var(--accent)}
      @keyframes hero-field{0%{transform:scale(1.16) rotate(-2deg)}100%{transform:scale(1.02) rotate(2deg)}}
      @keyframes hero-orbit{0%,8%{opacity:0;transform:scale(.72) rotate(-28deg)}38%,82%{opacity:1}100%{opacity:.15;transform:scale(1.18) rotate(32deg)}}
      @keyframes hero-rail{0%,13%{opacity:0;transform:translateY(-30px)}30%,88%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-16px)}}
      @keyframes hero-copy{0%,10%{opacity:0;transform:translate3d(-120px,54px,0);clip-path:inset(0 100% 0 0)}42%,84%{opacity:1;transform:none;clip-path:inset(0)}100%{opacity:0;transform:translate3d(44px,-26px,0) scale(1.02);clip-path:inset(0)}}
      @keyframes hero-index{0%,28%{opacity:0;transform:translateY(58px)}48%,86%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-24px)}}`,
    body: `
      <div id="hero-field" class="clip field" data-start="0" data-duration="6" data-track-index="0"></div>
      <div id="hero-orbit" class="clip orbit" data-start="0" data-duration="6" data-track-index="1"></div>
      <div id="hero-rail" class="clip rail" data-start="0" data-duration="6" data-track-index="2"><span>TYPOGRAPHY HERO</span><i></i><span>01</span></div>
      <section id="hero-lockup" class="clip lockup" data-start="0" data-duration="6" data-track-index="3" aria-label="${title} 타이포 히어로">
        <div class="copy"><h1>${title}</h1><p>${subtitle}</p></div>
        <div class="index"><span>MOTION IDENTITY</span><strong>01</strong></div>
      </section>`,
  });
}
