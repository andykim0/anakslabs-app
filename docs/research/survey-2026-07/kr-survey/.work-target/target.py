import json, sys, os, re, time, traceback
from playwright.sync_api import sync_playwright

HOME_JS = r"""
() => {
  const out={}; const vw=innerWidth, vh=innerHeight;
  out.viewport=[vw,vh]; out.scrollHeight=document.body.scrollHeight;
  out.screens=+(document.body.scrollHeight/vh).toFixed(1);
  const vis=e=>{const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden')return false;
    const r=e.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const txt=e=>(e.innerText||'').replace(/\s+/g,' ').trim();
  const absTop=e=>e.getBoundingClientRect().top+scrollY;

  const cands=[document.querySelector('main'),document.body,...document.querySelectorAll('body > div')].filter(Boolean);
  let best=null,bs=-1;
  for(const c of cands){let n=0;for(const ch of c.children){if(!vis(ch))continue;if(ch.getBoundingClientRect().height>180)n++;}
    if(n>bs){bs=n;best=c;}}
  const kidsOf=el=>[...el.children].filter(ch=>{if(!vis(ch))return false;
    const tg=ch.tagName.toLowerCase(); if(['script','style','noscript','link','svg'].includes(tg))return false;
    return ch.getBoundingClientRect().height>180;});
  let secs=[]; if(best) secs=kidsOf(best);
  if(secs.length<=2&&secs.length>0){const inner=[];for(const s of secs){const k=kidsOf(s);if(k.length)inner.push(...k);else inner.push(s);}
    if(inner.length>secs.length)secs=inner;}
  for(let p=0;p<10;p++){let ch=false;const nx=[];
    for(const s of secs){const hh=s.getBoundingClientRect().height;
      if(hh>vh*2.2){const k=kidsOf(s);
        if(k.length>=2){nx.push(...k);ch=true;continue;}
        if(k.length===1&&k[0].getBoundingClientRect().height>vh*1.5){nx.push(k[0]);ch=true;continue;}}
      nx.push(s);}
    secs=nx; if(!ch)break;}
  secs=secs.filter((s,i,a)=>!a.some((o,j)=>j!==i&&o!==s&&o.contains(s)));

  const mediaCount=el=>{let n=0;el.querySelectorAll('img,video,picture,iframe').forEach(m=>{if(vis(m))n++;});
    let g=0;el.querySelectorAll('*').forEach(d=>{if(g++>900||n>60)return;const bi=getComputedStyle(d).backgroundImage;
      if(bi&&/url\(/.test(bi)&&!/^linear-gradient|^radial-gradient/.test(bi)&&vis(d))n++;});return n;};

  out.sections=secs.map((s,i)=>{const t=txt(s);const r=s.getBoundingClientRect();
    return {i,tag:s.tagName.toLowerCase(),absTop:Math.round(r.top+scrollY),h:Math.round(r.height),
      chars:t.length,headings:[...s.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(h=>txt(h)).filter(x=>x).slice(0,6),
      keyText:t.slice(0,500),media:mediaCount(s),
      imgOnlyHeading:[...s.querySelectorAll('h1,h2,h3')].filter(vis).filter(h=>!txt(h)&&h.querySelector('img')).length};});

  let sel='h1,h2';
  if([...document.querySelectorAll('h1,h2')].filter(vis).length<4) sel='h1,h2,h3,h4';
  out.outline=[...document.querySelectorAll(sel)].filter(e=>vis(e)&&txt(e).length>1&&txt(e).length<120)
    .map(h=>({y:Math.round(absTop(h)),tag:h.tagName.toLowerCase(),t:txt(h).slice(0,70)}))
    .sort((a,b)=>a.y-b.y).slice(0,60);

  // ---- type scale + image-heading detection ----
  const px=e=>e?parseFloat(getComputedStyle(e).fontSize):null;
  const bodyP=[...document.querySelectorAll('p,li,dd')].filter(p=>vis(p)&&txt(p).length>60)[0]
    ||[...document.querySelectorAll('p')].filter(vis)[0]||document.body;
  const h1s=[...document.querySelectorAll('h1')].filter(vis);
  const h2s=[...document.querySelectorAll('h2')].filter(vis);
  const h1=h1s[0]||document.querySelector('h1'), h2=h2s[0]||document.querySelector('h2');
  const allH=[...document.querySelectorAll('h1,h2,h3')].filter(vis);
  out.type={
    h1Px:px(h1), h2Px:px(h2), bodyPx:px(bodyP),
    h1Fam:h1?getComputedStyle(h1).fontFamily:null, bodyFam:bodyP?getComputedStyle(bodyP).fontFamily:null,
    h1Weight:h1?getComputedStyle(h1).fontWeight:null,
    h1TextLen:h1?txt(h1).length:null, h2TextLen:h2?txt(h2).length:null,
    headingTotal:allH.length,
    headingImgOnly:allH.filter(h=>!txt(h)&&h.querySelector('img')).length,
    headingZeroText:allH.filter(h=>!txt(h)).length,
    // largest visible text size anywhere in first 3 screens (proxy for whether big type is real text)
    maxTextPx:(()=>{let m=0;let g=0;
      document.querySelectorAll('body *').forEach(e=>{if(g++>4000)return;
        if(!vis(e))return; const r=e.getBoundingClientRect(); if(r.top+scrollY>vh*3)return;
        if(!e.children.length&&txt(e).length>1){const s=parseFloat(getComputedStyle(e).fontSize); if(s>m)m=s;}});
      return m;})(),
    imgInFirstScreen:(()=>{let n=0;document.querySelectorAll('img').forEach(m=>{if(!vis(m))return;
      const r=m.getBoundingClientRect(); if(r.top+scrollY<vh&&r.width>200&&r.height>60)n++;});return n;})()
  };

  out.motion={aos:document.querySelectorAll('[data-aos]').length, gsap:!!window.gsap,
    scrollTrigger:!!window.ScrollTrigger, swiper:document.querySelectorAll('.swiper,.swiper-container').length,
    slick:document.querySelectorAll('.slick-slider').length, splide:document.querySelectorAll('.splide').length,
    wow:document.querySelectorAll('.wow').length, animateCss:document.querySelectorAll('[class*="animate__"],.animated').length,
    webflow:document.querySelectorAll('[data-w-id]').length,
    slideEls:document.querySelectorAll('.swiper-slide,.slick-slide,.splide__slide,[class*="carousel-item"]').length};

  const rc=[];let c=0;
  for(const el of document.querySelectorAll('body *')){
    if(c++>6000)break;
    const r=el.getBoundingClientRect();
    if(r.top<vh||r.height<30||r.width<30)continue;
    const cs=getComputedStyle(el);const op=parseFloat(cs.opacity);const tr=cs.transform;
    if(op<0.15||(tr&&tr!=='none')){el.setAttribute('data-msr-id',String(rc.length));
      rc.push({id:rc.length,op,tr:tr&&tr!=='none'?tr:null,dur:cs.transitionDuration,ease:cs.transitionTimingFunction,
        anim:cs.animationName==='none'?null:cs.animationName,animDur:cs.animationDuration,
        aos:el.getAttribute('data-aos'),aosDur:el.getAttribute('data-aos-duration'),aosEase:el.getAttribute('data-aos-easing')});
      if(rc.length>=70)break;}}
  out.revealPre=rc;

  const nav=[...document.querySelectorAll('nav a,header a,[class*=gnb] a,[class*=menu] a,[class*=Gnb] a')]
    .map(a=>txt(a)).filter(t=>t&&t.length<26);
  out.navUniq=[...new Set(nav)].slice(0,60);
  const page=(document.body.innerText||'').replace(/\s+/g,' ');
  out.pageTextLen=page.length;
  const cnt=re=>(page.match(re)||[]).length;
  out.kw={원장:cnt(/원장/g),전문의:cnt(/전문의/g),의료진:cnt(/의료진/g),교수:cnt(/교수/g),
    센터:cnt(/센터/g),지점:cnt(/지점|분원|본원|네트워크/g),병원:cnt(/병원/g),의원:cnt(/의원/g),
    faq:cnt(/자주\s*묻는|자주하는\s*질문|FAQ|Q\s*&\s*A/gi),
    후기:cnt(/후기|리뷰|치료사례/g), 전후:cnt(/전\s*·\s*후|비포|before\s*&\s*after|시술\s*전후/gi),
    예약:cnt(/예약|온라인\s*상담|상담\s*신청/g), 이벤트:cnt(/이벤트|프로모션|혜택/g),
    비급여:cnt(/비급여|진료비|보험|의료급여/g), 오시는길:cnt(/오시는\s*길|찾아오시는|진료\s*시간|주차/g)};
  out.deptHits=[...new Set((page.match(/(정형외과|신경외과|내과|외과|산부인과|소아청소년과|이비인후과|안과|치과|피부과|성형외과|비뇨의학과|영상의학과|재활의학과|마취통증의학과|가정의학과|신경과|정신건강의학과|한방재활|한방내과|침구|대장항문|척추|관절|혈관|검진)/g)||[]))].slice(0,25);
  const links=[...document.querySelectorAll('a')].filter(a=>a.href&&/^https?:/.test(a.href));
  const pick=re=>{const a=links.find(x=>re.test(txt(x))||re.test(x.getAttribute('href')||''));return a?a.href:null;};
  out.providerUrl=pick(/의료진|의사\s*소개|전문의\s*소개|doctor|medical[-_]?staff|staff/i);
  out.centerUrl=pick(/센터\s*소개|진료\s*센터|클리닉\s*안내/);
  return out;
}
"""

