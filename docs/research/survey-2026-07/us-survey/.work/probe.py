"""2nd pass: first-viewport hero metrics + serif/sans canvas test + fallback section split.
Independent of the 1st pass section heuristic. Writes one JSON per site, immediately."""
import json, sys, os, re, traceback
from playwright.sync_api import sync_playwright

PROBE = r"""
() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { viewport: [vw, vh] };
  const vis = (el) => { const cs = getComputedStyle(el);
    if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05) return false;
    const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };
  const txt = (el) => (el.innerText||'').replace(/\s+/g,' ').trim();
  const inFold = (r) => r.top < vh*0.95 && r.bottom > 0 && r.left < vw && r.right > 0;

  // ---- first-viewport media ----
  let big = null, bigA = 0, kind = null;
  document.querySelectorAll('img,video,iframe').forEach(m => {
    if (!vis(m)) return; const r = m.getBoundingClientRect(); if (!inFold(r)) return;
    const a = Math.min(r.bottom,vh)-Math.max(r.top,0);
    const area = Math.max(0,a) * r.width;
    if (area > bigA) { bigA = area; big = r; kind = m.tagName.toLowerCase(); } });
  let g = 0;
  document.querySelectorAll('body, body *').forEach(d => {
    if (g++ > 2500) return; const cs = getComputedStyle(d);
    if (!(cs.backgroundImage && /url\(/.test(cs.backgroundImage) && !/^linear-gradient|^radial-gradient/.test(cs.backgroundImage))) return;
    if (!vis(d)) return; const r = d.getBoundingClientRect(); if (!inFold(r)) return;
    const a = Math.min(r.bottom,vh)-Math.max(r.top,0);
    const area = Math.max(0,a) * r.width;
    if (area > bigA) { bigA = area; big = r; kind = 'bg-image'; } });
  let place = 'none';
  if (big && bigA > 0) {
    const covW = big.width/vw, covH = (Math.min(big.bottom,vh)-Math.max(big.top,0))/vh;
    const cx = (big.left + big.width/2)/vw;
    if (covW > 0.85 && covH > 0.6) place = 'full-bleed';
    else if (cx < 0.44) place = 'left'; else if (cx > 0.56) place = 'right'; else place = 'center';
    out.foldMedia = { kind, place, covW:+covW.toFixed(2), covH:+covH.toFixed(2) };
  } else out.foldMedia = { kind:null, place:'none', covW:null, covH:null };

  // ---- first-viewport CTAs (exclude fixed header nav) ----
  const ctaRe = /book|appointment|schedule|consult|request|call|contact|get started|new patient|reserve|smile/i;
  const ctas = [];
  document.querySelectorAll('a,button').forEach(b => {
    if (!vis(b)) return; const r = b.getBoundingClientRect(); if (!inFold(r)) return;
    if (r.height < 26 || r.width < 60) return;
    let n = b, fixedAnc = false, gg = 0;
    while (n && gg++ < 8) { if (getComputedStyle(n).position === 'fixed') { fixedAnc = true; break; } n = n.parentElement; }
    const cs = getComputedStyle(b);
    const m = (cs.backgroundColor||'').match(/rgba?\(([^)]+)\)/);
    const p = m ? m[1].split(',').map(parseFloat) : null;
    const alpha = p ? (p.length>3 ? p[3] : 1) : 0;
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const label = txt(b).slice(0,40);
    ctas.push({ label, filled: alpha > 0.06, outline: alpha <= 0.06 && bw > 0.5,
      w: Math.round(r.width), h: Math.round(r.height), fixedAnc, isCta: ctaRe.test(label+' '+(b.getAttribute('href')||'')) }); });
  out.foldCtas = ctas.slice(0, 20);

  // ---- first-viewport slides & text ----
  const slideSel = '.swiper-slide:not(.swiper-slide-duplicate),.slick-slide:not(.slick-cloned),.splide__slide:not(.splide__slide--clone),.glide__slide:not(.glide__slide--clone),[class*="carousel-item"]';
  out.foldSlides = [...document.querySelectorAll(slideSel)].filter(s => vis(s) && inFold(s.getBoundingClientRect())).length;
  let foldText = '';
  document.querySelectorAll('h1,h2,h3,p,span,div').forEach(e => {
    if (foldText.length > 1200) return;
    if (!vis(e)) return; const r = e.getBoundingClientRect(); if (!inFold(r)) return;
    if (e.children.length === 0) { const t = txt(e); if (t) foldText += t + ' | '; } });
  out.foldText = foldText.slice(0, 1200);
  out.foldStats = [...new Set((foldText.match(/\b\d{1,3}(,\d{3})*\+?\s*(years?|yrs|patients|implants|smiles|cases|procedures|reviews|5[- ]star)/gi)||[]))];

  // ---- serif/sans canvas discriminator ----
  // Draw "I" large; a serif "I" has wide top/bottom bars vs its stem, a sans "I" does not.
  const serifTest = (family, weight) => {
    try {
      const S = 200, c = document.createElement('canvas'); c.width = S; c.height = S;
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0,0,S,S);
      x.fillStyle = '#000'; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.font = `${weight||400} 150px ${family}`;
      x.fillText('I', S/2, S/2);
      const d = x.getImageData(0,0,S,S).data;
      const rowInk = (y) => { let a = S, b = -1;
        for (let i = 0; i < S; i++) { const v = d[(y*S+i)*4]; if (v < 128) { if (i < a) a = i; if (i > b) b = i; } }
        return b < 0 ? 0 : b - a + 1; };
      let top = -1, bot = -1;
      for (let y = 0; y < S; y++) if (rowInk(y) > 0) { top = y; break; }
      for (let y = S-1; y >= 0; y--) if (rowInk(y) > 0) { bot = y; break; }
      if (top < 0 || bot <= top) return null;
      const hgt = bot - top;
      const topW = Math.max(rowInk(top+Math.round(hgt*0.02)), rowInk(top+Math.round(hgt*0.05)));
      const midW = rowInk(top + Math.round(hgt*0.5));
      const botW = Math.max(rowInk(bot-Math.round(hgt*0.02)), rowInk(bot-Math.round(hgt*0.05)));
      if (!midW) return null;
      return { topRatio:+(topW/midW).toFixed(2), botRatio:+(botW/midW).toFixed(2), midW, hgt };
    } catch (e) { return null; }
  };
  const h1 = document.querySelector('h1'), h2 = document.querySelector('h2');
  const bodyP = [...document.querySelectorAll('p')].filter(p => vis(p) && txt(p).length > 60)[0] || document.querySelector('p') || document.body;
  const famOf = (el) => el ? getComputedStyle(el).fontFamily : null;
  const wOf = (el) => el ? getComputedStyle(el).fontWeight : 400;
  const headEl = h1 || h2;
  out.serif = { headFam: famOf(headEl), bodyFam: famOf(bodyP),
    head: headEl ? serifTest(famOf(headEl), wOf(headEl)) : null,
    body: bodyP ? serifTest(famOf(bodyP), wOf(bodyP)) : null,
    sameFamily: famOf(headEl) === famOf(bodyP) };

  // ---- fallback section split: full-width blocks at any depth, non-nested ----
  const blocks = [];
  const seen = [];
  document.querySelectorAll('body div, body section, body header, body footer, body main > *, article, aside').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    const w = r.width, h = r.height;
    if (w < vw*0.9 || h < 250) return;
    const top = Math.round(r.top + window.scrollY);
    if (h > document.body.scrollHeight*0.55) return;          // skip whole-page wrappers
    if (seen.some(s => top >= s.top-40 && top+h <= s.top+s.h+40)) return;  // skip nested inside kept block
    seen.push({ top, h });
    blocks.push({ top, h: Math.round(h), tag: el.tagName.toLowerCase(),
      chars: txt(el).length,
      imgs: [...el.querySelectorAll('img,video,iframe')].filter(vis).length,
      heads: [...el.querySelectorAll('h1,h2,h3')].filter(vis).map(x=>txt(x)).slice(0,4),
      text: txt(el).slice(0,220) }); });
  blocks.sort((a,b)=>a.top-b.top);
  out.blocks = blocks.slice(0, 30);
  return out;
}
"""


