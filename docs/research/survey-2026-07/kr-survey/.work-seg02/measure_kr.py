import json, sys, io, os, re, traceback
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

JS = r"""
() => {
  const out = {};
  const vw = window.innerWidth, vh = window.innerHeight;
  out.viewport = [vw, vh];
  out.scrollHeight = document.body.scrollHeight;
  out.screens = +(document.body.scrollHeight / vh).toFixed(1);

  const parseRGB = (s) => { if (!s) return null; const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x)); return { r:p[0], g:p[1], b:p[2], a:p.length>3?p[3]:1 }; };
  const lum = (c) => c ? (0.2126*c.r + 0.7152*c.g + 0.0722*c.b)/255 : null;
  const effBg = (el) => { let n = el, g = 0;
    while (n && g++ < 12) { const cs = getComputedStyle(n); const c = parseRGB(cs.backgroundColor);
      const bi = cs.backgroundImage;
      if (bi && /url\(/.test(bi)) return { media:true, l: c && c.a>0 ? lum(c) : null, key:'media' };
      if (c && c.a > 0.05) return { media:false, l: lum(c), key: `${Math.round(c.r/12)},${Math.round(c.g/12)},${Math.round(c.b/12)}` };
      n = n.parentElement; }
    return { media:false, l:1, key:'default' }; };
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden') return false;
    const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };
  const txt = (el) => (el.innerText || '').replace(/\s+/g,' ').trim();
  const absTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  // fixed/sticky overlays (floating quick-menu, headers, popups) are NOT page sections
  const isOverlay = (el) => { const p = getComputedStyle(el).position; return p === 'fixed' || p === 'sticky'; };

  // Pick the wrapper whose tall children cover the most of the page's scroll height.
  const cands = [document.querySelector('main'), document.body,
    ...document.querySelectorAll('body > div, body > div > div, body > div > div > div, main > div')].filter(Boolean);
  let best = null, bestCover = -1, bestN = -1;
  for (const c of cands) { let cover = 0, n = 0;
    for (const ch of c.children) { if (!vis(ch) || isOverlay(ch)) continue;
      const r = ch.getBoundingClientRect(); if (r.height <= 180) continue;
      cover += r.height; n++; }
    if (cover > bestCover * 1.05 || (Math.abs(cover - bestCover) <= bestCover * 0.05 && n > bestN)) {
      bestCover = cover; bestN = n; best = c; } }
  out.sectionParentTag = best ? (best.tagName.toLowerCase() + (best.id ? '#id' : '')) : null;
  out.sectionCoverRatio = +(bestCover / Math.max(document.body.scrollHeight, 1)).toFixed(2);
  let secs = [];
  if (best) for (const ch of best.children) {
    if (!vis(ch)) continue;
    const tag = ch.tagName.toLowerCase();
    if (['script','style','noscript','link','svg'].includes(tag)) continue;
    if (isOverlay(ch)) continue;
    const r0 = ch.getBoundingClientRect();
    if (r0.height < 180) continue;
    if (r0.left + window.scrollX > vw * 1.2 || r0.right + window.scrollX < -10) continue;  // off-canvas drawers
    secs.push(ch); }
  // Descend into any wrapper that is really a stack of sections:
  //   too few sections overall, or one block far taller than a screen holding several tall children.
  const kids = (s) => [...s.children].filter(ch => vis(ch)
    && !['script','style','noscript','link','svg'].includes(ch.tagName.toLowerCase())
    && !isOverlay(ch) && ch.getBoundingClientRect().height > 180);
  for (let pass = 0; pass < 10; pass++) {
    let changed = false; const next = [];
    for (const s of secs) {
      const h = s.getBoundingClientRect().height;
      const k = kids(s);
      const oversized = h > vh * 2.2 && k.length >= 2;
      const tooFew = secs.length <= 2 && k.length >= 2;
      // pass-through wrapper: a single child that is essentially the whole block
      const passthrough = h > vh * 2.2 && k.length === 1
        && k[0].getBoundingClientRect().height > h * 0.85;
      if (oversized || tooFew || passthrough) { next.push(...k); changed = true; }
      else next.push(s); }
    if (!changed) break;
    secs = next;
    if (secs.length > 40) break; }

  // Fill vertical gaps the tree walk missed (absolutely positioned / floated bands).
  const topOf = (el) => el.getBoundingClientRect().top + window.scrollY;
  const fillGaps = () => {
    secs.sort((a,b) => topOf(a) - topOf(b));
    const found = [];
    let cursor = secs.length ? topOf(secs[0]) + secs[0].getBoundingClientRect().height : 0;
    const edges = secs.map(s => [topOf(s), topOf(s) + s.getBoundingClientRect().height]);
    const bounds = [[0, edges.length ? edges[0][0] : document.body.scrollHeight]];
    for (let i = 0; i < edges.length; i++) {
      const nxt = i + 1 < edges.length ? edges[i+1][0] : document.body.scrollHeight;
      if (nxt - edges[i][1] > 400) bounds.push([edges[i][1], nxt]); }
    if (bounds[0][1] - bounds[0][0] < 400) bounds.shift();
    for (const [g0, g1] of bounds.slice(0, 8)) {
      const seen = new Set();
      for (let y = g0 + 60; y < g1 - 40; y += 400) {
        const scrollTo = Math.max(0, y - vh/2);
        window.scrollTo(0, scrollTo);
        const el = document.elementFromPoint(vw/2, Math.min(vh-5, Math.max(5, y - scrollTo)));
        if (!el) continue;
        let n = el, pick = null;
        for (let g = 0; n && g < 14; g++, n = n.parentElement) {
          if (n === document.body || isOverlay(n)) break;
          const r = n.getBoundingClientRect(); const t = r.top + window.scrollY;
          if (r.height > 180 && t >= g0 - 30 && t + r.height <= g1 + 30) pick = n; }
        if (pick && !seen.has(pick)) { seen.add(pick); found.push(pick); } } }
    window.scrollTo(0, 0);
    if (found.length) secs = secs.concat(found).sort((a,b) => topOf(a) - topOf(b)); };
  try { fillGaps(); } catch (e) { out.gapFillError = String(e).slice(0,120); }
  out.sectionCount = secs.length;

  const mediaCount = (el) => { let n = 0;
    el.querySelectorAll('img, video, picture, iframe').forEach(m => { if (vis(m)) n++; });
    let g = 0;
    el.querySelectorAll('*').forEach(d => { if (g++ > 900 || n > 60) return;
      const bi = getComputedStyle(d).backgroundImage;
      if (bi && /url\(/.test(bi) && !/^linear-gradient|^radial-gradient/.test(bi) && vis(d)) n++; });
    return n; };

  out.sections = secs.map((s, i) => {
    const t = txt(s); const bg = effBg(s); const r = s.getBoundingClientRect();
    return { i, tag: s.tagName.toLowerCase(), absTop: Math.round(r.top + window.scrollY), h: Math.round(r.height),
      chars: t.length, headings: [...s.querySelectorAll('h1,h2,h3')].filter(vis).map(h=>txt(h)).slice(0,5),
      keyText: t.slice(0,700), media: mediaCount(s), bgKey: bg.key,
      bgLum: bg.l === null ? null : +bg.l.toFixed(3), bgMedia: bg.media }; });

  // ordered heading outline for section-order narrative
  out.outline = [...document.querySelectorAll('h1,h2')].filter(vis)
    .map(h => ({ y: Math.round(absTop(h)), tag: h.tagName.toLowerCase(), t: txt(h).slice(0,90) }))
    .sort((a,b)=>a.y-b.y).slice(0,40);

  const hero = secs[0] || null;
  if (hero) {
    const hr = hero.getBoundingClientRect(); const bg = effBg(hero);
    const h1 = hero.querySelector('h1,h2') || hero.querySelector('[class*=title],[class*=headline]');
    let textLum = null;
    if (h1) { const c = parseRGB(getComputedStyle(h1).color); textLum = c ? +lum(c).toFixed(3) : null; }
    let bigM = null, bigA = 0, bigKind = null;
    hero.querySelectorAll('img,video,iframe').forEach(m => { if (!vis(m)) return;
      const r = m.getBoundingClientRect(); const a = r.width*r.height;
      if (a > bigA) { bigA=a; bigM=r; bigKind=m.tagName.toLowerCase(); } });
    const bgScan = [hero, ...hero.querySelectorAll('*')];
    let g = 0;
    bgScan.forEach(d => { if (g++ > 900) return; const cs = getComputedStyle(d);
      if (cs.backgroundImage && /url\(/.test(cs.backgroundImage) && !/^linear-gradient|^radial-gradient/.test(cs.backgroundImage) && vis(d)) {
        const r = d.getBoundingClientRect(); const a = r.width*r.height;
        if (a > bigA) { bigA=a; bigM=r; bigKind='bg-image'; } } });
    let place = 'none';
    if (bigM && bigA > 0) { const covW = bigM.width/Math.max(hr.width,1), covH = bigM.height/Math.max(Math.min(hr.height,vh),1);
      const cx = (bigM.left + bigM.width/2)/Math.max(vw,1);
      if (covW > 0.85 && covH > 0.6) place='full-bleed';
      else if (cx < 0.44) place='left'; else if (cx > 0.56) place='right'; else place='center'; }
    const slideSel = '.swiper-slide:not(.swiper-slide-duplicate), .slick-slide:not(.slick-cloned), .splide__slide:not(.splide__slide--clone), .glide__slide:not(.glide__slide--clone), [class*="carousel-item"], [data-slide]';
    const heroSlides = [...hero.querySelectorAll(slideSel)].filter(vis).length;
    const ctaRe = /예약|상담|문의|신청|바로가기|더보기|자세히|카톡|카카오|전화|오시는|book|consult|reserve|contact|more/i;
    const ctas = [];
    hero.querySelectorAll('a,button').forEach(b => { if (!vis(b)) return;
      const r = b.getBoundingClientRect(); if (r.height < 18 || r.width < 40) return;
      const cs = getComputedStyle(b); const c = parseRGB(cs.backgroundColor);
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const filled = !!(c && c.a > 0.06);
      const label = txt(b).slice(0,40);
      ctas.push({ filled, outline: !filled && bw > 0.5, bw:+bw.toFixed(1), w:Math.round(r.width), h:Math.round(r.height),
        label, isCta: ctaRe.test(label + ' ' + (b.getAttribute('href')||'')), radius: cs.borderTopLeftRadius }); });
    out.hero = { h: Math.round(hr.height), bgLum: bg.l===null?null:+bg.l.toFixed(3), bgMedia: bg.media,
      textLum, mediaKind: bigKind, mediaPlace: place,
      mediaCoverW: bigM ? +(bigM.width/Math.max(hr.width,1)).toFixed(2) : null,
      mediaCoverH: bigM ? +(bigM.height/Math.max(Math.min(hr.height,vh),1)).toFixed(2) : null,
      slides: heroSlides, anchorCount: hero.querySelectorAll('a,button').length,
      ctas: ctas.slice(0,12), text: txt(hero).slice(0,600) };
  } else out.hero = null;

  const famOf = (el) => el ? getComputedStyle(el).fontFamily : null;
  const bodyP = [...document.querySelectorAll('p')].filter(p => vis(p) && txt(p).length > 60)[0] || document.querySelector('p') || document.body;
  const h1el = document.querySelector('h1'), h2el = document.querySelector('h2');
  // biggest visible heading-ish element = practical H1 when markup lacks h1
  let bigHead = null, bigHeadPx = 0;
  document.querySelectorAll('h1,h2,h3,[class*=title],[class*=tit],[class*=headline],[class*=copy] > strong, p, span, div').forEach(el => {
    if (bigHeadPx > 200) return;
    if (!vis(el)) return;
    const t = txt(el); if (!t || t.length < 2 || t.length > 60) return;
    if (el.children.length > 2) return;
    const r = el.getBoundingClientRect();
    if (r.top + window.scrollY > vh * 1.4) return;
    const px = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (px > bigHeadPx) { bigHeadPx = px; bigHead = el; } });
  const cssOf = (el, prop) => el ? getComputedStyle(el)[prop] : null;
  out.type = { h1: famOf(h1el), h2: famOf(h2el), body: famOf(bodyP),
    h1Weight: cssOf(h1el,'fontWeight'), h1Size: cssOf(h1el,'fontSize'),
    h2Weight: cssOf(h2el,'fontWeight'), h2Size: cssOf(h2el,'fontSize'),
    bodySize: cssOf(bodyP,'fontSize'), bodyWeight: cssOf(bodyP,'fontWeight'),
    bodyLH: cssOf(bodyP,'lineHeight'),
    bigHeadPx: bigHeadPx || null, bigHeadFam: famOf(bigHead), bigHeadWeight: cssOf(bigHead,'fontWeight'),
    h1Count: document.querySelectorAll('h1').length,
    h2Sizes: [...new Set([...document.querySelectorAll('h2')].filter(vis).map(h=>getComputedStyle(h).fontSize))].slice(0,6),
    h3Size: cssOf(document.querySelector('h3'),'fontSize'),
    fontFaces: [...new Set([...document.fonts].map(f=>f.family))].slice(0,14),
    linkFonts: [...new Set([...document.querySelectorAll('link[rel=stylesheet],link[rel=preload]')].map(l=>l.getAttribute('href')||'').filter(h=>/font|webfont|noto|pretendard|spoqa|nanum|gmarket|suit/i.test(h)).map(h=>h.slice(0,90)))].slice(0,8) };

  out.motion = { aosCount: document.querySelectorAll('[data-aos]').length, gsap: !!window.gsap,
    scrollTrigger: !!(window.ScrollTrigger), swiperCount: document.querySelectorAll('.swiper, .swiper-container').length,
    slick: document.querySelectorAll('.slick-slider').length, splide: document.querySelectorAll('.splide').length,
    glide: document.querySelectorAll('.glide').length, flickity: document.querySelectorAll('.flickity-enabled').length,
    wow: document.querySelectorAll('.wow').length, framer: document.querySelectorAll('[data-framer-name],[data-projection-id]').length,
    elementorInvisible: document.querySelectorAll('.elementor-invisible').length,
    animateCss: document.querySelectorAll('[class*="animate__"], .animated').length,
    lottie: document.querySelectorAll('lottie-player,[class*=lottie]').length,
    webflowIx: document.querySelectorAll('[data-w-id]').length,
    marquee: document.querySelectorAll('[class*=marquee],[class*=ticker]').length,
    totalSlideEls: document.querySelectorAll('.swiper-slide,.slick-slide,.splide__slide,.glide__slide,[class*="carousel-item"]').length };

  const pageText = (document.body.innerText || '').replace(/\s+/g,' ');
  const has = (re) => re.test(pageText);
  out.pageTextLen = pageText.length;
  out.features = {
    videoTag: document.querySelectorAll('video').length,
    videoEmbed: document.querySelectorAll('iframe[src*="youtube"],iframe[src*="youtu.be"],iframe[src*="vimeo"],iframe[src*="wistia"],iframe[src*="loom"]').length,
    formCount: [...document.querySelectorAll('form')].filter(f=>f.querySelectorAll('input,textarea,select').length>=2).length,
    inputCount: document.querySelectorAll('input:not([type=hidden])').length,
    detailsCount: document.querySelectorAll('details').length,
    accordionCount: document.querySelectorAll('[class*=accordion],[class*=faq],[data-accordion]').length,
    telLinks: [...new Set([...document.querySelectorAll('a[href^="tel:"]')].map(a=>a.getAttribute('href')))].length,
    smsLinks: document.querySelectorAll('a[href^="sms:"]').length,
    mailLinks: document.querySelectorAll('a[href^="mailto:"]').length,
    waLinks: document.querySelectorAll('a[href*="wa.me"],a[href*="whatsapp"]').length,
    bookingLinks: [...document.querySelectorAll('a')].filter(a=>/book|appointment|schedule|consult|request/i.test(txt(a)+' '+(a.getAttribute('href')||''))).length,
    bookingWidget: document.querySelectorAll('[src*=nexhealth],[href*=nexhealth],[src*=zocdoc],[href*=zocdoc],[src*=flexbook],[href*=flexbook],[src*=localmed],[href*=dentrix],[href*=lighthouse360],[href*=yapi]').length,
    reviewWidgets: document.querySelectorAll('[class*=review],[class*=testimonial],[id*=review],iframe[src*="google.com/maps"],[class*=birdeye],[class*=podium],[class*=swell],[class*=trustindex]').length,
    kwReviews: has(/후기|리얼스토리|고객\s*스토리|생생|체험기|리뷰|만족도|testimonial|review/i),
    kwFaq: has(/자주\s*(하는|묻는)\s*질문|FAQ|Q\s*&\s*A|궁금(증|한)|자주찾는/i),
    kwInsurance: has(/보험|실비|비급여|비용\s*안내|가격\s*안내|할부|카드\s*혜택/i),
    kwPromo: has(/이벤트|프로모션|특가|혜택|할인|기획전|EVENT/i),
    kwBeforeAfter: has(/전\s*[·\/]?\s*후|비포\s*[·\/&]?\s*애프터|before\s*(&|and|\/)\s*after|수술\s*전후|시술\s*전후/i),
    kwTeam: has(/의료진|의료\s*진|전문의|원장|대표원장|닥터|MEDICAL\s*STAFF|DOCTOR/i),
    kwBooking: has(/예약|상담\s*신청|온라인\s*상담|빠른\s*상담|카카오|카톡|문의하기|RESERVATION|CONSULT/i),
    kwLocation: has(/오시는\s*길|찾아오시는|위치\s*안내|진료\s*시간|주차|LOCATION|약도/i),
    kwGallery: has(/갤러리|둘러보기|병원\s*(전경|내부|시설)|인테리어|GALLERY|시설\s*안내/i),
    kwAbout: has(/병원\s*소개|소개합니다|철학|인사말|ABOUT|브랜드\s*스토리|우리는/i),
    kwVideo: has(/영상|유튜브|YOUTUBE|VIDEO|방송|출연/i),
    kwTrust: has(/인증|수상|지정|선정|누적|건\s*이상|명\s*이상|년\s*경력|특허|학회|논문|언론/i),
    kwNotice: has(/공지|NOTICE|새소식|뉴스/i),
    kwAd심의: has(/심의\s*필|의료광고|부작용/i),
    kakao: document.querySelectorAll('a[href*="kakao"],a[href*="pf.kakao"],a[href*="open.kakao"],[class*=kakao]').length,
    naverLinks: document.querySelectorAll('a[href*="naver"],a[href*="blog.naver"],a[href*="m.place.naver"]').length,
    instaLinks: document.querySelectorAll('a[href*="instagram"]').length,
    ytLinks: document.querySelectorAll('a[href*="youtube"],a[href*="youtu.be"]').length,
    phoneKR: (pageText.match(/0\d{1,2}[-\s.]\d{3,4}[-\s.]\d{4}/) || [null])[0] ? 'yes' : null,
    statLike: [...new Set((pageText.match(/\b\d{1,3}(,\d{3})*\s*(만|천)?\s*(건|명|년|例|케이스|회)\s*(이상|돌파|누적)?/g)||[]))].slice(0,12) };
  return out;
}
"""