REVEAL_JS = r"""
() => [...document.querySelectorAll('[data-msr-id]')].map(el=>{const cs=getComputedStyle(el);
  return {id:+el.getAttribute('data-msr-id'),op:parseFloat(cs.opacity),tr:cs.transform==='none'?null:cs.transform,
    dur:cs.transitionDuration,ease:cs.transitionTimingFunction};})
"""

PROV_JS = r"""
() => {
  const vis=e=>{const c=getComputedStyle(e); if(c.display==='none'||c.visibility==='hidden')return false;
    const r=e.getBoundingClientRect(); return r.width>1&&r.height>1;};
  const t=(document.body.innerText||'').replace(/\s+/g,' ').trim();
  let imgs=0; document.querySelectorAll('img').forEach(m=>{if(vis(m))imgs++;});
  return {chars:t.length, imgs, title:document.title,
    원장:(t.match(/원장/g)||[]).length, 전문의:(t.match(/전문의/g)||[]).length, 교수:(t.match(/교수/g)||[]).length,
    nameTokens:[...new Set((t.match(/[가-힣]{2,4}\s*(?:대표)?(?:원장|과장|부장|교수|박사)/g)||[]))].length,
    iframes:document.querySelectorAll('iframe').length};
}
"""

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("http://","").replace("www.","")).strip("-")

