"""Authoritative pass: dismiss layer popups by real click, then full-page capture ->
hero band + per-band rendered luminance, plus clean visual strips for structure coding.
Any scrim that survives clicking is masked out of the luminance math (recorded)."""
import json, sys, os, io, re
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

CLOSE_TEXTS = ["오늘은 그만 볼래요","오늘 하루 열지 않기","오늘 하루 보지 않기","하루동안 열지 않기",
               "오늘하루 열지않기","오늘 하루 그만보기","다시 보지 않기","그만 보기","오늘 그만 보기",
               "하루 동안 보지 않기","닫기","창닫기","CLOSE","Close"]

SCRIM_JS = r"""
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
    if(r.width<120||r.height<120||r.top>vh*1.2)return;
    const t=(el.innerText||'').replace(/\s+/g,' ');
    const popText=/오늘\s*하루|오늘은\s*그만|하루\s*동안|그만\s*보기|다시\s*보지|보지\s*않기|팝업/.test(t);
    const bc=(cs.backgroundColor||'').match(/rgba?\(([^)]+)\)/);
    const parts=bc?bc[1].split(','):null;
    const alpha=parts?(parts.length>3?parseFloat(parts[3]):1):0;
    const dim=(r.width>=vw*0.92&&r.height>=vh*0.80&&alpha>=0.15&&t.trim().length<8);
    if(!popText&&!dim)return;
    out.push({x:Math.round(r.left+scrollX),y:Math.round(r.top+scrollY),
      w:Math.round(r.width),h:Math.round(r.height),z,kind:dim?'scrim':'popup'});
  });
  return out;
}
"""

BAND_JS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"band_js.txt")).read()

def masked_lum(L, mask, y0, y1):
    H=L.shape[0]
    y0=max(0,min(H-1,int(y0))); y1=max(y0+1,min(H,int(y1)))
    b=L[y0:y1]; m=mask[y0:y1]; keep=~m
    frac=float(keep.mean())
    if frac<0.12: return {"mean":None,"darkFrac":None,"lightFrac":None,"usablePx":round(frac,3)}
    v=b[keep]
    return {"mean":round(float(v.mean()),3),"darkFrac":round(float((v<0.35).mean()),3),
            "lightFrac":round(float((v>0.65).mean()),3),"usablePx":round(frac,3)}

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")

def dismiss(pg):
    log=[]
    for _ in range(4):
        did=False
        for t in CLOSE_TEXTS:
            try:
                loc=pg.get_by_text(t,exact=False).first
                if loc.count()==0: continue
                loc.click(timeout=1800)
                log.append(t); did=True; pg.wait_for_timeout(500); break
            except Exception: continue
        if not did: break
    return log

def run(url,pw,shotdir):
    rec={"url":url}
    br=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    try:
        ctx=br.new_context(viewport={"width":1440,"height":900},device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        pg=ctx.new_page(); pg.goto(url,wait_until="domcontentloaded",timeout=50000)
        try: pg.wait_for_load_state("networkidle",timeout=18000)
        except Exception: pass
        pg.wait_for_timeout(3000)
        rec["popupsBefore"]=pg.evaluate(SCRIM_JS)
        rec["dismissed"]=dismiss(pg)
        pg.wait_for_timeout(600)
        H=pg.evaluate("document.body.scrollHeight"); y=0
        while y<H: y+=700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(190)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1300)
        rec["dismissed"]+=dismiss(pg)
        pg.wait_for_timeout(400)
        rec["popupsAfter"]=pg.evaluate(SCRIM_JS)
        bands=pg.evaluate(BAND_JS); rec["bands"]=bands
        png=pg.screenshot(type="png",full_page=True)
        im=Image.open(io.BytesIO(png)).convert("RGB")
        a=np.asarray(im,dtype=np.float32)
        L=(0.2126*a[:,:,0]+0.7152*a[:,:,1]+0.0722*a[:,:,2])/255.0
        mask=np.zeros(L.shape,dtype=bool)
        for p in rec["popupsAfter"]:
            x0=max(0,p["x"]);x1=min(L.shape[1],p["x"]+p["w"])
            y0=max(0,p["y"]);y1=min(L.shape[0],p["y"]+p["h"])
            if x1>x0 and y1>y0: mask[y0:y1,x0:x1]=True
        rec["maskedFrac"]=round(float(mask.mean()),4)
        rec["captureH"]=int(L.shape[0])
        rec["heroLum"]=masked_lum(L,mask,0,900)
        rec["heroLumBelowNav"]=masked_lum(L,mask,110,900)
        rec["bandLum"]=[{"i":b["i"],**masked_lum(L,mask,b["top"]+8,b["top"]+b["h"]-8)} for b in bands[:24]]
        # clean visual strips for structure coding
        w,h=im.size; tw=430
        im2=im.resize((tw,int(h*tw/w)),Image.LANCZOS); w2,h2=im2.size
        n=max(1,min(9,-(-h2//1500))); step=h2//n
        for i in range(n):
            y0=i*step; y1=h2 if i==n-1 else (i+1)*step
            im2.crop((0,y0,w2,y1)).save(os.path.join(shotdir,f"{slug(url)}-f{i}.jpg"),"JPEG",quality=62)
        rec["strips"]=n
    except Exception as e:
        rec["error"]=f"{type(e).__name__}: {e}"
    finally: br.close()
    return rec

if __name__=="__main__":
    outdir=sys.argv[1]; shotdir=sys.argv[2]
    os.makedirs(outdir,exist_ok=True); os.makedirs(shotdir,exist_ok=True)
    with sync_playwright() as pw:
        for u in sys.argv[3:]:
            p=os.path.join(outdir,slug(u)+".json")
            if os.path.exists(p): print("SKIP",u,flush=True); continue
            print("---",u,flush=True)
            r=run(u,pw,shotdir); json.dump(r,open(p,"w"),indent=1)
            print("  popBefore",len(r.get("popupsBefore",[])),"dismissed",r.get("dismissed"),
                  "popAfter",len(r.get("popupsAfter",[])),"masked",r.get("maskedFrac"),
                  "hero",r.get("heroLumBelowNav"),"bands",len(r.get("bands",[])),
                  r.get("error","")[:120],flush=True)
    print("FINAL-DONE",flush=True)
