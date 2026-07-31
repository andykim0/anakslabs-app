import json, sys, collections, re

def ease_family(f):
    if not f: return None
    f = f.strip()
    if f.startswith("cubic-bezier"): return f"cubic-bezier{f[12:]}"
    return f

for path in sys.argv[1:]:
    d = json.load(open(path))
    print("=" * 88)
    print(d["url"], "err=", d.get("error", ""))
    pre = {x["id"]: x for x in d.get("pre", [])}
    live = {x["id"]: x for x in d.get("live", [])}
    post = {x["id"]: x for x in d.get("post", {}).get("els", [])}
    kf = d.get("post", {}).get("kf", {})
    print(f"  후보(폴드 아래 리빌 대상) = {len(pre)}")
    revealed = 0
    c = collections.Counter()
    for i, p in pre.items():
        L = live.get(i, {}); Q = post.get(i, {})
        became_vis = p["vis"] == "hidden" and Q.get("vis") == "visible"
        op_up = Q.get("op", 0) - (p.get("op") or 0) > 0.3
        tr_ch = (p.get("tr") or "") != (Q.get("tr") or "")
        if not (became_vis or op_up or tr_ch): continue
        revealed += 1
        an = L.get("an") or Q.get("an")
        k = kf.get(an, {}) if an and an != "none" else {}
        # move distance: keyframe translate, else the pre-scroll transform matrix
        dy = dx = None
        if k: dx, dy = k.get("x"), k.get("y")
        else:
            mm = re.match(r"matrix\(([^)]+)\)", p.get("tr") or "")
            if mm:
                v = [float(x) for x in mm.group(1).split(",")]
                dx, dy = round(v[4], 1), round(v[5], 1)
        dur = L.get("ad") if L.get("ad") not in (None, "0s", "") else None
        if not dur and L.get("td") not in (None, "0s", ""): dur = L.get("td")
        eas = ease_family(L.get("af") if dur == L.get("ad") else L.get("tf")) or ease_family(L.get("af"))
        c[(p.get("cls") or p.get("aos") or an, an, dur, eas, L.get("adl"), dx, dy, k.get("opFrom"))] += 1
    print(f"  실제 리빌 발생 = {revealed}")
    for kk, v in c.most_common(10):
        cls, an, dur, eas, dl, dx, dy, opf = kk
        print(f"   x{v:<3} [{cls}] anim={an} 지속={dur} 이징={eas} 지연={dl} 이동(dx,dy)=({dx},{dy}) opacity시작={opf}")
