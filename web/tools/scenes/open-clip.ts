import {
  asStrictRecord,
  documentShell,
  embeddedKoreanFontCss,
  escapeHtml,
  exactText,
  scenePalette,
  supportedFont,
} from './shared';

export interface OpenClipVariables {
  businessName: string;
  industry: string;
  address: string;
  phone: string;
  font: 'noto-sans-kr';
  palette: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
  };
}

export async function openClipScene(value: unknown): Promise<string> {
  const record = asStrictRecord(value, 'open-clip 입력', [
    'businessName',
    'industry',
    'address',
    'phone',
    'font',
    'palette',
  ]);
  const businessName = exactText(record, 'businessName', 32);
  const industry = exactText(record, 'industry', 40);
  const address = exactText(record, 'address', 100);
  const phone = exactText(record, 'phone', 32);
  supportedFont(record);
  const palette = scenePalette(record.palette);
  const fontCss = await embeddedKoreanFontCss(
    `${businessName}${industry}${address}${phone}OPEN CLIP상호업종주소전화정확한 정보만 담았습니다`,
  );
  const title = escapeHtml(businessName);
  const exactIndustry = escapeHtml(industry);
  const exactAddress = escapeHtml(address);
  const exactPhone = escapeHtml(phone);

  return documentShell({
    compositionId: 'open-clip',
    width: 1080,
    height: 1920,
    duration: 12,
    fontCss,
    styles: `
      :root{--bg:${palette.background};--surface:${palette.surface};--primary:${palette.primary};--accent:${palette.accent};--text:${palette.text}}
      *{box-sizing:border-box}html,body{width:1080px;height:1920px;margin:0;overflow:hidden;background:var(--bg)}body{font-family:"Anaks Labs Noto Sans KR",sans-serif}
      #root{position:relative;width:100%;height:100%;overflow:hidden;color:var(--text);isolation:isolate}.field{position:absolute;inset:-12%;background:radial-gradient(circle at 12% 24%,color-mix(in srgb,var(--primary) 74%,transparent),transparent 25%),radial-gradient(circle at 92% 76%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 27%),linear-gradient(145deg,var(--bg),var(--surface));animation:open-field 12s linear both}
      .grain{position:absolute;inset:0;opacity:.2;background-image:linear-gradient(120deg,transparent 46%,color-mix(in srgb,var(--text) 17%,transparent) 48%,transparent 50%);background-size:86px 86px;animation:open-grain 12s linear both}
      .topline{position:absolute;left:72px;right:72px;top:74px;display:flex;align-items:center;gap:24px;font-size:24px;font-weight:720;letter-spacing:.15em;color:color-mix(in srgb,var(--text) 72%,transparent);animation:open-top 12s ease both}.topline::after{content:"";height:1px;flex:1;background:color-mix(in srgb,var(--text) 32%,transparent)}
      .hero{position:absolute;left:72px;right:72px;top:258px;padding:66px 56px 72px;border-top:8px solid var(--accent);background:linear-gradient(160deg,color-mix(in srgb,var(--surface) 95%,transparent),color-mix(in srgb,var(--surface) 58%,transparent));box-shadow:0 36px 100px color-mix(in srgb,var(--bg) 56%,transparent);animation:open-hero 12s cubic-bezier(.18,.8,.2,1) both}
      .eyebrow{margin:0 0 30px;font-size:25px;font-weight:760;letter-spacing:.16em;color:var(--accent)}h1{margin:0;font-size:132px;line-height:.98;letter-spacing:-.075em;font-weight:860;word-break:keep-all;text-wrap:balance}.industry{margin:42px 0 0;font-size:44px;line-height:1.35;font-weight:570;word-break:keep-all;color:color-mix(in srgb,var(--text) 82%,var(--accent))}
      .details{position:absolute;left:72px;right:72px;top:930px;display:grid;gap:22px}.detail{display:grid;grid-template-columns:128px minmax(0,1fr);align-items:start;gap:28px;padding:34px 38px;border:1px solid color-mix(in srgb,var(--text) 22%,transparent);background:color-mix(in srgb,var(--surface) 78%,transparent);backdrop-filter:blur(20px);animation:open-detail 12s cubic-bezier(.18,.8,.2,1) both}.detail:nth-child(2){animation-name:open-detail-two}.detail:nth-child(3){animation-name:open-detail-three}.detail dt{margin:0;font-size:23px;font-weight:730;letter-spacing:.12em;color:var(--accent)}.detail dd{margin:0;font-size:34px;line-height:1.45;font-weight:590;letter-spacing:-.025em;word-break:keep-all;overflow-wrap:anywhere}
      .truth{position:absolute;left:72px;right:72px;bottom:92px;display:flex;align-items:center;justify-content:space-between;gap:40px;padding-top:28px;border-top:1px solid color-mix(in srgb,var(--text) 34%,transparent);font-size:22px;font-weight:600;color:color-mix(in srgb,var(--text) 68%,transparent);animation:open-truth 12s ease both}.truth strong{font-size:76px;line-height:.8;color:var(--accent);letter-spacing:-.08em}
      @keyframes open-field{0%{transform:scale(1.14) translate3d(-2%,1%,0)}100%{transform:scale(1.02) translate3d(2%,-1%,0)}}@keyframes open-grain{0%{transform:translateY(0)}100%{transform:translateY(-172px)}}
      @keyframes open-top{0%,5%{opacity:0;transform:translateY(-24px)}16%,94%{opacity:1;transform:none}100%{opacity:0}}
      @keyframes open-hero{0%,8%{opacity:0;transform:translate3d(0,100px,0);clip-path:inset(0 0 100%)}26%,88%{opacity:1;transform:none;clip-path:inset(0)}100%{opacity:0;transform:translate3d(0,-42px,0)}}
      @keyframes open-detail{0%,24%{opacity:0;transform:translateX(-90px)}38%,90%{opacity:1;transform:none}100%{opacity:0;transform:translateX(36px)}}@keyframes open-detail-two{0%,31%{opacity:0;transform:translateX(90px)}45%,90%{opacity:1;transform:none}100%{opacity:0;transform:translateX(-36px)}}@keyframes open-detail-three{0%,38%{opacity:0;transform:translateY(80px)}52%,90%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-28px)}}
      @keyframes open-truth{0%,48%{opacity:0;transform:translateY(28px)}62%,92%{opacity:1;transform:none}100%{opacity:0}}
    `,
    body: `
      <div id="open-field" class="clip field" data-start="0" data-duration="12" data-track-index="0"></div>
      <div id="open-grain" class="clip grain" data-start="0" data-duration="12" data-track-index="1"></div>
      <div id="open-topline" class="clip topline" data-start="0" data-duration="12" data-track-index="2"><span>OPEN CLIP</span></div>
      <section id="open-hero" class="clip hero" data-start="0" data-duration="12" data-track-index="3" aria-label="${title} 오픈 클립">
        <p class="eyebrow">상호</p><h1>${title}</h1><p class="industry">${exactIndustry}</p>
      </section>
      <dl id="open-details" class="clip details" data-start="0" data-duration="12" data-track-index="4">
        <div class="detail"><dt>업종</dt><dd>${exactIndustry}</dd></div>
        <div class="detail"><dt>주소</dt><dd>${exactAddress}</dd></div>
        <div class="detail"><dt>전화</dt><dd>${exactPhone}</dd></div>
      </dl>
      <footer id="open-truth" class="clip truth" data-start="0" data-duration="12" data-track-index="5"><span>정확한 정보만 담았습니다</span><strong>15s−</strong></footer>`,
  });
}
