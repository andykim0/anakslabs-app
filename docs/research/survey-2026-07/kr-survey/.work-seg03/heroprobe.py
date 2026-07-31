import json, sys
from playwright.sync_api import sync_playwright
JS = r"""
() => {
  const vh=innerHeight, vw=innerWidth;
  const vis=e=>{const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden')return false;
    const r=e.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const slideSel='.swiper-slide:not(.swiper-slide-duplicate),.slick-slide:not(.slick-cloned),.splide__slide:not(.splide__slide--clone),.glide__slide:not(.glide__slide--clone),[class*="carousel-item"],[data-slide],li[class*=slide]';
  // topmost non-fixed, non-nav block of >=400px starting in the first viewport
  const out=[];
  document.querySelectorAll('body *').forEach(e=>{
    const cs=getComputedStyle(e); if(cs.position==='fixed') return;
    if(!vis(e)) return;
    const r=e.getBoundingClientRect(); const top=r.top+scrollY;
    if(top>vh*0.6||r.height<400||r.width<vw*0.6) return;
    if(e.closest('[style*="position: fixed"]')) return;
    const sl=[...e.querySelectorAll(slideSel)].filter(vis).length;
    out.push({tag:e.tagName.toLowerCase(), cls:(e.className||'').toString().slice(0,0), top:Math.round(top),
      h:Math.round(r.height), w:Math.round(r.width), slides:sl, depth:(()=>{let d=0,n=e;while(n=n.parentElement)d++;return d;})()});
  });
  out.sort((a,b)=>b.depth-a.depth);
  // deepest wrapper that still spans the hero and holds the most slides
  const withSlides=out.filter(o=>o.slides>0);
  return {cands: out.slice(0,6), maxSlidesDeep: withSlides.length? Math.min(...withSlides.map(o=>o.slides)) : 0,
    anySlides: withSlides.length? Math.max(...withSlides.map(o=>o.slides)) : 0, n:out.length};
}
"""
urls=sys.argv[1:]
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    for u in urls:
        c=b.new_context(viewport={"width":1440,"height":900}, user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        p=c.new_page()
        try:
            p.goto(u, wait_until="domcontentloaded", timeout=45000)
            try: p.wait_for_load_state("networkidle", timeout=15000)
            except Exception: pass
            p.wait_for_timeout(3000)
            print(u, json.dumps(p.evaluate(JS), ensure_ascii=False))
        except Exception as e: print(u, "ERR", e)
        c.close()
    b.close()
