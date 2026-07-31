import json, sys, os, re
B="/private/tmp/kr-survey/.work-seg04"
def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")
def L(p):
    try: return json.load(open(p))
    except Exception: return None

u=sys.argv[1]; s=slug(u)
d=L(f"{B}/sites/{s}.json"); f=L(f"{B}/final/{s}.json"); sl=L(f"{B}/slides/{s}.json")
print("#### ", u)
if not d or 'error' in (d or {}):
    print("MEASURE ERROR:", (d or {}).get('error'))
if d and 'main' in d:
    m=d['main']
    print("status",d.get('status'),"final",d.get('finalUrl'),"title",d.get('title'))
    print("screens D",m['screens'],"M",d.get('mobileScreens'),"scrollH",m['scrollHeight'])
    print("TYPE",json.dumps(m.get('type'),ensure_ascii=False))
    print("MOTION",json.dumps(m.get('motion'),ensure_ascii=False))
    print("FEAT",json.dumps(m.get('features'),ensure_ascii=False))
    h=m.get('hero') or {}
    print("HERO",json.dumps({k:v for k,v in h.items() if k not in('ctas','text')},ensure_ascii=False))
    ct=[c for c in (h.get('ctas') or []) if c.get('isCta')]
    print("HERO-CTA(isCta)",json.dumps(ct,ensure_ascii=False)[:600])
    print("revealCfg",json.dumps(m.get('revealCfg'),ensure_ascii=False)[:200])
    pre={x['id']:x for x in m.get('revealPre',[])}; post={x['id']:x for x in d.get('revealPost',[])}
    rv=[]
    for i,a in pre.items():
        b=post.get(i)
        if not b: continue
        if a['op']<0.15 and b['op']>0.5:
            rv.append({'op':[a['op'],b['op']],'trPre':a.get('tr'),'trPost':b.get('tr'),'td':a.get('td'),
                       'tf':a.get('tf'),'tp':a.get('tp'),'ad':a.get('ad'),'an':a.get('an'),'af':a.get('af'),
                       'aos':a.get('aos'),'aosD':a.get('aosD'),'aosE':a.get('aosE')})
    print("revealCand",len(pre),"revealedOpacity",len(rv))
    for r in rv[:8]: print("   R:",json.dumps(r,ensure_ascii=False)[:300])
    for k in ('fixedMid','mobileFixed'):
        print("--",k)
        for x in d.get(k,[]):
            print(f"   {x['pos']} top={x['top']} bot={x['bottom']} l={x['left']} w={x['w']} h={x['h']} z={x['z']} hdr={x['headerLike']} btm={x['bottomPinned']} nlinks={len(x['links'])}")
            print("      lbl:",x['label'][:90])
            print("      lnk:",json.dumps(x['links'],ensure_ascii=False)[:400])
if sl:
    print("SLIDES heroTracks",json.dumps(sl.get('heroTracks'),ensure_ascii=False))
    print("SLIDES heroPags",json.dumps(sl.get('heroPags'),ensure_ascii=False))
    print("SLIDES tracks",json.dumps(sl.get('tracks'),ensure_ascii=False)[:700])
    if sl.get('error'): print("SLIDES ERR",sl['error'][:150])
if f:
    print("== FINAL(popup-dismissed)  popBefore",len(f.get('popupsBefore',[])),"dismissed",f.get('dismissed'),
          "popAfter",len(f.get('popupsAfter',[])),"masked",f.get('maskedFrac'))
    print("   heroLum",f.get('heroLum'),"belowNav",f.get('heroLumBelowNav'),"captureH",f.get('captureH'))
    if f.get('error'): print("   ERR",f['error'][:200])
    lm={x['i']:x for x in f.get('bandLum',[])}
    for b in f.get('bands',[]):
        x=lm.get(b['i'],{})
        print(f"  [{b['i']}] {b['tag']} top={b['top']} h={b['h']} chars={b['chars']} media={b['media']} slides={b['slides']} fixed={b.get('fixed')} bgLum={b['bgLum']} bgImg={b['bgMedia']} pxLum={x.get('mean')}")
        if b['headings']: print("      H:",json.dumps(b['headings'],ensure_ascii=False)[:200])
        if b['chars']: print("      T:",b['keyText'][:220])
    print("   bandLumSeq", [x.get('mean') for x in f.get('bandLum',[])])
