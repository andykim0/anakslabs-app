"""Full-page capture -> downscaled vertical strips for visual structure coding.
Temp artifacts only; deleted after coding. No asset extraction."""
import sys, os, re, io
from PIL import Image
from playwright.sync_api import sync_playwright

def slug(u): return re.sub(r"[^a-z0-9]+","-",u.lower().replace("https://","").replace("www.","")).strip("-")

def cap(url, pw, outdir, mobile=False):
    br = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    try:
        vp = {"width":390,"height":844} if mobile else {"width":1440,"height":900}
        ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
              if mobile else
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        ctx = br.new_context(viewport=vp, device_scale_factor=1, user_agent=ua,
                             is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page()
        pg.goto(url, wait_until="domcontentloaded", timeout=50000)
        try: pg.wait_for_load_state("networkidle", timeout=18000)
        except Exception: pass
        pg.wait_for_timeout(2500)
        H = pg.evaluate("document.body.scrollHeight")
        y = 0
        while y < H:
            y += 700; pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(180)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1200)
        png = pg.screenshot(type="png", full_page=True)
        im = Image.open(io.BytesIO(png)).convert("RGB")
        w, h = im.size
        tw = 430
        im = im.resize((tw, int(h*tw/w)), Image.LANCZOS)
        w, h = im.size
        n = max(1, min(6, (h + 2200) // 2400))
        step = h // n
        tag = "m" if mobile else "d"
        paths = []
        for i in range(n):
            y0 = i*step; y1 = h if i == n-1 else (i+1)*step
            p = os.path.join(outdir, f"{slug(url)}-{tag}{i}.jpg")
            im.crop((0,y0,w,y1)).save(p, "JPEG", quality=62)
            paths.append(p)
        print(f"{url} fullH={h*int(1440/tw) if not mobile else h} strips={paths}", flush=True)
    finally:
        br.close()

if __name__ == "__main__":
    outdir = sys.argv[1]; os.makedirs(outdir, exist_ok=True)
    args = sys.argv[2:]
    mobile = "--mobile" in args
    urls = [a for a in args if not a.startswith("--")]
    with sync_playwright() as pw:
        for u in urls:
            try: cap(u, pw, outdir, mobile)
            except Exception as e: print("ERR", u, type(e).__name__, e, flush=True)
    print("STRIP-DONE", flush=True)
