"""Deep band probe: for sites whose top-level split was too coarse, enumerate
full-width content bands at any depth + per-band rendered luminance."""
import json, sys, os, io, re, traceback
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

BAND_JS = r"""
() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const vis = (el) => { const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden') return false;
    const r = el.getBoundingClientRect(); return r.width>1 && r.height>1; };
  const txt = (el) => (el.innerText||'').replace(/\s+/g,' ').trim();
  const parseRGB = (s) => { if (!s) return null; const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}; };
  const lum = (c) => c ? (0.2126*c.r+0.7152*c.g+0.0722*c.b)/255 : null;
  const mediaCount = (el) => { let n=0; el.querySelectorAll('img,video,picture,iframe').forEach(m=>{ if(vis(m)) n++; });
    let g=0; el.querySelectorAll('*').forEach(d=>{ if(g++>1200||n>80) return; const bi=getComputedStyle(d).backgroundImage;
      if (bi && /url\(/.test(bi) && !/^linear-gradient|^radial-gradient/.test(bi) && vis(d)) n++; }); return n; };

  // collect full-width-ish blocks at any depth, then keep the outermost non-overlapping set
  const cand = [];
  let guard = 0;
  document.querySelectorAll('body *').forEach(el => {
    if (guard++ > 9000) return;
    if (['SCRIPT','STYLE','NOSCRIPT','SVG','PATH'].includes(el.tagName)) return;
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < vw*0.82) return;
    if (r.height < 220) return;
    if (r.height > document.body.scrollHeight*0.80) return;   // too big = wrapper
    cand.push({ el, top: Math.round(r.top+window.scrollY), h: Math.round(r.height), depth: (function(){let d=0,n=el;while(n){d++;n=n.parentElement;}return d;})() });
  });
  cand.sort((a,b)=> a.top-b.top || b.h-a.h || a.depth-b.depth);
  const kept = [];
  for (const c of cand) {
    const overlaps = kept.some(k => !(c.top >= k.top + k.h - 8 || c.top + c.h <= k.top + 8));
    if (!overlaps) kept.push(c);
  }
  return kept.map((c,i) => {
    const cs = getComputedStyle(c.el); const bgc = parseRGB(cs.backgroundColor);
    const bi = cs.backgroundImage;
    const t = txt(c.el);
    return { i, tag: c.el.tagName.toLowerCase(), top: c.top, h: c.h, chars: t.length,
      media: mediaCount(c.el), bgMedia: !!(bi && /url\(/.test(bi)),
      bgLum: bgc && bgc.a>0.05 ? +lum(bgc).toFixed(3) : null,
      headings: [...c.el.querySelectorAll('h1,h2,h3,strong,[class*=tit]')].filter(vis).map(h=>txt(h)).filter(x=>x&&x.length<70).slice(0,6),
      keyText: t.slice(0,420),
      slides: c.el.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate),.slick-slide:not(.slick-cloned),.splide__slide:not(.splide__slide--clone),[class*="carousel-item"]').length };
  });
}
"""

def band_lum(png, y0, y1):
    im = Image.open(io.BytesIO(png)).convert("RGB")
    a = np.asarray(im, dtype=np.float32); h = a.shape[0]
    y0 = max(0, min(h-1, int(y0))); y1 = max(y0+1, min(h, int(y1)))
    b = a[y0:y1]
    L = (0.2126*b[:,:,0] + 0.7152*b[:,:,1] + 0.0722*b[:,:,2])/255.0
    return {"mean": round(float(L.mean()),3), "darkFrac": round(float((L<0.35).mean()),3)}

def run(url, pw):
    rec = {"url": url}
    br = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    try:
        ctx = br.new_context(viewport={"width":1440,"height":900}, device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        pg = ctx.new_page()
        pg.goto(url, wait_until="domcontentloaded", timeout=50000)
        try: pg.wait_for_load_state("networkidle", timeout=18000)
        except Exception: pass
        pg.wait_for_timeout(2500)
        H = pg.evaluate("document.body.scrollHeight")
        y = 0
        while y < H:
            y += 700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(200)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(900)
        bands = pg.evaluate(BAND_JS)
        rec["bands"] = bands
        out = []
        for b in bands[:20]:
            tgt = max(0, b["top"] + min(b["h"],900)/2 - 450)
            pg.evaluate(f"window.scrollTo(0,{int(tgt)})"); pg.wait_for_timeout(550)
            sh = pg.screenshot(type="png")
            tiv = b["top"] - int(tgt)
            y0 = max(0,tiv)+8; y1 = min(900, tiv+b["h"])-8
            if y1-y0 < 20: y0,y1 = 8, 892
            out.append({"i": b["i"], **band_lum(sh,y0,y1)})
        rec["bandLum"] = out
    except Exception as e:
        rec["error"] = f"{type(e).__name__}: {e}"
    finally:
        br.close()
    return rec

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")

if __name__ == "__main__":
    outdir, urls = sys.argv[1], sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as pw:
        for u in urls:
            p = os.path.join(outdir, slug(u)+".json")
            if os.path.exists(p): print("SKIP", u, flush=True); continue
            print("---", u, flush=True)
            r = run(u, pw)
            json.dump(r, open(p,"w"), indent=1)
            print("   bands", len(r.get("bands",[])), r.get("error","")[:120], flush=True)
    print("PROBE2-DONE", flush=True)
