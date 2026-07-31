import json, re, sys

SERIF = re.compile(r"serif|georgia|times|garamond|playfair|didot|bodoni|canela|freight|tiempos|lora|merriweather|cormorant|instrument\s*serif|noto\s*serif|source\s*serif|dm\s*serif|libre\s*baskerville|baskerv|spectral|newsreader|editorial|domaine|ogg|caslon|minion|utopia|recoleta|fraunces", re.I)
SANS = re.compile(r"sans|grotesk|grotesque|helvetica|arial|inter|roboto|montserrat|poppins|lato|open\s*sans|nunito|raleway|work\s*sans|dm\s*sans|gotham|graphik|neue|futura|avenir|proxima|circular|satoshi|manrope|figtree|outfit|sohne|söhne|aeonik|gilroy|jost|urbanist|switzer|general\s*sans|suisse|akzidenz|univers|maison|apercu|greycliff|brandon|museo\s*sans|segoe|system-ui|-apple-system", re.I)
DISPLAY = re.compile(r"display|script|cursive|handwrit|marker|brush|clash|monument|druk|obviously|migra|reckless|schabo|bebas|anton|oswald|abril", re.I)

def fam_class(f):
    if not f: return "미확인"
    first = f.split(",")[0].strip().strip('"\'')
    if DISPLAY.search(first) and not SERIF.search(first): return "디스플레이"
    if SERIF.search(first): return "세리프"
    if SANS.search(first): return "산세리프"
    rest = ",".join(f.split(",")[1:])
    if re.search(r"sans-serif", rest, re.I): return f"미확인(폴백만 산세리프): {first}"
    if re.search(r"(?<!sans-)serif", rest, re.I): return f"미확인(폴백만 세리프): {first}"
    return f"미확인: {first}"

def brightness(mean, darkFrac, lightFrac):
    if mean is None: return "미확인"
    if mean >= 0.65 or (lightFrac or 0) >= 0.60: return "라이트"
    if mean <= 0.35 or (darkFrac or 0) >= 0.60: return "다크"
    return "mixed"

