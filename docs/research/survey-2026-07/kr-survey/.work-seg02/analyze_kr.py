import json, re, sys

SERIF = re.compile(r"serif|georgia|times|garamond|playfair|didot|bodoni|nanum\s*myeongjo|myeongjo|batang|바탕|명조|gowun\s*batang|song\s*myung|ridi|noto\s*serif|source\s*serif|dm\s*serif|spectral|newsreader|cormorant", re.I)
SANS = re.compile(r"sans|grotesk|grotesque|helvetica|arial|inter|roboto|montserrat|poppins|lato|nunito|raleway|dm\s*sans|gothic|고딕|malgun|맑은|dotum|돋움|gulim|apple\s*sd|pretendard|spoqa|noto\s*sans|nanum\s*(gothic|square|barun)|s[-_ ]?core|suit|gmarket|scdream|elice|paperlogy|wanted|freesentation|neue|futura|avenir|proxima|circular|satoshi|manrope|figtree|outfit|jost|urbanist|segoe|system-ui|-apple-system", re.I)
DISPLAY = re.compile(r"display|script|cursive|handwrit|marker|brush|clash|monument|druk|bebas|anton|oswald|abril|tenada|jalnan|눈누|hakgyo|캘리", re.I)

SEC_RULES = [
    ("providers",  r"의료진|의료\s*진|대표\s*원장|원장(단|님)?\s*(소개)?|전문의|MEDICAL\s*STAFF|DOCTORS?\b|메디컬\s*스탭|집도"),
    ("beforeafter",r"전\s*[·\/]\s*후|비포\s*[·\/&]?\s*애프터|BEFORE\s*[&\/]?\s*AFTER|수술\s*전후|시술\s*전후|B\s*&\s*A"),
    ("reviews",    r"후기|리얼\s*스토리|체험\s*기|리뷰|REVIEW|TESTIMONIAL|생생\s*한\s*이야기|고객\s*의\s*소리"),
    ("faq",        r"자주\s*(하는|묻는|찾는)\s*질문|FAQ|Q\s*&\s*A|QNA|궁금(증|한)\s*점"),
    ("events",     r"이벤트|프로모션|EVENT|특가|기획전|혜택\s*안내|할인"),
    ("insurance",  r"비용\s*안내|가격\s*안내|진료\s*비용|비급여|보험|할부"),
    ("videos",     r"영상|유튜브|YOUTUBE|VIDEO|미디어|방송|TV|출연"),
    ("gallery",    r"갤러리|GALLERY|둘러보기|병원\s*(전경|내부|시설|투어)|인테리어|시설\s*안내|TOUR"),
    ("location",   r"오시는\s*길|찾아\s*오시는|위치\s*안내|진료\s*시간|주차\s*안내|LOCATION|CONTACT\s*US|약도|ADDRESS"),
    ("booking",    r"예약|상담\s*신청|온라인\s*상담|빠른\s*상담|간편\s*상담|문의\s*하기|카카오\s*톡|CONSULT|RESERVATION|COUNSEL"),
    ("about",      r"병원\s*소개|소개\s*합니다|인사말|철학|ABOUT|브랜드\s*스토리|우리는|가치|약속|철학|PHILOSOPHY|스토리"),
    ("trust",      r"인증|수상|지정\s*(병원|기관)|선정|누적|건\s*이상|명\s*이상|년\s*(의\s*)?경력|특허|학회|논문|언론|보도|왜\s|이유|차별|WHY|강점|시스템|안전"),
    ("services",   r"진료\s*(과목|안내|분야)|시술|수술|클리닉|프로그램|PROGRAM|SPECIAL|시그니처|성형|교정|임플란트|리프팅|눈|코|가슴|피부|치료|SERVICE|MENU|주요"),
    ("notice",     r"공지|NOTICE|새소식|뉴스|NEWS"),
]

def sec_type(s, idx):
    if idx == 0: return "hero"
    blob = " ".join(s.get("headings") or []) + " " + (s.get("keyText") or "")[:320]
    blob = blob.replace("​", "")
    for name, pat in SEC_RULES:
        if re.search(pat, blob, re.I): return name
    if s.get("media", 0) >= 3 and s.get("chars", 0) < 80: return "other(이미지밴드)"
    if s.get("chars", 0) < 40: return "other(텍스트없음)"
    return "other(미분류)"