def slug(u):
    return re.sub(r"[^a-z0-9]+", "-", u.lower().replace("https://", "").replace("www.", "")).strip("-")


def run(url, pw):
    rec = {"url": url}
    b = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    try:
        ctx = b.new_context(viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        p = ctx.new_page()
        r = p.goto(url, wait_until="domcontentloaded", timeout=50000)
        rec["status"] = r.status if r else None
        try: p.wait_for_load_state("networkidle", timeout=18000)
        except Exception: pass
        p.wait_for_timeout(3000)
        rec["probe"] = p.evaluate(PROBE)
        ctx.close()
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
    finally:
        b.close()
    return rec


if __name__ == "__main__":
    outdir, urls = sys.argv[1], sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as pw:
        for u in urls:
            path = os.path.join(outdir, slug(u) + ".json")
            if os.path.exists(path):
                print(f"--- {u}\n   SKIP", flush=True); continue
            print(f"--- {u}", flush=True)
            rec = run(u, pw)
            with open(path, "w") as f:
                json.dump(rec, f, indent=1)
            print(f"   {'ERROR '+rec['error'][:120] if 'error' in rec else 'ok blocks='+str(len(rec['probe']['blocks']))}", flush=True)
            print(f"   PSAVED {path}", flush=True)
    print("PROBE-DONE", flush=True)
