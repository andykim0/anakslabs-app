import json, sys, re
from playwright.sync_api import sync_playwright
JS = r"""
() => {
  const txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
  const nav=[...document.querySelectorAll('nav a, header a, [class*=gnb] a, [class*=menu] a')]
    .map(a=>txt(a)).filter(t=>t&&t.length<24);
  const page=(document.body.innerText||'').replace(/\s+/g,' ');
  const grab=(re,n)=>{const o=[];let m,r=new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');
    while((m=r.exec(page))&&o.length<n)o.push(page.slice(Math.max(0,m.index-45),m.index+65)); return o;};
  return {
    title: document.title,
    navUniq: [...new Set(nav)].slice(0,45),
    doctorHits: grab(/원장|전문의|의료진|대표원장|박사/, 12),
    branchHits: grab(/지점|분원|점\b|네트워크|본원|강남점|분당점|전국/, 10),
    deptHits: grab(/성형외과|피부과|치과|안과|정형외과|내과|외과|산부인과|한의원|이비인후과|비뇨|신경과|검진|재활/, 14),
    licenseHits: grab(/의료기관명|상호|병원명|의원|병원|클리닉/, 8),
    counts: {
      원장: (page.match(/원장/g)||[]).length,
      전문의: (page.match(/전문의/g)||[]).length,
      지점분원: (page.match(/지점|분원|본원|네트워크/g)||[]).length,
    }
  };
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
            p.wait_for_timeout(2500)
            p.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            p.wait_for_timeout(1500)
            print("=====", u)
            print(json.dumps(p.evaluate(JS), ensure_ascii=False, indent=1))
        except Exception as e: print(u,"ERR",e)
        c.close()
    b.close()
