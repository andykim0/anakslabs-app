import json,sys,time
from playwright.sync_api import sync_playwright
FIND = r"""
() => {
  const txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
  const links=[...document.querySelectorAll('a')].filter(a=>a.href&&/^https?:/.test(a.href));
  const strict=links.filter(a=>{const t=txt(a); const h=a.getAttribute('href')||'';
    return /의료진\s*소개|의사\s*소개|전문의\s*소개|의료진소개|medical[-_]?staff|doctorList|doctors|mdclStaff|prof/i.test(t+' '+h);});
  const loose=links.filter(a=>/의료진|의사진|전문의/.test(txt(a)));
  return {strict:[...new Set(strict.map(a=>a.href))].slice(0,6), loose:[...new Set(loose.map(a=>a.href))].slice(0,6)};
}
"""
PROV = r"""
() => {
  const vis=e=>{const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden')return false;
    const r=e.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const t=(document.body.innerText||'').replace(/\s+/g,' ').trim();
  let imgs=0; document.querySelectorAll('img').forEach(m=>{if(vis(m))imgs++;});
  return {chars:t.length,imgs,title:document.title,
    원장:(t.match(/원장/g)||[]).length,전문의:(t.match(/전문의/g)||[]).length,교수:(t.match(/교수/g)||[]).length,
    nameTokens:[...new Set((t.match(/[가-힣]{2,4}\s*(?:대표)?(?:원장|과장|부장|교수|박사|전문의)/g)||[]))].length,
    iframes:document.querySelectorAll('iframe').length};
}
"""
jobs=json.loads(sys.argv[1])
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True)
    for j in jobs:
        c=b.new_context(viewport={"width":1440,"height":900},user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        p=c.new_page()
        try:
            p.goto(j["home"],wait_until="domcontentloaded",timeout=45000)
            try: p.wait_for_load_state("networkidle",timeout=15000)
            except Exception: pass
            p.wait_for_timeout(2500)
            found=p.evaluate(FIND)
            url=j.get("force") or (found["strict"][0] if found["strict"] else (found["loose"][0] if found["loose"] else None))
            out={"id":j["id"],"found":found,"used":url}
            if url:
                time.sleep(1.6)
                r=p.goto(url,wait_until="domcontentloaded",timeout=45000)
                try: p.wait_for_load_state("networkidle",timeout=15000)
                except Exception: pass
                p.wait_for_timeout(2500)
                out["page"]=p.evaluate(PROV); out["page"]["status"]=r.status if r else None
            print(json.dumps(out,ensure_ascii=False))
        except Exception as e: print(json.dumps({"id":j["id"],"err":str(e)[:150]},ensure_ascii=False))
        c.close()
        time.sleep(1.6)
    b.close()
