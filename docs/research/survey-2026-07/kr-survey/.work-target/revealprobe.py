import json
from playwright.sync_api import sync_playwright
URL="http://127.0.0.1:3111/preview/V_HGYflLx_o-MpNnzM4JEh1OVdb2NRpv0pFlMIct9m4"
JS = r"""
() => {
  const g=[...document.querySelectorAll('[data-ko-reveal-group]')];
  const hide=[...document.querySelectorAll('.m-hide')], show=[...document.querySelectorAll('.m-show')];
  const koRoot=document.querySelector('[data-ko-clinic]');
  const sample=g.slice(0,6).map(e=>{const cs=getComputedStyle(e);
    return {m:e.getAttribute('data-m'), cls:e.className.toString().slice(0,60),
      op:cs.opacity, tr:cs.transform, dur:cs.transitionDuration, ease:cs.transitionTimingFunction,
      top:Math.round(e.getBoundingClientRect().top+scrollY)};});
  return {revealGroups:g.length, mHide:hide.length, mShow:show.length,
    hasKoRoot:!!koRoot, prefersReduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
    sample};
}
"""
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    for label,rm in (("default",None),):
        c=b.new_context(viewport={"width":1440,"height":900},locale="ko-KR",reduced_motion=rm)
        p=c.new_page(); p.goto(URL,wait_until="networkidle",timeout=120000); p.wait_for_timeout(2500)
        print(label,"LOAD:",json.dumps(p.evaluate(JS),ensure_ascii=False))
        h=p.evaluate("document.body.scrollHeight"); y=0
        while y<h: y+=600; p.evaluate(f"window.scrollTo(0,{y})"); p.wait_for_timeout(180)
        p.wait_for_timeout(1200)
        print(label,"AFTER:",json.dumps(p.evaluate(JS),ensure_ascii=False))
        c.close()
    b.close()
