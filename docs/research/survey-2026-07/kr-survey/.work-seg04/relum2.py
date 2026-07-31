"""Popup-safe luminance via MASKED full-page capture.
full_page screenshot renders fixed layers once at their natural position, so only the
popup/scrim rects need masking - the real (possibly position:fixed) hero is preserved.
Luminance = mean over band pixels EXCLUDING masked rects. Nothing persisted."""
import json, sys, os, io, re
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

# identify popup/scrim layers WITHOUT hiding them
POPUP_JS = r"""
() => {
  const vw=innerWidth, vh=innerHeight;
  const vis=(el)=>{const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05)return false;
    const r=el.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const out=[];
  document.querySelectorAll('body *').forEach(el=>{
    const cs=getComputedStyle(el);
    if(cs.position!=='fixed'&&cs.position!=='absolute')return;
    if(!vis(el))return;
    const z=parseInt(cs.zIndex)||0; if(z<50)return;
    const r=el.getBoundingClientRect();
    if(r.width<120||r.height<120)return;
    if(r.top>vh*1.2)return;                       // only layers over the first screen
    const t=(el.innerText||'').replace(/\s+/g,' ');
    const popText=/오늘\s*하루|오늘은\s*그만|하루\s*동안|그만\s*보기|다시\s*보지|닫기|팝업|보지\s*않기/.test(t);
    // a scrim only counts if it actually darkens pixels - transparent positioning
    // wrappers (often the site's own fixed hero) must NOT be masked
    const bc=(cs.backgroundColor||'').match(/rgba?\(([^)]+)\)/);
    const alpha=bc?(bc[1].split(',').length>3?parseFloat(bc[1].split(',')[3]):1):0;
    const opaqueish=alpha>=0.15||(cs.backdropFilter&&cs.backdropFilter!=='none');
    const scrim=(r.width>=vw*0.92&&r.height>=vh*0.80&&(el.innerText||'').trim().length<8&&opaqueish);
    if(!popText&&!scrim)return;
    if(el.parentElement&&out.some(o=>o.el===el.parentElement))return;
    out.push({el,x:Math.round(r.left+scrollX),y:Math.round(r.top+scrollY),
      w:Math.round(r.width),h:Math.round(r.height),z,kind:scrim?'scrim':'popup',
      full:(r.width>=vw*0.92&&r.height>=vh*0.80)});
  });
  return out.map(o=>({x:o.x,y:o.y,w:o.w,h:o.h,z:o.z,kind:o.kind,full:o.full}));
}
"""

BAND_JS = r"""
() => {
  const vw=innerWidth;
  const vis=(el)=>{const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return false;
    const r=el.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const txt=(el)=>(el.innerText||'').replace(/\s+/g,' ').trim();
  const parseRGB=(s)=>{const m=(s||'').match(/rgba?\(([^)]+)\)/); if(!m)return null;
    const p=m[1].split(',').map(x=>parseFloat(x)); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  const lum=(c)=>c?(0.2126*c.r+0.7152*c.g+0.0722*c.b)/255:null;
  const H=document.body.scrollHeight;
  const cand=[]; let g=0;
  document.querySelectorAll('body *').forEach(el=>{
    if(g++>9000)return;
    if(['SCRIPT','STYLE','NOSCRIPT','SVG'].includes(el.tagName))return;
    if(!vis(el))return;
    const r=el.getBoundingClientRect();
    if(r.width<vw*0.82||r.height<200||r.height>H*0.80)return;
    let d=0,n=el; while(n){d++;n=n.parentElement;}
    cand.push({el,top:Math.round(r.top+scrollY),h:Math.round(r.height),depth:d,
      fixed:getComputedStyle(el).position==='fixed'});
  });
  cand.sort((a,b)=>a.top-b.top||b.h-a.h||a.depth-b.depth);
  const kept=[];
  for(const c of cand){ if(!kept.some(k=>!(c.top>=k.top+k.h-8||c.top+c.h<=k.top+8))) kept.push(c); }
  return kept.map((c,i)=>{const cs=getComputedStyle(c.el);const bgc=parseRGB(cs.backgroundColor);
    const t=txt(c.el);
    return {i,tag:c.el.tagName.toLowerCase(),top:c.top,h:c.h,chars:t.length,fixed:c.fixed,
      media:(()=>{let n=0;c.el.querySelectorAll('img,video,picture,iframe').forEach(m=>{if(vis(m))n++;});
        let q=0;c.el.querySelectorAll('*').forEach(d=>{if(q++>1200||n>80)return;const bi=getComputedStyle(d).backgroundImage;
          if(bi&&/url\(/.test(bi)&&!/^linear-gradient|^radial-gradient/.test(bi)&&vis(d))n++;});return n;})(),
      bgLum:bgc&&bgc.a>0.05?+lum(bgc).toFixed(3):null,
      bgMedia:/url\(/.test(cs.backgroundImage||''),
      headings:[...c.el.querySelectorAll('h1,h2,h3,strong,[class*=tit]')].filter(vis).map(h=>txt(h)).filter(x=>x&&x.length<70).slice(0,6),
      keyText:t.slice(0,380),
      slides:c.el.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate),.slick-slide:not(.slick-cloned),.splide__slide:not(.splide__slide--clone),[class*="carousel-item"]').length};});
}
"""

