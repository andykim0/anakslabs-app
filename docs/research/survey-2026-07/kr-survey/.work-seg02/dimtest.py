"""Compare dim-detection predicates on real pages.
For every large fixed/absolute layer, report the features each candidate rule uses."""
import sys, json, re
from playwright.sync_api import sync_playwright

PROBE = r"""
() => {
  const vw=innerWidth, vh=innerHeight, out=[];
  const lum=(c)=>c?(0.2126*c.r+0.7152*c.g+0.0722*c.b)/255:null;
  const rgba=(s)=>{const m=(s||'').match(/rgba?\(([^)]+)\)/); if(!m) return null;
    const p=m[1].split(',').map(parseFloat); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  for (const el of document.querySelectorAll('body *')) {
    const cs=getComputedStyle(el);
    if (cs.position!=='fixed' && cs.position!=='absolute') continue;
    if (cs.display==='none'||cs.visibility==='hidden') continue;
    const r=el.getBoundingClientRect();
    const cover=(r.width*r.height)/(vw*vh);
    if (cover < 0.55) continue;                       // ortho's threshold
    const bg=rgba(cs.backgroundColor);
    const media=el.querySelectorAll('a,button,img,video,iframe').length;
    const txt=(el.innerText||'').trim();
    out.push({
      tag: el.tagName.toLowerCase(),
      idcls: ((el.id||'')+' '+(el.className||'')).toString().trim().slice(0,42),
      pos: cs.position, cover:+cover.toFixed(2),
      bgAlpha: bg? +bg.a.toFixed(3) : 0,
      bgLum: bg && bg.a>0 ? +lum(bg).toFixed(3) : null,
      hasBgImage: /url\(/.test(cs.backgroundImage||''),
      media, textLen: txt.length,
      z: cs.zIndex, op: +parseFloat(cs.opacity).toFixed(2),
      w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top), vw, vh,
    });
    if (out.length>25) break; }
  return out;
}
"""
if __name__=="__main__":
    with sync_playwright() as pw:
        b=pw.chromium.launch(headless=True,args=["--hide-scrollbars"])
        for u in sys.argv[1:]:
            print("="*100); print(u)
            try:
                p=b.new_context(viewport={"width":1440,"height":900},
                  user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36").new_page()
                p.goto(u,wait_until="domcontentloaded",timeout=50000)
                try: p.wait_for_load_state("networkidle",timeout=15000)
                except Exception: pass
                p.wait_for_timeout(3000)
                for e in p.evaluate(PROBE):
                    ortho = e['cover']>=0.55
                    orthoFix = e['bgAlpha']>0.15 and (e['bgLum'] is not None and e['bgLum']<0.35)
                    # exact predicate from measure_kr.py DISMISS_JS rule 2
                    mine = (e['pos']=='fixed' and e['w']>=e['vw']*0.9 and e['h']>=e['vh']*0.9
                            and e['top']<=5 and e['textLen']<=4 and e['media']==0)
                    # proposed: BOTH dark-opaque AND structurally empty
                    both = (e['bgAlpha']>0.15 and e['bgLum'] is not None and e['bgLum']<0.35
                            and e['media']==0 and e['textLen']<=4)
                    print(f"  cover={e['cover']:.2f} a={e['bgAlpha']:<5} lum={str(e['bgLum']):<6} bgimg={int(e['hasBgImage'])} media={e['media']:<3} txt={e['textLen']:<5} z={e['z']:<7} "
                          f"| 면적:{'X' if ortho else 'O'} ortho:{'X' if orthoFix else 'O'} 내규칙:{'X' if mine else 'O'} AND:{'X' if both else 'O'} | {e['pos']} {e['idcls']}")
            except Exception as ex:
                print("  ERR", type(ex).__name__, str(ex)[:90])
        b.close()
