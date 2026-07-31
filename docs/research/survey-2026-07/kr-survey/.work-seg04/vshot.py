"""Viewport-by-viewport capture for scroll-driven sites where full_page rendering breaks
(GSAP ScrollTrigger pinning, IntersectionObserver reveals). Tiles N viewport shots into strips."""
import sys, os, re, io
from PIL import Image
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from final import CLOSE_TEXTS, dismiss, slug

def cap(url, pw, outdir, step=800, maxshots=16, tile=4):
    br = pw.chromium.launch(headless=True, args=["--hide-scrollbars"])
    try:
        ctx = br.new_context(viewport={"width":1440,"height":900}, device_scale_factor=1,
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        pg = ctx.new_page(); pg.goto(url, wait_until="domcontentloaded", timeout=50000)
        try: pg.wait_for_load_state("networkidle", timeout=18000)
        except Exception: pass
        pg.wait_for_timeout(2800)
        dismiss(pg); pg.wait_for_timeout(500)
        H = pg.evaluate("document.body.scrollHeight")
        shots = []
        y = 0
        while y < H and len(shots) < maxshots:
            pg.evaluate(f"window.scrollTo(0,{y})")
            pg.wait_for_timeout(750)
            shots.append(Image.open(io.BytesIO(pg.screenshot(type="png"))).convert("RGB"))
            y += step
        tw = 400
        small = [s.resize((tw, int(s.size[1]*tw/s.size[0])), Image.LANCZOS) for s in shots]
        paths = []
        for gi in range(0, len(small), tile):
            grp = small[gi:gi+tile]
            h = sum(s.size[1] for s in grp)
            canvas = Image.new("RGB", (tw, h), (255,255,255))
            oy = 0
            for s in grp:
                canvas.paste(s, (0, oy)); oy += s.size[1]
            p = os.path.join(outdir, f"{slug(url)}-v{gi//tile}.jpg")
            canvas.save(p, "JPEG", quality=64); paths.append(p)
        print(url, "H", H, "shots", len(shots), "strips", paths, flush=True)
    finally:
        br.close()

if __name__ == "__main__":
    outdir = sys.argv[1]; os.makedirs(outdir, exist_ok=True)
    step = 800
    urls = []
    for a in sys.argv[2:]:
        if a.startswith("--step="): step = int(a.split("=")[1])
        else: urls.append(a)
    with sync_playwright() as pw:
        for u in urls:
            try: cap(u, pw, outdir, step=step)
            except Exception as e: print("ERR", u, type(e).__name__, e, flush=True)
    print("VSHOT-DONE", flush=True)