def fam_class(f):
    if not f: return "미확인"
    first = f.split(",")[0].strip().strip('"\'')
    if DISPLAY.search(first) and not SERIF.search(first): return "디스플레이"
    if SERIF.search(first): return "세리프"
    if SANS.search(first): return "산세리프"
    rest = ",".join(f.split(",")[1:])
    if re.search(r"sans-serif", rest, re.I): return f"미확인(폴백만산세리프):{first}"
    if re.search(r"(?<!sans-)serif", rest, re.I): return f"미확인(폴백만세리프):{first}"
    return f"미확인:{first}"

def brightness(mean, darkFrac, lightFrac):
    if mean is None: return "미확인"
    if mean >= 0.65 or (lightFrac or 0) >= 0.60: return "라이트"
    if mean <= 0.35 or (darkFrac or 0) >= 0.60: return "다크"
    return "중간"

def chan(links):
    kinds = set()
    for l in links:
        hr = (l.get("href") or ""); lb = l.get("label") or ""
        blob = hr + " " + lb
        if hr.startswith("tel:"): kinds.add("전화")
        elif hr.startswith("sms:"): kinds.add("문자")
        elif hr.startswith("mailto:"): kinds.add("이메일")
        elif re.search(r"kakao|카톡|카카오", blob, re.I): kinds.add("카카오톡")
        elif re.search(r"instagram", hr, re.I): kinds.add("인스타")
        elif re.search(r"youtube|youtu\.be", hr, re.I): kinds.add("유튜브")
        elif re.search(r"blog\.naver|m\.place\.naver|naver", hr, re.I): kinds.add("네이버")
        elif re.search(r"예약|reserv", blob, re.I): kinds.add("예약")
        elif re.search(r"상담|문의|consult|counsel", blob, re.I): kinds.add("상담")
        elif re.search(r"오시는|찾아|location|map", blob, re.I): kinds.add("오시는길")
        elif re.search(r"top|위로|맨위", blob, re.I): kinds.add("TOP")
        elif hr: kinds.add("기타")
    return sorted(kinds)