def run(entry, pw, delay_ms):
    u=entry["url"]; rec={"sample_id":entry["sample_id"],"name":entry["name"],"url":u,"stratum":entry["stratum"]}
    b=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
    try:
        c=b.new_context(viewport={"width":1440,"height":900},device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        p=c.new_page()
        r=p.goto(u,wait_until="domcontentloaded",timeout=50000)
        rec["status"]=r.status if r else None; rec["finalUrl"]=p.url
        try: p.wait_for_load_state("networkidle",timeout=20000)
        except Exception: pass
        p.wait_for_timeout(3000)
        rec["title"]=p.title()
        m=p.evaluate(HOME_JS); rec["home"]=m
        h=m["scrollHeight"]; y=0
        while y<h and y<60000:
            y+=650; p.evaluate(f"window.scrollTo(0,{y})"); p.wait_for_timeout(260)
        p.wait_for_timeout(1200)
        rec["revealPost"]=p.evaluate(REVEAL_JS)
        # provider page
        pu=m.get("providerUrl")
        if pu:
            time.sleep(delay_ms/1000.0)
            try:
                r2=p.goto(pu,wait_until="domcontentloaded",timeout=45000)
                try: p.wait_for_load_state("networkidle",timeout=15000)
                except Exception: pass
                p.wait_for_timeout(2500)
                pv=p.evaluate(PROV_JS); pv["url"]=pu; pv["status"]=r2.status if r2 else None
                rec["providerPage"]=pv
            except Exception as e: rec["providerPage"]={"url":pu,"error":f"{type(e).__name__}: {e}"[:150]}
        else: rec["providerPage"]=None
        c.close()
    except Exception as e:
        rec["error"]=f"{type(e).__name__}: {e}"[:200]; rec["trace"]=traceback.format_exc()[-400:]
    finally: b.close()
    return rec

if __name__=="__main__":
    outdir=sys.argv[1]; os.makedirs(outdir,exist_ok=True)
    entries=json.load(open(sys.argv[2]))
    with sync_playwright() as pw:
        for e in entries:
            path=os.path.join(outdir, e["sample_id"]+"_"+slug(e["url"])+".json")
            if os.path.exists(path):
                print("SKIP",e["sample_id"],flush=True); continue
            d=e.get("crawlDelayMs",1500)
            print("---",e["sample_id"],e["name"],e["url"],flush=True)
            rec=run(e,pw,d)
            json.dump(rec,open(path,"w"),ensure_ascii=False,indent=1)
            if "error" in rec: print("   ERROR:",rec["error"][:140],flush=True)
            else:
                pp=rec.get("providerPage")
                print(f"   ok screens={rec['home']['screens']} secs={len(rec['home']['sections'])} provider={'None' if not pp else pp.get('chars', pp.get('error'))}",flush=True)
            time.sleep(d/1000.0)
    print("BATCH-DONE",flush=True)
