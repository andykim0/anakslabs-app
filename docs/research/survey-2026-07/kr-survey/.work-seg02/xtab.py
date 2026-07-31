import re, collections, json, sys
VOCAB=["services","providers","videos","reviews","trust","booking","faq","insurance","events","about","location","beforeafter","gallery"]
# (seg, num, name, type, code)  -- codes copied verbatim from each segment report
ROWS=[
 # ---- segment 02 (mine)
 (2,16,"misoro","한의원","hero"),
 (2,17,"iniqueps","성형외과","hero→about→services→trust→gallery→services→reviews+beforeafter→booking+events→location"),
 (2,18,"kseye","안과","hero"),
 (2,19,"faceps","성형외과","hero→beforeafter+reviews→videos→providers→other→events+notice→booking"),
 (2,20,"champodonamu","정형외과척추","hero→about→gallery→providers→services→services→about→trust→videos→videos→other→about→gallery→trust→other→notice→reviews→booking→location"),
 (2,21,"limedent","치과","hero→services→beforeafter+reviews→trust→services+beforeafter→notice+events→other"),
 (2,22,"marbleps","성형외과","hero→videos→videos→videos→gallery→beforeafter→about→events→trust→location"),
 (2,23,"ppeum","기타","hero→notice"),
 (2,24,"hooclinic","한의원","hero→about→beforeafter→services→services→trust→reviews→about→booking→location"),
 (2,25,"cnuclinic","피부과","hero→events→services→trust→videos→location→booking"),
 (2,26,"rebornps","성형외과","hero→videos→services→services→events+notice→beforeafter→booking+notice→location"),
 # ---- segment 03
 (3,31,"smileface","치과","hero→other→services→trust→trust→reviews→trust→gallery→booking→location"),
 (3,32,"deesse","성형외과","hero→gallery→beforeafter→services→gallery→videos→trust→other"),
 (3,36,"startps","성형외과","hero→services→services→beforeafter→gallery→videos→trust→other→location→other"),
 (3,37,"medicubesignature","피부과","hero→other→other→services→trust→other"),
 (3,38,"sdule","피부과","hero→providers→other→other→services→services→location→other"),
 (3,39,"erumeye","안과","hero→about→trust→providers→trust→events→location→other"),
 (3,40,"yjain","한의원","hero→services→other→trust→other→other→trust→other→location→other"),
 (3,34,"vennskincare","기타(화장품몰)","hero→about→other→about→about→other→reviews→about→about→events→other→other"),
 # ---- segment 04
 (4,41,"iddc","치과","hero→services→about→services→insurance+trust→other+reviews+beforeafter→location+booking→other"),
 (4,42,"jwbeauty","성형외과","hero→booking→videos→beforeafter→gallery→services→about→providers→trust→booking+reviews→location"),
 (4,43,"kosleep","기타(수면클리닉)","other→hero→providers→services+trust→videos→about+trust→booking→trust"),
 (4,44,"rubyps","성형외과","hero→reviews+trust→reviews→beforeafter→services→events→trust→location→other"),
 (4,46,"everm","치과","hero→reviews→videos→videos→videos→beforeafter→about→reviews→other→about+trust→trust→location"),
 (4,47,"sooamc","기타(동물병원)","hero→about→services→services→services→services→services→providers→other→videos→reviews→location"),
 (4,48,"jk-withme","다과클리닉","hero→booking→about→services→services→beforeafter→providers→other→location+booking"),
 (4,49,"eyejak","성형외과","other→hero→services→services→other→other→other→booking"),
 (4,51,"withme-medi","기타(요양병원)","hero→booking+trust→services→videos→gallery→location→trust"),
 (4,52,"resexy","산부인과","hero→videos→other→other→booking+gallery+location"),
 (4,53,"glowell","기타(모발이식)","hero→videos→beforeafter→about→services→location→booking"),
]
def toks(c): return set(t for t in re.split(r'[→+]', c))
def main(extra=None):
    rows = ROWS + (extra or [])
    bytype=collections.defaultdict(list)
    for r in rows: bytype[r[3]].append(r)
    order=sorted(bytype.items(), key=lambda x:(-len(x[1]), x[0]))
    print(f"총 {len(rows)}곳 / 유형 {len(order)}종\n")
    print("== 유형별 소계 ==")
    for t,rs in order: print(f"  {t:18s} n={len(rs):2d}  {[r[1] for r in rs]}")
    print("\n== 유형 × 섹션 어휘 ==")
    cols=[t for t,rs in order if len(rs)>=2]
    print("어휘".ljust(13)+"전체".ljust(11)+"".join((t[:7]+f"({len(bytype[t])})").ljust(13) for t in cols))
    for w in VOCAB:
        tot=sum(1 for r in rows if w in toks(r[4]))
        line=w.ljust(13)+f"{tot}/{len(rows)} {round(tot/len(rows)*100)}%".ljust(11)
        for t in cols:
            rs=bytype[t]; c=sum(1 for r in rs if w in toks(r[4]))
            line+=f"{c}/{len(rs)} {round(c/len(rs)*100)}%".ljust(13)
        print(line)
    print("\n(n=1 유형은 컬럼에서 제외, 전체 열에는 포함: " + ", ".join(f"{t}({rs[0][1]})" for t,rs in order if len(rs)==1) + ")")
if __name__=="__main__":
    main()
