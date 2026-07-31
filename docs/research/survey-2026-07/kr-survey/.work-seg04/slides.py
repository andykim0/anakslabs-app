"""Targeted slider/carousel + tone-transition probe (DOM only)."""
import json, sys, os, re
from playwright.sync_api import sync_playwright

JS = r"""
() => {
  const vw=innerWidth, vh=innerHeight;
  const vis=(el)=>{const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return false;
    const r=el.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const uniq=(a)=>[...new Set(a)];
  const slideSel='.swiper-slide:not(.swiper-slide-duplicate),.slick-slide:not(.slick-cloned),.splide__slide:not(.splide__slide--clone),.glide__slide:not(.glide__slide--clone),[class*="carousel-item"],li[class*=slide],div[class*=slide]:not([class*=slider]):not([class*=slides])';
  // any element whose children look like a horizontal slide track
  const tracks=[];
  let g=0;
  document.querySelectorAll('body *').forEach(el=>{
    if(g++>9000) return;
    if(!vis(el)) return;
    const kids=[...el.children].filter(vis);
    if(kids.length<2||kids.length>40) return;
    const r=el.getBoundingClientRect();
    if(r.width<vw*0.35||r.height<120) return;
    const cls=(el.className&&el.className.baseVal!==undefined?el.className.baseVal:String(el.className||''));
    const isTrack=/swiper-wrapper|slick-track|splide__list|glide__slides|carousel-inner|slide[-_]?(wrap|list|track|inner)|bx-viewport/i.test(cls);
    if(!isTrack) return;
    tracks.push({cls:cls.slice(0,60),n:kids.length,top:Math.round(r.top+scrollY),w:Math.round(r.width),h:Math.round(r.height)});
  });
  // pagination dot/number counters
  const pags=[];
  document.querySelectorAll('[class*=pagination],[class*=paging],[class*=dots],[class*=indicator],[class*=bullet]').forEach(el=>{
    if(!vis(el))return; const kids=[...el.children].filter(vis);
    if(kids.length>=2&&kids.length<=30){const r=el.getBoundingClientRect();
      pags.push({cls:String(el.className||'').slice(0,50),n:kids.length,top:Math.round(r.top+scrollY)});}
  });
  return {tracks, pags,
    heroTracks: tracks.filter(t=>t.top<vh*1.2),
    heroPags: pags.filter(p=>p.top<vh*1.2),
    bgKeys: uniq([...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();
      return r.width>vw*0.85&&r.height>200;}).slice(0,400).map(e=>{const c=getComputedStyle(e).backgroundColor;return c;})).slice(0,25)};
}
"""

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")

if __name__=="__main__":
    outdir=sys.argv[1]; os.makedirs(outdir,exist_ok=True)
    with sync_playwright() as pw:
        for u in sys.argv[2:]:
            p=os.path.join(outdir,slug(u)+".json")
            if os.path.exists(p): print("SKIP",u,flush=True); continue
            br=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
            rec={"url":u}
            try:
                ctx=br.new_context(viewport={"width":1440,"height":900},
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                pg=ctx.new_page(); pg.goto(u,wait_until="domcontentloaded",timeout=50000)
                try: pg.wait_for_load_state("networkidle",timeout=15000)
                except Exception: pass
                pg.wait_for_timeout(2500)
                H=pg.evaluate("document.body.scrollHeight"); y=0
                while y<H: y+=700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(150)
                pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(800)
                rec.update(pg.evaluate(JS))
            except Exception as e: rec["error"]=f"{type(e).__name__}: {e}"
            finally: br.close()
            json.dump(rec,open(p,"w"),indent=1)
            print(u,"tracks",len(rec.get("tracks",[])),"heroTracks",rec.get("heroTracks"),"heroPags",rec.get("heroPags"),rec.get("error","")[:100],flush=True)
    print("SLIDES-DONE",flush=True)
