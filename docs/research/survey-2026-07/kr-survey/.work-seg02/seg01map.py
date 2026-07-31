"""Normalize segment-01 vocabulary to the unified 14-term vocabulary.
Mapping fixed by team-lead; the 3 ambiguous terms were resolved from seg-01's own card text."""
MAP = {
 "video":"videos",
 "consult-form":"booking", "search+consult":"booking", "booking-band":"booking",
 "qna-board":"booking",                 # lead: seg-01 :209 card counted 상담게시판 as 예약·상담
 "ugc-reviews":"reviews",
 "promo":"events", "promo-grid":"events",
 "stats":"trust", "media/press":"trust",
 "brand":"about",
 "facility":"gallery",
 "branch-list":"location", "contact":"location",
 "intro-gate":"hero", "splash+center-tiles":"hero",
 "service-banner":"services",
 "equipment":"services",                # lead: 장비명+적응증 카탈로그. trust는 별도 스탯밴드에 실재 → 이중매핑 안 함
 "content-tabs":"reviews+videos",       # lead: seg-01 :87 card = 콘텐츠 탭 내 진료후기 + 병원TV 탭
 # pass-through
 "hero":"hero","services":"services","providers":"providers","videos":"videos","reviews":"reviews",
 "trust":"trust","booking":"booking","faq":"faq","insurance":"insurance","events":"events",
 "about":"about","location":"location","beforeafter":"beforeafter","gallery":"gallery",
 # explicit other
 "quickmenu":"other","sns":"other","footer":"other","slider":"other","image-stack detail":"other",
}
RAW = {
 1:"hero(splash+center-tiles)→footer",
 4:"hero→consult-form→beforeafter→video→video→promo→ugc-reviews→providers→about→location",
 5:"hero(video)→slider→quickmenu→about→services→services→providers→content-tabs→facility→sns+location",
 6:"hero(slider×8)→video→brand→ugc-reviews→services→stats→about→contact+location→footer",
 7:"hero(slider)→search+consult→promo→services→providers→video→sns→beforeafter→location→footer",
 8:"hero→video→services→[image-stack detail ×19]→consult-form→location",
 9:"hero(slider×5)→equipment→providers→stats→brand→service-banner→media/press→service-banner→consult-form→location",
 10:"intro-gate(branch-select+booking)→booking-band",
 11:"hero(slider×6)→booking+services→trust+providers→services→services→about→qna-board→brand→location",
 12:"intro-gate(branch-list)",
 13:"hero→promo-grid→sns→services→brand→facility→brand→branch-list→consult-form→footer",
 14:"hero(slider×4)→services→services→services→beforeafter→brand+providers→footer",
}
TYPE = {1:"전문병원",4:"성형외과",5:"종합병원",6:"성형외과",7:"성형외과",8:"다과클리닉",
        9:"피부과",10:"치과",11:"정형외과척추",12:"기타",13:"피부과",14:"기타"}
NAME = {1:"ahnkang",4:"saekimps",5:"ekwangdong",6:"grandsurgery",7:"andps",8:"ilovegangnam",
        9:"beautyskin",10:"goruda",11:"slseoulhospital",12:"doctorpetit",13:"velyb",14:"corea1"}
import re
def norm(code):
    out=[]; unmapped=[]
    for seg in code.split("→"):
        seg=re.sub(r'\[|\]','',seg)
        seg=re.sub(r'\s*×\s*\d+','',seg)          # drop slide counts
        seg=re.sub(r'\((?:[^()]*)\)','',seg).strip()   # drop parentheticals
        if seg in MAP:                      # whole token first (e.g. "search+consult")
            out.append(MAP[seg]); continue
        for part in seg.split("+"):
            p=part.strip()
            if not p: continue
            if p in MAP: out.append(MAP[p])
            else: unmapped.append(p); out.append("other")
    # flatten multi-term mappings like reviews+videos
    flat=[]
    for o in out: flat.extend(o.split("+"))
    return flat, unmapped

ROWS=[]
if __name__=="__main__" or True:
    for n,c in RAW.items():
        flat,un = norm(c)
        ROWS.append((1,n,NAME[n],TYPE[n],"→".join(flat)))
        if un: print(f"  ⚠ {n} {NAME[n]}: 미매핑 {un}")
if __name__=="__main__":
    for r in ROWS: print(f"{r[1]:>3} {r[2]:18s} {r[3]:10s} {r[4]}")