PRE_JS = r"""
() => {
  const out = {};
  const vh = window.innerHeight;
  const revealCand = []; let cnt = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (cnt++ > 6000) break;
    const r = el.getBoundingClientRect();
    if (r.top < vh || r.height < 30 || r.width < 30) continue;
    const cs = getComputedStyle(el); const op = parseFloat(cs.opacity); const tr = cs.transform;
    if (op < 0.15 || (tr && tr !== 'none')) {
      el.setAttribute('data-msr-id', String(revealCand.length));
      revealCand.push({ id: revealCand.length, op, tr: tr && tr !== 'none' ? tr : null,
        td: cs.transitionDuration, tf: cs.transitionTimingFunction, tp: cs.transitionProperty,
        ad: cs.animationDuration, an: cs.animationName, af: cs.animationTimingFunction,
        aos: el.getAttribute('data-aos'), aosD: el.getAttribute('data-aos-duration'),
        aosE: el.getAttribute('data-aos-easing'), aosO: el.getAttribute('data-aos-offset') });
      if (revealCand.length >= 60) break; } }
  out.revealPre = revealCand;
  // global AOS/library defaults if present
  out.revealCfg = { aosAttrs: [...new Set([...document.querySelectorAll('[data-aos]')].map(e=>e.getAttribute('data-aos')))].slice(0,10),
    aosDur: [...new Set([...document.querySelectorAll('[data-aos-duration]')].map(e=>e.getAttribute('data-aos-duration')))].slice(0,6),
    aosEase: [...new Set([...document.querySelectorAll('[data-aos-easing]')].map(e=>e.getAttribute('data-aos-easing')))].slice(0,6) };

  return { revealPre: out.revealPre, revealCfg: out.revealCfg };
}
"""

