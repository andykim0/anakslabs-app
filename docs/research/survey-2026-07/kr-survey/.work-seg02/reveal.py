"""Third pass: scroll-reveal parameters only.
Records, per reveal-library element: move distance in px, duration in ms, easing family.
Only numeric values are extracted -- no rule text is retained."""
import sys, os, re, json
from playwright.sync_api import sync_playwright

PRE = r"""
() => {
  const vh = innerHeight;
  const sel = '.wow, [data-aos], [class*="animate__"], .animated, .elementor-invisible, [data-w-id], .reveal, [class*="fade-"], [class*="scroll-"], [class*="ani_"], [class*="aos-"]';
  const els = [...document.querySelectorAll(sel)];
  const out = [];
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.top < vh) return;                      // must start below the fold
    if (r.width < 30 || r.height < 20) return;
    const cs = getComputedStyle(el);
    el.setAttribute('data-rv', String(out.length));
    out.push({ id: out.length, vis: cs.visibility, op: parseFloat(cs.opacity),
      tr: cs.transform === 'none' ? null : cs.transform,
      an: cs.animationName, ad: cs.animationDuration, af: cs.animationTimingFunction,
      adl: cs.animationDelay,
      td: cs.transitionDuration, tf: cs.transitionTimingFunction, tp: cs.transitionProperty,
      cls: (el.className || '').toString().split(/\s+/).filter(c =>
        /wow|animate|aos|fade|slide|reveal|up|down|left|right|zoom|ani/i.test(c)).slice(0,4).join(' '),
      aos: el.getAttribute('data-aos'), aosD: el.getAttribute('data-aos-duration'),
      aosE: el.getAttribute('data-aos-easing'), aosDl: el.getAttribute('data-aos-delay') });
    if (out.length >= 80) return; });
  return out;
}
"""

POST = r"""
() => {
  // numeric translate extents of every keyframe animation the page actually uses
  const kf = {};
  for (const ss of document.styleSheets) {
    let rules; try { rules = ss.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const r of rules) {
      if (r.type !== 7) continue;               // CSSKeyframesRule
      let maxX = 0, maxY = 0, opFrom = null;
      for (const k of r.cssRules) {
        const t = k.style.transform || '';
        const m3 = t.match(/translate3d\(([^)]+)\)/) || t.match(/translate\(([^)]+)\)/);
        if (m3) { const p = m3[1].split(',').map(s => parseFloat(s) || 0);
          maxX = Math.max(maxX, Math.abs(p[0] || 0)); maxY = Math.max(maxY, Math.abs(p[1] || 0)); }
        const my = t.match(/translateY\(([-\d.]+)/); if (my) maxY = Math.max(maxY, Math.abs(parseFloat(my[1])));
        const mx = t.match(/translateX\(([-\d.]+)/); if (mx) maxX = Math.max(maxX, Math.abs(parseFloat(mx[1])));
        if ((k.keyText || '').indexOf('0%') === 0 || (k.keyText || '') === 'from')
          opFrom = k.style.opacity === '' ? null : parseFloat(k.style.opacity);
      }
      kf[r.name] = { x: maxX, y: maxY, opFrom };
    }
  }
  const els = [...document.querySelectorAll('[data-rv]')].map(el => {
    const cs = getComputedStyle(el);
    return { id: +el.getAttribute('data-rv'), vis: cs.visibility, op: parseFloat(cs.opacity),
      tr: cs.transform === 'none' ? null : cs.transform,
      an: cs.animationName, ad: cs.animationDuration, af: cs.animationTimingFunction, adl: cs.animationDelay };
  });
  return { kf, els };
}
"""

def slug(u):
    return re.sub(r"[^a-z0-9]+", "-", u.lower().replace("https://", "").replace("http://", "").replace("www.", "")).strip("-")

if __name__ == "__main__":
    outdir, urls = sys.argv[1], sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
        for u in urls:
            path = os.path.join(outdir, slug(u) + ".json")
            if os.path.exists(path):
                print(f"SKIP {u}", flush=True); continue
            rec = {"url": u}
            try:
                ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                p = ctx.new_page()
                p.goto(u, wait_until="domcontentloaded", timeout=50000)
                try: p.wait_for_load_state("networkidle", timeout=18000)
                except Exception: pass
                p.wait_for_timeout(2500)
                rec["pre"] = p.evaluate(PRE)
                # Sample DURING the reveal: computed animation-duration reverts to 0s once
                # the library strips its class, so it has to be read while the element is animating.
                SAMPLE = """() => [...document.querySelectorAll('[data-rv]')].filter(el => {
                    const cs = getComputedStyle(el);
                    return cs.visibility === 'visible' && parseFloat(cs.opacity) > 0.02; })
                  .map(el => { const cs = getComputedStyle(el);
                    return { id:+el.getAttribute('data-rv'), an:cs.animationName, ad:cs.animationDuration,
                      af:cs.animationTimingFunction, adl:cs.animationDelay,
                      td:cs.transitionDuration, tf:cs.transitionTimingFunction, tp:cs.transitionProperty,
                      op:parseFloat(cs.opacity), tr:cs.transform==='none'?null:cs.transform }; })"""
                live = {}
                h = p.evaluate("document.body.scrollHeight"); y = 0
                while y < h:
                    y += 300
                    p.evaluate(f"window.scrollTo(0,{y})")
                    for _ in range(4):
                        p.wait_for_timeout(60)
                        for s in p.evaluate(SAMPLE):
                            k = s["id"]
                            if k not in live or (live[k]["ad"] in ("0s", "") and s["ad"] not in ("0s", "")):
                                live[k] = s
                rec["live"] = list(live.values())
                p.wait_for_timeout(900)
                rec["post"] = p.evaluate(POST)
                ctx.close()
            except Exception as e:
                rec["error"] = f"{type(e).__name__}: {e}"
            with open(path, "w") as f: json.dump(rec, f, indent=1)
            n = len(rec.get("pre", []))
            print(f"OK {u} cands={n} err={rec.get('error','')}", flush=True)
        b.close()
    print("REVEAL-DONE", flush=True)
