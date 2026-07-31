import json,sys,re,collections,os
def tr_px(t):
    m=re.match(r"matrix\(([^)]*)\)",t or "")
    if not m: 
        m3=re.match(r"matrix3d\(([^)]*)\)",t or "")
        if not m3: return None
        v=[float(x) for x in m3.group(1).split(',')]
        return (round(v[12]),round(v[13])) if len(v)>=14 else None
    v=[float(x) for x in m.group(1).split(',')]
    return (round(v[4]),round(v[5])) if len(v)>=6 else None

for path in sys.argv[1:]:
    d=json.load(open(path))
    print("="*100)
    print(f"{d['sample_id']} {d['name']} {d['url']} [{d.get('status')}] {d.get('title','')[:60]}")
    if "error" in d: print("  *** ERROR:",d["error"]); continue
    m=d["home"]; t=m["type"]
    print(f"  screens={m['screens']} secs={len(m['sections'])} pageTextLen={m['pageTextLen']}")
    print(f"  NAV({len(m['navUniq'])}): {m['navUniq'][:34]}")
    print(f"  DEPT: {m['deptHits']}")
    print(f"  KW: {m['kw']}")
    print("  SECTIONS:")
    for s in m["sections"]:
        dens="짧음" if s["chars"]<100 else ("중간" if s["chars"]<=400 else "긺")
        hd=' / '.join(s['headings'])[:100] or s['keyText'][:100]
        print(f"    [{s['i']:2d}] h={s['h']:5d} chars={s['chars']:5d}({dens}) img={s['media']:3d} imgHd={s['imgOnlyHeading']} | {hd}")
    print("  OUTLINE:", " | ".join(o['t'][:34] for o in m["outline"][:28]))
    print(f"  TYPE h1={t['h1Px']}px/{t['h1Weight']} (textLen={t['h1TextLen']}) h2={t['h2Px']}px(textLen={t['h2TextLen']}) body={t['bodyPx']}px")
    print(f"       headings total={t['headingTotal']} imgOnly={t['headingImgOnly']} zeroText={t['headingZeroText']} maxTextPx={t['maxTextPx']} bigImgFirstScreen={t['imgInFirstScreen']}")
    print(f"       h1Fam={(t['h1Fam'] or '')[:52]} bodyFam={(t['bodyFam'] or '')[:52]}")
    print(f"  MOTION {json.dumps({k:v for k,v in m['motion'].items() if v})}")
    pre={x["id"]:x for x in m["revealPre"]}; post={x["id"]:x for x in d.get("revealPost",[])}
    opr=[i for i in pre if i in post and post[i]["op"]-pre[i]["op"]>0.3]
    trc=[i for i in pre if i in post and (pre[i]["tr"] or "")!=(post[i]["tr"] or "")]
    moves=[]
    for i in trc:
        a=tr_px(pre[i]["tr"]); b=tr_px(post[i]["tr"])
        if a and b and a!=b: moves.append((a[0]-b[0],a[1]-b[1]))
    ys=sorted({abs(x[1]) for x in moves if abs(x[1])>1}); xs=sorted({abs(x[0]) for x in moves if abs(x[0])>1})
    durs=collections.Counter(); eases=collections.Counter(); aoss=collections.Counter()
    for x in m["revealPre"]:
        if x.get("dur") and x["dur"]!="0s": durs[x["dur"].split(",")[0]]+=1
        if x.get("ease"): eases[x["ease"].split(",")[0]]+=1
        if x.get("aos"): aoss[f"{x['aos']}/{x.get('aosDur')}/{x.get('aosEase')}"]+=1
        if x.get("anim"): aoss[f"anim:{x['anim']}/{x.get('animDur')}"]+=1
    print(f"  REVEAL cands={len(pre)} op상승={len(opr)} tr변화={len(trc)} | 이동Y={ys[:8]} X={xs[:8]}")
    print(f"         dur={durs.most_common(4)} ease={eases.most_common(3)} aos/anim={aoss.most_common(5)}")
    mean=[x for x in m['sections'] if x['h']>=400]
    print(f"         의미섹션={len(mean)} 평균img={round(sum(x['media'] for x in mean)/max(len(mean),1),1)} 평균chars={round(sum(x['chars'] for x in mean)/max(len(mean),1))}")
    pp=d.get("providerPage")
    print(f"  PROVIDER PAGE: {json.dumps(pp,ensure_ascii=False)[:300] if pp else 'None (링크 미검출)'}")