DISMISS_JS = r"""
() => {
  // Suppress entry popups WITHOUT clicking: a click can navigate or open panels and
  // change the very page we are measuring. Hiding the layer is enough for luminance work.
  const vw = innerWidth, vh = innerHeight, hidden = [];
  const popRe = /pop(up|s|_|-|\b)|modal|layer[-_]?pop|dimm?|overlay|banner[-_]?pop|팝업/i;
  const closeRe = /오늘\s*하루|하루\s*동안|그만\s*보기|다시\s*보지|보지\s*않기|일주일\s*동안/;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 100) continue;
    const idcls = ((el.id || '') + ' ' + (el.className || '')).toString();
    const t = (el.innerText || '').replace(/\s+/g, ' ');
    const bigLayer = r.width >= vw * 0.6 && r.height >= vh * 0.5 && cs.position === 'fixed';
    const named = popRe.test(idcls);
    const dismissable = closeRe.test(t.slice(0, 400));
    if (!((named && (dismissable || bigLayer)) || (bigLayer && dismissable))) continue;
    if (el.querySelector('nav, header') && !dismissable) continue;   // never hide the site chrome
    if (parseInt(cs.zIndex || '0', 10) < 1 && !dismissable) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden.push((idcls.slice(0, 28) + ' | ' + t.slice(0, 28)).trim());
    if (hidden.length > 10) break; }

  // Second rule: an anonymous full-viewport fixed layer with no links and no text is a
  // popup DIM backdrop. Left in place it darkens every screenshot and destroys the tone reading.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.9 || r.top > 5) continue;
    if ((el.innerText || '').trim().length > 4) continue;
    if (el.querySelectorAll('a,button,img,video,iframe').length > 0) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden.push('DIM:' + (((el.id || '') + ' ' + (el.className || '')).toString().slice(0, 24) || '(anon)'));
    if (hidden.length > 14) break; }
  return hidden;
}
"""