def masked_lum(arr, mask, y0, y1):
    H = arr.shape[0]
    y0 = max(0, min(H-1, int(y0))); y1 = max(y0+1, min(H, int(y1)))
    L = arr[y0:y1]; M = mask[y0:y1]
    keep = ~M
    frac = float(keep.mean())
    if frac < 0.12:      # almost everything masked -> unusable
        return {"mean": None, "darkFrac": None, "lightFrac": None, "usablePx": round(frac,3)}
    v = L[keep]
    return {"mean": round(float(v.mean()),3), "darkFrac": round(float((v<0.35).mean()),3),
            "lightFrac": round(float((v>0.65).mean()),3), "usablePx": round(frac,3)}

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")

def run(url,pw):
    rec={"url":url}
    br=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    try:
        ctx=br.new_context(viewport={"width":1440,"height":900},device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        pg=ctx.new_page(); pg.goto(url,wait_until="domcontentloaded",timeout=50000)
        try: pg.wait_for_load_state("networkidle",timeout=18000)
        except Exception: pass
        pg.wait_for_timeout(3000)
        H=pg.evaluate("document.body.scrollHeight"); y=0
        while y<H: y+=700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(190)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1300)
        pops=pg.evaluate(POPUP_JS); rec["popups"]=pops
        bands=pg.evaluate(BAND_JS); rec["bands"]=bands
        png=pg.screenshot(type="png", full_page=True)
        im=Image.open(io.BytesIO(png)).convert("RGB")
        a=np.asarray(im,dtype=np.float32)
        L=(0.2126*a[:,:,0]+0.7152*a[:,:,1]+0.0722*a[:,:,2])/255.0
        mask=np.zeros(L.shape,dtype=bool)
        for p in pops:
            x0=max(0,p["x"]); x1=min(L.shape[1],p["x"]+p["w"])
            y0=max(0,p["y"]); y1=min(L.shape[0],p["y"]+p["h"])
            if x1>x0 and y1>y0: mask[y0:y1,x0:x1]=True
        rec["captureH"]=int(L.shape[0]); rec["maskedFrac"]=round(float(mask.mean()),3)
        rec["heroLum"]=masked_lum(L,mask,0,900)
        rec["heroLumBelowNav"]=masked_lum(L,mask,110,900)
        rec["bandLum"]=[{"i":b["i"],**masked_lum(L,mask,b["top"]+8,b["top"]+b["h"]-8)} for b in bands[:22]]
    except Exception as e:
        rec["error"]=f"{type(e).__name__}: {e}"
    finally: br.close()
    return rec

if __name__=="__main__":
    outdir=sys.argv[1]; os.makedirs(outdir,exist_ok=True)
    with sync_playwright() as pw:
        for u in sys.argv[2:]:
            p=os.path.join(outdir,slug(u)+".json")
            if os.path.exists(p): print("SKIP",u,flush=True); continue
            print("---",u,flush=True)
            r=run(u,pw); json.dump(r,open(p,"w"),indent=1)
            print("  pops",len(r.get("popups",[])),"maskedFrac",r.get("maskedFrac"),
                  "hero",r.get("heroLumBelowNav"),"bands",len(r.get("bands",[])),r.get("error","")[:120],flush=True)
    print("RELUM2-DONE",flush=True)
