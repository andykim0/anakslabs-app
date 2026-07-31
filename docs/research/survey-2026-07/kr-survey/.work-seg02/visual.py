"""Second pass: full-page innerText dump + downscaled full-page capture for eyeball verification.
Captures are written to the job tmp dir and are deleted by the caller after inspection."""
import sys, os, re, json
from PIL import Image
import io
from playwright.sync_api import sync_playwright

DISMISS = r"""
() => {
  // Suppress entry popups WITHOUT clicking: a click can navigate or open panels and
  // change the very page we are measuring. Hiding the layer is enough for luminance work.
  const vw = innerWidth, vh = innerHeight, hidden = [];
  const popRe = /pop(up|s|_|-|\b)|modal|layer[-_]?pop|dimm?|overlay|banner[-_]?pop|팝업/i;
  const closeRe = /오늘\s*하루|하루\s*동안|그만\s*보기|다시\s*보지|보지\s*않기|일주일\s*동안/;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 100) continue;
    const idcls = ((el.id || '') + ' ' + (el.className || '')).toString();
    const t = (el.innerText || '').replace(/\s+/g, ' ');
    const bigLayer = r.width >= vw * 0.6 && r.height >= vh * 0.5 && cs.position === 'fixed';
    const named = popRe.test(idcls);
    const dismissable = closeRe.test(t.slice(0, 400));
    if (!((named && (dismissable || bigLayer)) || (bigLayer && dismissable))) continue;
    if (el.querySelector('nav, header') && !dismissable) continue;   // never hide the site chrome
    if (parseInt(cs.zIndex || '0', 10) < 1 && !dismissable) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden.push((idcls.slice(0, 28) + ' | ' + t.slice(0, 28)).trim());
    if (hidden.length > 10) break; }

  // Second rule: an anonymous full-viewport fixed layer with no links and no text is a
  // popup DIM backdrop. Left in place it darkens every screenshot and destroys the tone reading.
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.9 || r.top > 5) continue;
    if ((el.innerText || '').trim().length > 4) continue;
    if (el.querySelectorAll('a,button,img,video,iframe').length > 0) continue;
    el.style.setProperty('display', 'none', 'important');
    hidden.push('DIM:' + (((el.id || '') + ' ' + (el.className || '')).toString().slice(0, 24) || '(anon)'));
    if (hidden.length > 14) break; }
  return hidden;
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
            s = slug(u)
            if os.path.exists(os.path.join(outdir, s + ".png")):
                print(f"SKIP {u}", flush=True); continue
            try:
                ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                p = ctx.new_page()
                p.goto(u, wait_until="domcontentloaded", timeout=50000)
                try: p.wait_for_load_state("networkidle", timeout=18000)
                except Exception: pass
                p.wait_for_timeout(2500)
                p.evaluate(DISMISS); p.wait_for_timeout(600)
                h = p.evaluate("document.body.scrollHeight")
                y = 0
                while y < h:
                    y += 700; p.evaluate(f"window.scrollTo(0,{y})"); p.wait_for_timeout(220)
                p.evaluate("window.scrollTo(0,0)"); p.wait_for_timeout(1200)
                txt = p.evaluate("document.body.innerText")
                with open(os.path.join(outdir, s + ".txt"), "w") as f: f.write(txt)
                # Stitch viewport shots rather than one full_page shot: reveal libraries
                # re-hide content in a full_page capture, leaving whole sections blank.
                VH = 900
                shots = []
                yy = 0
                while yy < h and len(shots) < 30:
                    p.evaluate(f"window.scrollTo(0,{yy})"); p.wait_for_timeout(420)
                    shots.append(Image.open(io.BytesIO(p.screenshot(type="png"))).convert("RGB"))
                    yy += VH
                im = Image.new("RGB", (shots[0].width, sum(x.height for x in shots)), (255,255,255))
                oy = 0
                for x in shots: im.paste(x, (0, oy)); oy += x.height
                # downscale to a narrow strip: readable layout/tone, unusable as an asset copy
                W = 420
                im = im.resize((W, max(1, int(im.height * W / im.width))), Image.LANCZOS)
                # split into at most 3 vertical tiles so nothing is squashed beyond recognition
                H = im.height
                cap = 3200
                n = min(3, max(1, (H + cap - 1) // cap))
                per = (H + n - 1) // n
                tiles = []
                for i in range(n):
                    tiles.append(im.crop((0, i * per, W, min(H, (i + 1) * per))))
                sheet = Image.new("RGB", (W * n + 10 * (n - 1), per), (255, 255, 255))
                for i, t in enumerate(tiles):
                    sheet.paste(t, (i * (W + 10), 0))
                if sheet.height > 2400:
                    sheet = sheet.resize((int(sheet.width * 2400 / sheet.height), 2400), Image.LANCZOS)
                sheet.save(os.path.join(outdir, s + ".png"))
                print(f"OK {u} textlen={len(txt)} pageH={h}", flush=True)
                ctx.close()
            except Exception as e:
                print(f"ERR {u} {type(e).__name__}: {e}", flush=True)
        b.close()
    print("VISUAL-DONE", flush=True)
