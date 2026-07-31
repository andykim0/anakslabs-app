"""Popup-safe luminance re-measure.
Dismisses layer popups (click close control; fallback: hide full-viewport fixed overlays),
then re-measures hero band + per-band rendered luminance. Records which method was used."""
import json, sys, os, io, re
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

DISMISS = r"""
() => {
  const vw=innerWidth, vh=innerHeight;
  const vis=(el)=>{const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05)return false;
    const r=el.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const txt=(el)=>(el.innerText||el.getAttribute('alt')||el.getAttribute('title')||'').replace(/\s+/g,' ').trim();
  const log={clicked:[],hidden:0};
  // 1) click close controls inside fixed/absolute popup layers
  const closeRe=/^(오늘\s*하루|오늘은\s*그만|하루\s*동안|그만\s*보기|닫기|닫 기|close|CLOSE|×|✕|X)/;
  for(let pass=0;pass<3;pass++){
    let did=false;
    document.querySelectorAll('a,button,span,div,img,input[type=button],input[type=image]').forEach(el=>{
      if(did)return; if(!vis(el))return;
      const r=el.getBoundingClientRect(); if(r.width>420||r.height>120)return;
      const t=txt(el); if(!t||!closeRe.test(t))return;
      const host=el.closest('[style*="position"],div,section');
      let n=el,fixedAnc=false,g=0;
      while(n&&g++<14){const p=getComputedStyle(n).position; if(p==='fixed'||p==='absolute'){fixedAnc=true;break;} n=n.parentElement;}
      if(!fixedAnc)return;
      try{el.click(); log.clicked.push(t.slice(0,24)); did=true;}catch(e){}
    });
    if(!did)break;
  }
  // 2) hide any remaining full-viewport fixed overlay (dim scrim / modal)
  document.querySelectorAll('body *').forEach(el=>{
    const cs=getComputedStyle(el);
    if(cs.position!=='fixed')return;
    if(!vis(el))return;
    const r=el.getBoundingClientRect();
    const coversW=r.width>=vw*0.92, coversH=r.height>=vh*0.80;
    const z=parseInt(cs.zIndex)||0;
    if(coversW&&coversH&&z>=100){ el.style.setProperty('display','none','important'); log.hidden++; return; }
    // popup panels: fixed, mid-screen, not a header/footer bar
    if(z>=100 && r.width>=260 && r.height>=260 && r.top>vh*0.02 && r.bottom<vh*0.99 && r.width<vw*0.92){
      const t=(el.innerText||'').replace(/\s+/g,' ');
      if(/오늘\s*하루|오늘은\s*그만|하루\s*동안|그만\s*보기|팝업|닫기/.test(t)){ el.style.setProperty('display','none','important'); log.hidden++; }
    }
  });
  return log;
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
    if(getComputedStyle(el).position==='fixed')return;
    if(!vis(el))return;
    const r=el.getBoundingClientRect();
    if(r.width<vw*0.82||r.height<200||r.height>H*0.80)return;
    let d=0,n=el; while(n){d++;n=n.parentElement;}
    cand.push({el,top:Math.round(r.top+scrollY),h:Math.round(r.height),depth:d});
  });
  cand.sort((a,b)=>a.top-b.top||b.h-a.h||a.depth-b.depth);
  const kept=[];
  for(const c of cand){ if(!kept.some(k=>!(c.top>=k.top+k.h-8||c.top+c.h<=k.top+8))) kept.push(c); }
  return kept.map((c,i)=>{const cs=getComputedStyle(c.el);const bgc=parseRGB(cs.backgroundColor);
    const t=txt(c.el);
    return {i,tag:c.el.tagName.toLowerCase(),top:c.top,h:c.h,chars:t.length,
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

def blum(png,y0,y1):
    im=Image.open(io.BytesIO(png)).convert("RGB")
    a=np.asarray(im,dtype=np.float32); h=a.shape[0]
    y0=max(0,min(h-1,int(y0))); y1=max(y0+1,min(h,int(y1)))
    b=a[y0:y1]; L=(0.2126*b[:,:,0]+0.7152*b[:,:,1]+0.0722*b[:,:,2])/255.0
    return {"mean":round(float(L.mean()),3),"darkFrac":round(float((L<0.35).mean()),3),
            "lightFrac":round(float((L>0.65).mean()),3)}

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
        rec["dismiss"]=pg.evaluate(DISMISS)
        pg.wait_for_timeout(700)
        H=pg.evaluate("document.body.scrollHeight"); y=0
        while y<H: y+=700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(190)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1100)
        pg.evaluate(DISMISS)   # popups that fire on scroll/exit
        pg.wait_for_timeout(400)
        sh=pg.screenshot(type="png")
        rec["heroLum"]=blum(sh,0,900); rec["heroLumBelowNav"]=blum(sh,110,900)
        bands=pg.evaluate(BAND_JS); rec["bands"]=bands
        out=[]
        for b in bands[:22]:
            tgt=max(0,b["top"]+min(b["h"],900)/2-450)
            pg.evaluate(f"window.scrollTo(0,{int(tgt)})"); pg.wait_for_timeout(480)
            s2=pg.screenshot(type="png"); tiv=b["top"]-int(tgt)
            y0=max(0,tiv)+8; y1=min(900,tiv+b["h"])-8
            if y1-y0<20: y0,y1=8,892
            out.append({"i":b["i"],**blum(s2,y0,y1)})
        rec["bandLum"]=out
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
            print("  dismiss",r.get("dismiss"),"hero",r.get("heroLumBelowNav"),"bands",len(r.get("bands",[])),r.get("error","")[:120],flush=True)
    print("RELUM-DONE",flush=True)