FIXED_JS = r"""
() => {
  const vh = window.innerHeight, vw = window.innerWidth;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05) return false;
    const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };
  const txt = (el) => (el.innerText||'').replace(/\s+/g,' ').trim();
  document.querySelectorAll('[data-msr-fx]').forEach(el => el.removeAttribute('data-msr-fx'));
  const res = [];
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 18) return;
    if (r.bottom < 0 || r.top > vh) return;
    if (el.parentElement && el.parentElement.closest('[data-msr-fx]')) return;
    el.setAttribute('data-msr-fx','1');
    const links = [...el.querySelectorAll('a,button')].filter(vis).map(a => ({ href:(a.getAttribute('href')||'').slice(0,70), label: txt(a).slice(0,30) }));
    res.push({ pos: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left),
      w: Math.round(r.width), h: Math.round(r.height), z: cs.zIndex, links: links.slice(0,14),
      label: txt(el).slice(0,140), tag: el.tagName.toLowerCase(),
      headerLike: r.top <= 10 && r.width > vw*0.7,
      bottomPinned: (vh - r.bottom) < 26 && r.top > vh*0.45, vh, vw });
  });
  return res;
}
"""

REVEAL_JS = r"""
() => [...document.querySelectorAll('[data-msr-id]')].map(el => {
  const cs = getComputedStyle(el);
  return { id: +el.getAttribute('data-msr-id'), op: parseFloat(cs.opacity), tr: cs.transform === 'none' ? null : cs.transform };
})
"""


