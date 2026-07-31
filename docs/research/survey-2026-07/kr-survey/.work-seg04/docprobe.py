"""Open each site's 의료진/원장 page (found via nav) and count practitioners.
Also scans home for branch/분원 listings. Structure counts only."""
import json,sys,re
from playwright.sync_api import sync_playwright

NAV = r"""
() => [...document.querySelectorAll('a')].map(a=>({h:a.getAttribute('href')||'',t:(a.innerText||'').replace(/\s+/g,' ').trim()}))
"""
COUNT = r"""
() => {
  const vis=e=>{const c=getComputedStyle(e);if(c.display==='none'||c.visibility==='hidden')return false;
    const r=e.getBoundingClientRect();return r.width>1&&r.height>1;};
  const txt=(document.body.innerText||'').replace(/\s+/g,' ');
  const roles=(txt.match(/(대표원장|원장|전문의|수의사|과장|부원장)/g)||[]).length;
  // portrait-like images
  let imgs=0; document.querySelectorAll('img').forEach(i=>{if(!vis(i))return;const r=i.getBoundingClientRect();
    if(r.width>90&&r.height>110&&r.height>=r.width*0.9) imgs++;});
  return {len:txt.length, roleHits:roles, portraits:imgs,
    names:[...new Set((txt.match(/[가-힣]{2,4}\s*(대표원장|원장|전문의|수의사)/g)||[]))].slice(0,20),
    branchHits:[...new Set((txt.match(/[가-힣]{2,6}(점|분원|지점)\b/g)||[]))].slice(0,15)};
}
"""
def run(url,pw,pat=re.compile(r"의료진|의사|원장|doctor|team|staff",re.I)):
    out={"url":url}
    br=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    try:
        ctx=br.new_context(viewport={"width":1440,"height":900},
          user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        pg=ctx.new_page(); pg.goto(url,wait_until="domcontentloaded",timeout=45000)
        try: pg.wait_for_load_state("networkidle",timeout=12000)
        except Exception: pass
        pg.wait_for_timeout(2500)
        links=pg.evaluate(NAV)
        cands=[l for l in links if l["h"] and pat.search(l["t"]+" "+l["h"]) and not l["h"].startswith(("javascript","#","tel","mailto"))]
        out["navMatches"]=[(l["t"][:24],l["h"][:70]) for l in cands][:6]
        out["homeScan"]=pg.evaluate(COUNT)
        if cands:
            try:
                pg.goto(pg.url.split("?")[0] if False else cands[0]["h"] if cands[0]["h"].startswith("http") else __import__("urllib.parse",fromlist=["urljoin"]).urljoin(pg.url,cands[0]["h"]),
                        wait_until="domcontentloaded",timeout=40000)
                try: pg.wait_for_load_state("networkidle",timeout=10000)
                except Exception: pass
                pg.wait_for_timeout(2500)
                out["docPage"]=pg.url
                out["docScan"]=pg.evaluate(COUNT)
            except Exception as e: out["docErr"]=f"{type(e).__name__}: {e}"[:120]
    except Exception as e: out["error"]=f"{type(e).__name__}: {e}"[:150]
    finally: br.close()
    return out

if __name__=="__main__":
    with sync_playwright() as pw:
        for u in sys.argv[1:]:
            r=run(u,pw)
            print("="*72); print(r["url"])
            print("  nav:",r.get("navMatches"))
            print("  home:",json.dumps(r.get("homeScan"),ensure_ascii=False)[:400])
            print("  docPage:",r.get("docPage"),r.get("docErr",""))
            print("  doc:",json.dumps(r.get("docScan"),ensure_ascii=False)[:500])
            if r.get("error"): print("  ERR",r["error"])
