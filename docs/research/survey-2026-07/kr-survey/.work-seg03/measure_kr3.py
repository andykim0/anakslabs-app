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

  const cands = [document.querySelector('main'), document.body, ...document.querySelectorAll('body > div')].filter(Boolean);
  let best = null, bestScore = -1;
  for (const c of cands) { let n = 0;
    for (const ch of c.children) { if (!vis(ch)) continue; if (ch.getBoundingClientRect().height > 180) n++; }
    if (n > bestScore) { bestScore = n; best = c; } }
  out.sectionParentTag = best ? best.tagName.toLowerCase() : null;

  let secs = [];
  if (best) for (const ch of best.children) {
    if (!vis(ch)) continue;
    const tag = ch.tagName.toLowerCase();
    if (['script','style','noscript','link','svg'].includes(tag)) continue;
    if (ch.getBoundingClientRect().height < 180) continue;
    secs.push(ch); }
  const kidsOf = (el) => [...el.children].filter(ch => {
    if (!vis(ch)) return false;
    const tg = ch.tagName.toLowerCase();
    if (['script','style','noscript','link','svg'].includes(tg)) return false;
    return ch.getBoundingClientRect().height > 180; });
  if (secs.length <= 2 && secs.length > 0) {
    const inner = [];
    for (const s of secs) { const k = kidsOf(s); if (k.length) inner.push(...k); else inner.push(s); }
    if (inner.length > secs.length) secs = inner; }
  // recursive descent: break monolithic wrappers taller than 2.2 screens
  for (let pass = 0; pass < 10; pass++) {
    let changed = false; const next = [];
    for (const s of secs) {
      const hh = s.getBoundingClientRect().height;
      if (hh > vh * 2.2) { const k = kidsOf(s);
        if (k.length >= 2) { next.push(...k); changed = true; continue; }
        if (k.length === 1 && k[0].getBoundingClientRect().height > vh * 1.5) { next.push(k[0]); changed = true; continue; } }
      next.push(s); }
    secs = next; if (!changed) break; }
  secs = secs.filter((s, i, arr) => !arr.some((o, j) => j !== i && o !== s && o.contains(s)));
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
  let outSel = 'h1,h2';
  if ([...document.querySelectorAll('h1,h2')].filter(vis).length < 4) outSel = 'h1,h2,h3,h4,[class*=tit],[class*=Tit]';
  out.outline = [...document.querySelectorAll(outSel)].filter(el => vis(el) && txt(el).length > 1 && txt(el).length < 120)
    .map(h => ({ y: Math.round(absTop(h)), tag: h.tagName.toLowerCase(), t: txt(h).slice(0,80) }))
    .sort((a,b)=>a.y-b.y).slice(0,60);

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
    const ctaRe = /간|예약|상담|문의|전화|카톡|카코|오는|book|appointment|schedule|consult|reserve|contact|call/i;
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
  out.type = { h1: famOf(h1el), h2: famOf(h2el), body: famOf(bodyP),
    h1Weight: h1el ? getComputedStyle(h1el).fontWeight : null,
    h1Size: h1el ? getComputedStyle(h1el).fontSize : null,
    h2Size: h2el ? getComputedStyle(h2el).fontSize : null,
    h2Weight: h2el ? getComputedStyle(h2el).fontWeight : null,
    bodyWeight: bodyP ? getComputedStyle(bodyP).fontWeight : null,
    bodySize: bodyP ? getComputedStyle(bodyP).fontSize : null,
    fontFaces: [...new Set([...document.fonts].map(f=>f.family))].slice(0,12) };

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

  const revealCand = []; let cnt = 0;
  for (const el of document.querySelectorAll('body *')) {
    if (cnt++ > 6000) break;
    const r = el.getBoundingClientRect();
    if (r.top < vh || r.height < 30 || r.width < 30) continue;
    const cs = getComputedStyle(el); const op = parseFloat(cs.opacity); const tr = cs.transform;
    if (op < 0.15 || (tr && tr !== 'none')) {
      el.setAttribute('data-msr-id', String(revealCand.length));
      revealCand.push({ id: revealCand.length, op, tr: tr && tr !== 'none' ? tr : null,
        dur: cs.transitionDuration, ease: cs.transitionTimingFunction, delay: cs.transitionDelay,
        anim: cs.animationName === 'none' ? null : cs.animationName, animDur: cs.animationDuration,
        aos: el.getAttribute('data-aos'), aosDur: el.getAttribute('data-aos-duration'), aosEase: el.getAttribute('data-aos-easing') });
      if (revealCand.length >= 60) break; } }
  out.revealPre = revealCand;

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
    bookingLinks: [...document.querySelectorAll('a')].filter(a=>/예약|상담|문의|카톡|카카오|온라인|book|appointment|schedule|consult|reserve/i.test(txt(a)+' '+(a.getAttribute('href')||''))).length,
    bookingWidget: document.querySelectorAll('[src*=nexhealth],[href*=nexhealth],[src*=zocdoc],[href*=zocdoc],[src*=flexbook],[href*=flexbook],[src*=localmed],[href*=dentrix],[href*=lighthouse360],[href*=yapi]').length,
    reviewWidgets: document.querySelectorAll('[class*=review],[class*=testimonial],[id*=review],iframe[src*="google.com/maps"],[class*=birdeye],[class*=podium],[class*=swell],[class*=trustindex]').length,
    kakaoLinks: document.querySelectorAll('a[href*="pf.kakao"],a[href*="kakao.com"],a[href*="open.kakao"],a[href*="plus.kakao"]').length,
    naverLinks: document.querySelectorAll('a[href*="talk.naver"],a[href*="booking.naver"],a[href*="blog.naver"],a[href*="m.place.naver"],a[href*="naver.me"]').length,
    instaLinks: document.querySelectorAll('a[href*="instagram.com"]').length,
    ytLinks: document.querySelectorAll('a[href*="youtube.com"],a[href*="youtu.be"]').length,
    mapEmbed: document.querySelectorAll('iframe[src*="map"],[id*="map"],[class*="map"],[class*="Map"]').length,
    kwReviews: has(/후기|리뷰|치료사례|시술후기|고객만족|생생|체험기/),
    kwFaq: has(/자주\s*묻는|자주하는\s*질문|FAQ|Q\s*&\s*A|궁금(증|한)|자주\s*하는/i),
    kwInsurance: has(/비급여|진료비|보험|실비|의료급여|비용\s*안내|가격\s*안내/),
    kwPromo: has(/이벤트|프로모션|할인|특가|무료\s*상담|혜택|EVENT/i),
    kwBeforeAfter: has(/전\s*[·\/]?\s*후|비포\s*애프터|before\s*(&|and|\/)\s*after|변화\s*사진|시술\s*전후|수술\s*전후/i),
    kwTeam: has(/의료진|원장|전문의|닥터|의사\s*소개|메디컬\s*스태프|DOCTOR/i),
    kwBooking: has(/예약|상담\s*신청|온라인\s*상담|빠른\s*상담|문의하기|카톡\s*상담|RESERV/i),
    kwLocation: has(/오시는\s*길|찾아오시는|진료\s*시간|주차|약도|위치\s*안내|LOCATION/i),
    kwGallery: has(/둘러보기|내부\s*전경|병원\s*소개|시설|인테리어|투어|GALLERY|공간/i),
    kwNotice: has(/공지사항|NOTICE|새소식|언론보도|뉴스/i),
    kwPhoneKR: (pageText.match(/0\d{1,2}[-. ]\d{3,4}[-. ]\d{4}/) || [null])[0] ? true : false,
    statLike: [...new Set((pageText.match(/\d{1,3}(,\d{3})*\s*(년|만\s*건|건|회|명|례|여\s*건|년\s*경력|주년)/g)||[]))].slice(0,12) };
  return out;
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
  return { id: +el.getAttribute('data-msr-id'), op: parseFloat(cs.opacity), tr: cs.transform === 'none' ? null : cs.transform,
    dur: cs.transitionDuration, ease: cs.transitionTimingFunction };
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
        m = page.evaluate(JS)
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

        # --- scroll through to trigger reveals ---
        h = m["scrollHeight"]
        y = 0
        while y < h:
            y += 650
            page.evaluate(f"window.scrollTo(0,{y})")
            page.wait_for_timeout(280)
        page.wait_for_timeout(1200)
        rec["revealPost"] = page.evaluate(REVEAL_JS)

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