def band_luminance(png_bytes, y0, y1):
    """Mean relative luminance + dark-pixel fraction of a horizontal band. Nothing persisted."""
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    a = np.asarray(im, dtype=np.float32)
    h = a.shape[0]
    y0 = max(0, min(h - 1, int(y0)))
    y1 = max(y0 + 1, min(h, int(y1)))
    band = a[y0:y1]
    L = (0.2126 * band[:, :, 0] + 0.7152 * band[:, :, 1] + 0.0722 * band[:, :, 2]) / 255.0
    return {"mean": round(float(L.mean()), 3),
            "darkFrac": round(float((L < 0.35).mean()), 3),
            "lightFrac": round(float((L > 0.65).mean()), 3)}


def measure(url, pw):
    rec = {"url": url}
    browser = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    try:
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        page = ctx.new_page()
        resp = page.goto(url, wait_until="domcontentloaded", timeout=50000)
        rec["status"] = resp.status if resp else None
        rec["finalUrl"] = page.url
        try: page.wait_for_load_state("networkidle", timeout=20000)
        except Exception: pass
        page.wait_for_timeout(3000)
        rec["title"] = page.title()

        # 0) dismiss entry popups -- a full-viewport fixed layer dims every screenshot and
        #    would corrupt the per-section luminance readings.
        rec["popups"] = page.evaluate(DISMISS_JS)
        page.wait_for_timeout(700)

        # 1) capture pre-reveal state BEFORE any scrolling
        pre = page.evaluate(PRE_JS)

        # 2) scroll the whole page so lazy images and reveal libraries (WOW/AOS) fire.
        #    Reveal libs use visibility:hidden below the fold, so the DOM pass must come after this.
        h0 = page.evaluate("document.body.scrollHeight")
        y = 0
        while y < h0:
            y += 650
            page.evaluate(f"window.scrollTo(0,{y})")
            page.wait_for_timeout(260)
        rec["revealPost"] = page.evaluate(REVEAL_JS)
        page.evaluate("window.scrollTo(0,0)")
        page.wait_for_timeout(1400)

        # 3) DOM pass on the fully-revealed page
        m = page.evaluate(JS)
        m["revealPre"] = pre["revealPre"]
        m["revealCfg"] = pre["revealCfg"]
        rec["main"] = m

        # --- rendered-pixel luminance per section (in-memory only) ---
        vh = m["viewport"][1]
        lums = []
        for s in m["sections"][:20]:
            target = max(0, s["absTop"] + min(s["h"], vh) / 2 - vh / 2)
            page.evaluate(f"window.scrollTo(0,{int(target)})")
            page.wait_for_timeout(700)
            shot = page.screenshot(type="png")
            top_in_view = s["absTop"] - int(target)
            y0 = max(0, top_in_view) + 10
            y1 = min(vh, top_in_view + s["h"]) - 10
            if y1 - y0 < 20:
                y0, y1 = 10, vh - 10
            lums.append({"i": s["i"], **band_luminance(shot, y0, y1)})
        rec["sectionLum"] = lums

        page.evaluate("window.scrollTo(0,0)")
        page.wait_for_timeout(1200)
        shot = page.screenshot(type="png")
        rec["heroLum"] = band_luminance(shot, 0, vh)
        rec["heroLumBelowNav"] = band_luminance(shot, 110, vh)
        rec["fixedTop"] = page.evaluate(FIXED_JS)

        h = m["scrollHeight"]
        page.evaluate(f"window.scrollTo(0,{int(h*0.5)})")
        page.wait_for_timeout(1000)
        rec["fixedMid"] = page.evaluate(FIXED_JS)
        ctx.close()

        # --- mobile pass ---
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        p2 = ctx2.new_page()
        p2.goto(url, wait_until="domcontentloaded", timeout=50000)
        try: p2.wait_for_load_state("networkidle", timeout=15000)
        except Exception: pass
        p2.wait_for_timeout(2500)
        p2.evaluate(DISMISS_JS); p2.wait_for_timeout(400)
        rec["mobileScreens"] = p2.evaluate("+(document.body.scrollHeight/window.innerHeight).toFixed(1)")
        p2.evaluate("window.scrollTo(0, document.body.scrollHeight*0.45)")
        p2.wait_for_timeout(1600)
        rec["mobileFixed"] = p2.evaluate(FIXED_JS)
        ctx2.close()
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
        rec["trace"] = traceback.format_exc()[-600:]
    finally:
        browser.close()
    return rec


def slug(u):
    return re.sub(r"[^a-z0-9]+", "-", u.lower().replace("https://", "").replace("www.", "")).strip("-")


if __name__ == "__main__":
    outdir, urls = sys.argv[1], sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as pw:
        for u in urls:
            path = os.path.join(outdir, slug(u) + ".json")
            if os.path.exists(path):
                print(f"--- {u}\n   SKIP (already measured)", flush=True)
                continue
            print(f"--- {u}", flush=True)
            r = measure(u, pw)
            with open(path, "w") as f:      # durable: written immediately per site
                json.dump(r, f, indent=1)
            if "error" in r:
                print(f"   ERROR: {r['error'][:180]}", flush=True)
            else:
                print(f"   ok screens={r['main']['screens']} secs={len(r['main']['sections'])} heroLum={r['heroLum']['mean']}", flush=True)
            print(f"   SAVED {path}", flush=True)
    print("BATCH-DONE", flush=True)