def show(r):
    print("=" * 96)
    if "error" in r:
        print(r["url"], "  *** ERROR:", r["error"][:180]); return
    m = r["main"]; f = m["features"]; h = m["hero"]
    print(f"{r['url']}  [{r.get('status')}]  {r.get('title','')[:70]}")
    print(f"  US? state={f['kwUSState']} phone={f['phoneUS']}  implant={f['kwImplant']} cosmetic={f['kwCosmetic']}")
    print(f"  screens desktop={m['screens']} mobile={r.get('mobileScreens')}  sections={len(m['sections'])} parent={m['sectionParentTag']}  pageTextLen={m['pageTextLen']}")
    hl = r.get("heroLum", {}); hl2 = r.get("heroLumBelowNav", {})
    print(f"  HERO pixLum={hl.get('mean')} dark%={hl.get('darkFrac')} light%={hl.get('lightFrac')} -> {brightness(hl.get('mean'), hl.get('darkFrac'), hl.get('lightFrac'))}   (belowNav {hl2.get('mean')})")
    if h:
        print(f"       cssBgLum={h['bgLum']} bgMedia={h['bgMedia']} textLum={h['textLum']} ({'밝은글자' if (h['textLum'] or 0)>0.6 else '어두운글자' if h['textLum'] is not None else '미확인'})")
        print(f"       media={h['mediaKind']} place={h['mediaPlace']} covW={h['mediaCoverW']} covH={h['mediaCoverH']} slides={h['slides']} anchors={h['anchorCount']}")
        ct = [c for c in h["ctas"] if c["isCta"]]
        print(f"       heroCTAs({len(ct)}/{len(h['ctas'])}): " + str([(c['label'][:22], 'filled' if c['filled'] else ('outline' if c['outline'] else 'plain'), f"{c['w']}x{c['h']}") for c in ct][:6]))
        print(f"       heroText: {h['text'][:190]}")
    print(f"  STATS in text: {f['statLike']}")
    print("  SECTIONS:")
    lm = {x["i"]: x for x in r.get("sectionLum", [])}
    seq = []
    for s in m["sections"]:
        L = lm.get(s["i"], {})
        b = brightness(L.get("mean"), L.get("darkFrac"), L.get("lightFrac"))
        seq.append(b)
        dens = "짧음" if s["chars"] < 100 else ("중간" if s["chars"] <= 400 else "긺")
        print(f"    [{s['i']}] {s['tag']:7s} h={s['h']:5d} chars={s['chars']:5d}({dens}) img={s['media']:3d} pixLum={L.get('mean')} -> {b:5s} css={s['bgKey']:12s} | {(' / '.join(s['headings']))[:110]}")
    trans = sum(1 for a, b in zip(seq, seq[1:]) if a != b and "미확인" not in (a, b))
    hard = sum(1 for a, b in zip(seq, seq[1:]) if {a, b} == {"라이트", "다크"})
    print(f"  TONE seq={seq}  전환={trans} (라이트<->다크 급전환={hard})  cssBgKeys={sorted(set(s['bgKey'] for s in m['sections']))}")
    print("  OUTLINE:", " | ".join(f"{o['t'][:44]}" for o in m["outline"][:16]))
    t = m["type"]
    print(f"  TYPE h1={fam_class(t['h1'])} [{(t['h1'] or '')[:40]}] h2={fam_class(t['h2'])} body={fam_class(t['body'])} [{(t['body'] or '')[:40]}] | h1 {t['h1Size']}/{t['h1Weight']} body {t['bodySize']}")
    print(f"       다른서체? {'예' if fam_class(t['h1']) != fam_class(t['body']) or (t['h1'] or '').split(',')[0] != (t['body'] or '').split(',')[0] else '아니오(동일)'}")
    mo = m["motion"]
    print(f"  MOTION {json.dumps({k: v for k, v in mo.items() if v})}")
    pre = {x["id"]: x for x in m["revealPre"]}
    post = {x["id"]: x for x in r.get("revealPost", [])}
    op_rev = [i for i in pre if i in post and post[i]["op"] - pre[i]["op"] > 0.3]
    tr_ch = [i for i in pre if i in post and (pre[i]["tr"] or "") != (post[i]["tr"] or "")]
    print(f"       revealCands={len(pre)} opacity상승={len(op_rev)} transform변화={len(tr_ch)}")
    def fx(lst, tag):
        print(f"  {tag}:")
        for e in lst:
            kinds = set()
            for l in e["links"]:
                hr = l["href"]
                if hr.startswith("tel:"): kinds.add("전화")
                elif hr.startswith("sms:"): kinds.add("문자")
                elif hr.startswith("mailto:"): kinds.add("이메일")
                elif "wa.me" in hr or "whatsapp" in hr: kinds.add("왓츠앱")
                elif re.search(r"nexhealth|zocdoc|flexbook|localmed|book|appoint|schedul|consult", hr + " " + l["label"], re.I): kinds.add("예약")
                elif re.search(r"instagram|facebook|tiktok|youtube|linkedin", hr, re.I): kinds.add("SNS")
                elif re.search(r"contact", hr + " " + l["label"], re.I): kinds.add("문의")
                elif hr: kinds.add("기타링크")
            print(f"    {e['pos']:6s} top={e['top']:5d} bot={e['bottom']:5d} {e['w']}x{e['h']} hdr={e['headerLike']} btmPin={e.get('bottomPinned')} links={len(e['links'])} kinds={sorted(kinds)} | {e['label'][:70]}")
    fx(r.get("fixedMid", []), "FIXED(desktop, mid-scroll)")
    fx(r.get("mobileFixed", []), "FIXED(mobile 390, mid-scroll)")
    print(f"  FEATURES video(tag/embed)={f['videoTag']}/{f['videoEmbed']} forms={f['formCount']}/inputs={f['inputCount']} details={f['detailsCount']} accordion={f['accordionCount']}")
    print(f"           tel={f['telLinks']} sms={f['smsLinks']} mail={f['mailLinks']} wa={f['waLinks']} bookingLinks={f['bookingLinks']} bookingWidget={f['bookingWidget']} reviewWidgets={f['reviewWidgets']}")
    print(f"           kw: team={f['kwTeam']} reviews={f['kwReviews']} faq={f['kwFaq']} insurance={f['kwInsurance']} promo={f['kwPromo']} beforeAfter={f['kwBeforeAfter']}")


if __name__ == "__main__":
    for path in sys.argv[1:]:
        data = json.load(open(path))
        for r in (data if isinstance(data, list) else [data]):
            show(r)
