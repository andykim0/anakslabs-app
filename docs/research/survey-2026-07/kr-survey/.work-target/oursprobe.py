import json,sys,time
from playwright.sync_api import sync_playwright
URL="http://127.0.0.1:3111/preview/V_HGYflLx_o-MpNnzM4JEh1OVdb2NRpv0pFlMIct9m4"
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    c=b.new_context(viewport={"width":1440,"height":900},locale="ko-KR")
    p=c.new_page()
    p.goto(URL,wait_until="networkidle",timeout=120000)
    p.wait_for_timeout(2500)
    # 1) reveal implementation: sample a below-fold section before/while/after entering
    setup = r"""
    () => {
      const vh=innerHeight;
      const els=[...document.querySelectorAll('[data-motion-group],[class*=reveal],[class*=Reveal],[data-reveal],section,div')]
        .filter(e=>{const r=e.getBoundingClientRect(); return r.top+scrollY>vh*1.5 && r.height>80 && r.width>200;});
      const seen=new Set(); const picked=[];
      for(const e of els){ const k=e.tagName+':'+Math.round(e.getBoundingClientRect().top+scrollY);
        if(seen.has(k))continue; seen.add(k); picked.push(e); if(picked.length>=25)break;}
      picked.forEach((e,i)=>e.setAttribute('data-probe',String(i)));
      return picked.map((e,i)=>{const cs=getComputedStyle(e);
        return {i, top:Math.round(e.getBoundingClientRect().top+scrollY),
          op:cs.opacity, tr:cs.transform, dur:cs.transitionDuration, ease:cs.transitionTimingFunction,
          delay:cs.transitionDelay, anim:cs.animationName, animDur:cs.animationDuration,
          attrs:[...e.attributes].map(a=>a.name).filter(n=>/motion|reveal|aos|anim/i.test(n))};});
    }
    """
    pre=p.evaluate(setup)
    print("PRE (below-fold sample):")
    for x in pre[:14]:
        print("  ",json.dumps(x,ensure_ascii=False))
    read = r"""
    () => [...document.querySelectorAll('[data-probe]')].map(e=>{const cs=getComputedStyle(e);
      return {i:+e.getAttribute('data-probe'),op:cs.opacity,tr:cs.transform,dur:cs.transitionDuration,
        ease:cs.transitionTimingFunction,delay:cs.transitionDelay};})
    """
    h=p.evaluate("document.body.scrollHeight")
    y=0
    while y<h:
        y+=500; p.evaluate(f"window.scrollTo(0,{y})"); p.wait_for_timeout(200)
    p.wait_for_timeout(1500)
    post=p.evaluate(read)
    print("POST:")
    prem={x["i"]:x for x in pre}
    for x in post[:14]:
        a=prem[x["i"]]
        ch = (a["op"]!=x["op"]) or (a["tr"]!=x["tr"])
        print(f"   [{x['i']}] changed={ch} op {a['op']}->{x['op']} tr {a['tr'][:40]}->{x['tr'][:40]} dur {a['dur']}->{x['dur']} ease {x['ease'][:30]}")
    # 2) provider link search
    links = p.evaluate(r"""
    () => {const txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
      return [...document.querySelectorAll('a')].filter(a=>/의료진|의사|전문의|원장/.test(txt(a)+' '+(a.getAttribute('href')||'')))
        .map(a=>({t:txt(a).slice(0,30),h:a.getAttribute('href')})).slice(0,12);}
    """)
    print("PROVIDER LINKS:",json.dumps(links,ensure_ascii=False))
    # 3) floating / sticky CTA
    fx = p.evaluate(r"""
    () => {const vh=innerHeight,vw=innerWidth;
      const vis=e=>{const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden'||parseFloat(c.opacity)<0.05)return false;
        const r=e.getBoundingClientRect(); return r.width>1&&r.height>1;};
      const txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
      const res=[];
      document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);
        if(cs.position!=='fixed'&&cs.position!=='sticky')return; if(!vis(e))return;
        const r=e.getBoundingClientRect(); if(r.width<20||r.height<18)return; if(r.bottom<0||r.top>vh)return;
        if(e.parentElement&&e.parentElement.closest('[data-fx]'))return; e.setAttribute('data-fx','1');
        res.push({pos:cs.position,top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height),
          headerLike:r.top<=10&&r.width>vw*0.7, bottomPinned:(vh-r.bottom)<26&&r.top>vh*0.45,
          links:[...e.querySelectorAll('a,button')].filter(vis).map(a=>({t:txt(a).slice(0,22),h:(a.getAttribute('href')||'').slice(0,50)})).slice(0,12),
          label:txt(e).slice(0,90)});});
      return res;}
    """)
    print("FIXED(mid/bottom):",json.dumps(fx,ensure_ascii=False,indent=1)[:2000])
    b.close()
