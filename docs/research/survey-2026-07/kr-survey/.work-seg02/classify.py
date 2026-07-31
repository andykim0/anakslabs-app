"""Fourth pass: evidence for 진료 유형 / 규모 classification.
Pulls nav labels, branch signals, and doctor-count signals. Numbers and labels only."""
import sys, os, re, json
from playwright.sync_api import sync_playwright

DISMISS = r"""
() => { const vw=innerWidth, vh=innerHeight, hid=[];
  const popRe=/pop(up|s|_|-|\b)|modal|layer[-_]?pop|dimm?|overlay|banner[-_]?pop|팝업/i;
  const closeRe=/오늘\s*하루|하루\s*동안|그만\s*보기|다시\s*보지|보지\s*않기|일주일\s*동안/;
  for (const el of document.querySelectorAll('body *')) {
    const cs=getComputedStyle(el);
    if (cs.position!=='fixed'&&cs.position!=='absolute') continue;
    if (cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.05) continue;
    const r=el.getBoundingClientRect(); if (r.width<120||r.height<100) continue;
    const idcls=((el.id||'')+' '+(el.className||'')).toString();
    const t=(el.innerText||'').replace(/\s+/g,' ');
    const big=r.width>=vw*0.6&&r.height>=vh*0.5&&cs.position==='fixed';
    const named=popRe.test(idcls), dis=closeRe.test(t.slice(0,400));
    if (!((named&&(dis||big))||(big&&dis))) continue;
    if (el.querySelector('nav, header')&&!dis) continue;
    if (parseInt(cs.zIndex||'0',10)<1&&!dis) continue;
    el.style.setProperty('display','none','important'); hid.push(idcls.slice(0,30)); }
  return hid; }
"""

EVIDENCE = r"""
() => {
  const txt = (el) => (el.innerText || '').replace(/\s+/g, ' ').trim();
  const out = {};
  const page = (document.body.innerText || '').replace(/\s+/g, ' ');
  out.textLen = page.length;

  // --- nav / GNB labels: the department menu is the strongest 진료유형 signal
  const navSel = 'nav a, header a, [class*=gnb] a, [class*=menu] a, [id*=gnb] a, [id*=menu] a, [class*=nav] a';
  const labels = [];
  document.querySelectorAll(navSel).forEach(a => {
    const t = txt(a); if (t && t.length <= 22 && !labels.includes(t)) labels.push(t); });
  out.nav = labels.slice(0, 70);

  // --- department keywords anywhere in the home text
  const DEPT = {
    '성형외과':/성형외과/, '피부과':/피부과/, '치과':/치과/, '안과':/안과/,
    '정형외과':/정형외과/, '신경외과':/신경외과/, '외과':/(?<![성형整])외과(?!의원)/,
    '내과':/내과/, '산부인과':/산부인과/, '한의원':/한의원|한방|한약/,
    '이비인후과':/이비인후과/, '비뇨':/비뇨/, '소아':/소아청소년|소아과/,
    '재활':/재활의학|재활치료/, '마취통증':/마취통증|통증의학/, '영상의학':/영상의학/,
    '가정의학':/가정의학/, '정신건강':/정신건강의학/, '검진':/건강검진|종합검진/,
    '전문병원':/전문병원/, '종합병원':/종합병원/, '병원':/병원/, '의원':/의원/, '클리닉':/클리닉/,
  };
  out.dept = {};
  for (const [k, re] of Object.entries(DEPT)) { const m = page.match(new RegExp(re, 'g')); if (m) out.dept[k] = m.length; }

  // --- 규모 signals
  out.scale = {};
  const branchPhrase = page.match(/전국\s*\d+\s*(개|곳)?\s*(지점|분원|점|네트워크)?|\d+\s*(개|곳)\s*(지점|분원)|네트워크\s*(한의원|병원|의원|치과)?/g);
  out.scale.branchPhrase = branchPhrase ? [...new Set(branchPhrase)].slice(0, 8) : [];
  const branchNames = page.match(/[가-힣]{2,6}(점|분원)(?=[\s,·/]|$)/g);
  out.scale.branchNames = branchNames ? [...new Set(branchNames)].slice(0, 30) : [];
  out.scale.branchNameCount = branchNames ? new Set(branchNames).size : 0;
  // 대표원장 / 원장 mentions
  const wonjang = page.match(/(대표\s*원장|원장)\s*[:：]?\s*[가-힣]{2,4}/g);
  out.scale.wonjang = wonjang ? [...new Set(wonjang)].slice(0, 20) : [];
  out.scale.wonjangCount = wonjang ? new Set(wonjang).size : 0;
  out.scale.doctorWord = (page.match(/의료진|전문의|원장/g) || []).length;
  // 사업자등록번호 / 대표자 in footer = single legal entity
  const daepyo = page.match(/대표자?\s*[:.：]?\s*[가-힣]{2,4}/g);
  out.scale.daepyo = daepyo ? [...new Set(daepyo)].slice(0, 6) : [];
  out.scale.bizNo = (page.match(/사업자\s*(등록)?\s*번호\s*[:.：]?\s*[\d-]{8,}/g) || []).length;
  // address occurrences (multiple full addresses -> multiple sites)
  const addr = page.match(/(서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣]*\s*[가-힣]+(시|군|구)\s/g);
  out.scale.addrHits = addr ? [...new Set(addr)].slice(0, 12) : [];
  // phone numbers: several distinct numbers often means several branches
  const phones = page.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g);
  out.scale.phones = phones ? [...new Set(phones)].slice(0, 12) : [];
  out.scale.phoneCount = phones ? new Set(phones).size : 0;

  // --- link targets that name a doctor-intro page
  const docLinks = [];
  document.querySelectorAll('a').forEach(a => {
    const t = txt(a), h = a.getAttribute('href') || '';
    if (/의료진|원장|전문의|doctor|staff/i.test(t + ' ' + h) && t && t.length < 24 && !docLinks.includes(t)) docLinks.push(t); });
  out.doctorLinks = docLinks.slice(0, 12);
  out.title = document.title;
  return out;
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
                ctx = b.new_context(viewport={"width": 1440, "height": 900},
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
                p = ctx.new_page()
                p.goto(u, wait_until="domcontentloaded", timeout=50000)
                try: p.wait_for_load_state("networkidle", timeout=18000)
                except Exception: pass
                p.wait_for_timeout(2500)
                p.evaluate(DISMISS); p.wait_for_timeout(500)
                h = p.evaluate("document.body.scrollHeight"); y = 0
                while y < h:
                    y += 700; p.evaluate(f"window.scrollTo(0,{y})"); p.wait_for_timeout(200)
                p.wait_for_timeout(800)
                rec["ev"] = p.evaluate(EVIDENCE)
                ctx.close()
            except Exception as e:
                rec["error"] = f"{type(e).__name__}: {e}"
            with open(path, "w") as f: json.dump(rec, f, ensure_ascii=False, indent=1)
            print(f"OK {u} {rec.get('error','')}", flush=True)
        b.close()
    print("CLASSIFY-DONE", flush=True)