def show(r):
    print("=" * 100)
    if "error" in r:
        print(r["url"], " *** ERROR:", r["error"][:200]); return
    m = r["main"]; f = m["features"]; h = m["hero"]
    print(f"{r['url']}  [{r.get('status')}]  {r.get('title','')[:70]}")
    print(f"  screens desktop={m['screens']} mobile={r.get('mobileScreens')} | sections={len(m['sections'])} parent={m['sectionParentTag']} cover={m.get('sectionCoverRatio')} pageTextLen={m['pageTextLen']}")
    hl = r.get("heroLum", {}); hl2 = r.get("heroLumBelowNav", {})
    print(f"  HERO pixLum={hl.get('mean')} dark%={hl.get('darkFrac')} light%={hl.get('lightFrac')} -> {brightness(hl.get('mean'),hl.get('darkFrac'),hl.get('lightFrac'))} | belowNav={hl2.get('mean')}")
    if h:
        tl = h["textLum"]
        print(f"   cssBgLum={h['bgLum']} bgMedia={h['bgMedia']} textLum={tl} ({'밝은글자' if (tl or 0)>0.6 else '어두운글자' if tl is not None else '미확인'})")
        print(f"   media={h['mediaKind']} place={h['mediaPlace']} covW={h['mediaCoverW']} covH={h['mediaCoverH']} slides={h['slides']} anchors={h['anchorCount']}")
        ct=[c for c in h["ctas"] if c["isCta"]]
        print(f"   heroCTA({len(ct)}/{len(h['ctas'])}): "+str([(c['label'][:16], 'filled' if c['filled'] else ('outline' if c['outline'] else 'plain'), str(c['w'])+'x'+str(c['h']), c['radius']) for c in ct][:6]))
    print(f"  STATS: {f['statLike']}")
    lm = {x["i"]: x for x in r.get("sectionLum", [])}
    seq=[]; codes=[]
    print("  SECTIONS:")
    for s in m["sections"]:
        L = lm.get(s["i"], {})
        b = brightness(L.get("mean"), L.get("darkFrac"), L.get("lightFrac"))
        t = sec_type(s, s["i"])
        seq.append(b); codes.append(t)
        dens = "짧음" if s["chars"] < 100 else ("중간" if s["chars"] <= 400 else "긺")
        print(f"   [{s['i']:2d}] {t:20s} h={s['h']:5d} chars={s['chars']:5d}({dens}) img={s['media']:3d} pixLum={L.get('mean')} -> {b:4s} css={s['bgKey']:12s} | {(' / '.join(s['headings']))[:80]}")
    trans = sum(1 for a,b in zip(seq,seq[1:]) if a!=b and "미확인" not in (a,b))
    hard  = sum(1 for a,b in zip(seq,seq[1:]) if {a,b}=={"라이트","다크"})
    keys = sorted(set(s['bgKey'] for s in m['sections']))
    print(f"  ★CODE: {'→'.join(codes)}")
    print(f"  TONE seq={seq} 전환={trans} 급전환={hard} bgKeys({len(keys)})={keys}")
    print("  OUTLINE:", " | ".join(o['t'][:36] for o in m["outline"][:18]))
    t = m["type"]
    print(f"  TYPE h1={fam_class(t['h1'])}[{(t['h1'] or '')[:34]}] h2={fam_class(t['h2'])} body={fam_class(t['body'])}[{(t['body'] or '')[:34]}]")
    print(f"       h1={t['h1Size']}/{t['h1Weight']} h2={t['h2Size']}/{t.get('h2Weight')} h3={t.get('h3Size')} body={t['bodySize']}/{t.get('bodyWeight')} lh={t.get('bodyLH')} bigHead={t.get('bigHeadPx')}px [{(t.get('bigHeadFam') or '')[:26]}] h1Count={t.get('h1Count')} h2Sizes={t.get('h2Sizes')}")
    print(f"       fonts={t['fontFaces']}")
    mo = m["motion"]
    print(f"  MOTION {json.dumps({k:v for k,v in mo.items() if v}, ensure_ascii=False)}")
    pre = {x["id"]: x for x in m["revealPre"]}
    post = {x["id"]: x for x in r.get("revealPost", [])}
    op_rev=[i for i in pre if i in post and post[i]["op"]-pre[i]["op"]>0.3]
    tr_ch=[i for i in pre if i in post and (pre[i]["tr"] or "")!=(post[i]["tr"] or "")]
    print(f"   revealCands={len(pre)} opacity상승={len(op_rev)} transform변화={len(tr_ch)}")
    params=[]
    for i in set(op_rev+tr_ch):
        p=pre[i]
        dy=None
        mm=re.match(r"matrix\(([^)]+)\)", p["tr"] or "")
        if mm:
            v=[float(x) for x in mm.group(1).split(",")]
            dy=round(v[5],1); dx=round(v[4],1)
        else: dx=None
        params.append({"dy":dy,"dx":dx,"td":p.get("td"),"tf":(p.get("tf") or "")[:40],"ad":p.get("ad"),"an":p.get("an"),"aos":p.get("aos"),"aosD":p.get("aosD"),"aosE":p.get("aosE")})
    seen=set(); uniq=[]
    for p in params:
        k=json.dumps(p,ensure_ascii=False)
        if k not in seen: seen.add(k); uniq.append(p)
    print(f"   revealParams(uniq {len(uniq)}): {json.dumps(uniq[:8], ensure_ascii=False)}")
    print(f"   revealCfg={json.dumps(m.get('revealCfg',{}), ensure_ascii=False)}")
    def fx(lst, tag):
        print(f"  {tag} ({len(lst)}):")
        for e in lst:
            shape = "가로바" if e["w"] > e["h"]*2.2 else ("세로스택" if e["h"] > e["w"]*1.6 else "블록")
            print(f"   {e['pos']:6s} top={e['top']:5d} bot={e['bottom']:5d} L={e['left']:5d} {e['w']}x{e['h']} {shape} hdr={e['headerLike']} btmPin={e.get('bottomPinned')} n={len(e['links'])} kinds={chan(e['links'])} | {e['label'][:60]}")
    fx(r.get("fixedMid", []), "FIXED desktop mid")
    fx(r.get("mobileFixed", []), "FIXED mobile390 mid")
    print(f"  FEAT video={f['videoTag']}/{f['videoEmbed']} forms={f['formCount']} inputs={f['inputCount']} details={f['detailsCount']} accordion={f['accordionCount']} tel={f['telLinks']} kakao={f['kakao']} naver={f['naverLinks']} insta={f['instaLinks']} yt={f['ytLinks']} reviewW={f['reviewWidgets']}")
    print(f"  KW team={f['kwTeam']} reviews={f['kwReviews']} faq={f['kwFaq']} booking={f['kwBooking']} promo={f['kwPromo']} b/a={f['kwBeforeAfter']} gallery={f['kwGallery']} video={f['kwVideo']} trust={f['kwTrust']} loc={f['kwLocation']} about={f['kwAbout']} cost={f['kwInsurance']} notice={f['kwNotice']}")

if __name__ == "__main__":
    for path in sys.argv[1:]:
        data = json.load(open(path))
        for r in (data if isinstance(data, list) else [data]):
            show(r)
