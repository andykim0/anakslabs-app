/**
 * [일회성 도구] Anaks Labs(Anaks Labs) 마케팅 히어로 전용 3D 비주얼 후보 생성.
 * SaaS 저장소 자산 아님 → web/public이 아니라 scripts/out/에 임시 저장(.gitignore됨).
 *
 * 조건:
 *  1. 반드시 lib/ai/gemini-image.ts 어댑터 경유(직접 fetch 금지) — 프로덕션과 동일 코드 경로(어댑터 스모크 겸).
 *  2. 같은 프롬프트로 후보 4장 → scripts/out/hero-candidate-{1..4}.png. 각 호출의 과금 정보 콘솔 기록.
 *  4. GEMINI_API_KEY 미설정이면 실행 금지(어댑터가 GEMINI_NOT_CONFIGURED throw).
 *
 * 실행: node --conditions=react-server --env-file=<web/.env.local> --import tsx web/scripts/generate-brand-hero.ts
 *   (--conditions=react-server 로 gemini-image.ts의 'server-only' import를 empty로 해소)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateGeminiImage } from '@/lib/ai/gemini-image';

// Anaks Labs의 고유 메타포: 세 발견 신호(SEO/AEO/GEO)가 브라우저 포털에서 하나의
// 상승 신호로 합쳐진다. 기존 Anaks Labs의 칩·회로망 비주얼과 명시적으로 분리한다.
// 색 이름만 사용한다(hex는 생성물 표면에 글자로 새겨지는 경향이 있어 금지).
const PROMPT = `A pristine high-end 3D product-film keyframe for a website visibility AI,
on a bright cool-white and ice-white studio background. One sculptural transparent
browser-window frame stands in three-quarter perspective like a glass portal, with
softly rounded corners and a clean white ceramic base. Three separate luminous
ribbons enter from the lower left: royal blue, clear cyan, and signal mint. They
pass through one thin translucent scanning plane inside the browser portal, then
merge into a single elegant rising arc that exits toward the upper right. Three
small polished glass orbs sit along the path, one in each signal color. Premium
physical materials, restrained refraction, soft ambient occlusion, subtle studio
shadow, crisp edges, airy depth, Apple-like product visualization. Center-right
composition with comfortable crop safety on every edge. The browser portal and
the three-to-one rising signal are the only subjects.

This must be a completely different visual language from a circuit-board scene:
no computer chips, no circuit traces, no constellations, no node networks, no dark
background. Strict palette: cool white, deep navy only for tiny structural accents,
royal blue, cyan, and mint. No purple, no magenta, no warm tint, no gold. No people,
no website screenshots, no logo, no watermark. Absolutely no letters, numbers,
typography, symbols, labels, UI copy, or engraved characters on any surface.`;

const ASPECT = '16:9' as const;
const COUNT = 3;
const UNIT_USD = 0.039; // Nano Banana 단가 (gemini-image.ts 주석)
const USD_KRW = 1380; // 대략 환산

async function main() {
  // 산출물은 항상 메인 체크아웃의 scripts/out/ (사용자가 확인 가능). BRAND_HERO_OUT로 오버라이드 가능.
  const outDir = process.env.BRAND_HERO_OUT || '/Users/axxykim/Desktop/anakslabs/web/scripts/out';
  mkdirSync(outDir, { recursive: true });
  console.log(`[brand-hero] 후보 ${COUNT}장 생성 시작 → ${outDir}`);

  let ok = 0;
  let totalBytes = 0;
  const t0all = Date.now();
  for (let i = 1; i <= COUNT; i++) {
    const t0 = Date.now();
    try {
      const img = await generateGeminiImage({ prompt: PROMPT, aspectRatio: ASPECT });
      const bytes = Buffer.from(img.base64, 'base64');
      // Anaks Labs 산출물을 보존하고 Anaks Labs 후보는 별도 네임스페이스에 저장한다.
      const file = join(outDir, `anakslabs-hero-candidate-${i}.png`);
      writeFileSync(file, bytes);
      ok += 1;
      totalBytes += bytes.byteLength;
      console.log(
        `[${i}/${COUNT}] OK  ${img.mimeType}  ${(bytes.byteLength / 1024).toFixed(0)}KB  ${Date.now() - t0}ms  ` +
          `est $${UNIT_USD.toFixed(3)} (≈₩${Math.round(UNIT_USD * USD_KRW)})  → ${file}`,
      );
    } catch (err) {
      console.error(`[${i}/${COUNT}] FAIL  ${Date.now() - t0}ms  ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const estUsd = UNIT_USD * ok;
  console.log(
    `[brand-hero] 완료: ${ok}/${COUNT} 성공, ${((Date.now() - t0all) / 1000).toFixed(1)}s, ` +
      `총 ${(totalBytes / 1024 / 1024).toFixed(2)}MB, 추정 과금 $${estUsd.toFixed(3)} (≈₩${Math.round(estUsd * USD_KRW)})`,
  );
  console.log(
    '[note] 순수 어댑터는 바이트만 반환 → per-call 토큰 usageMetadata는 미노출. 과금은 gemini-image.ts 단가($0.039/장) 기준 추정치.',
  );
}

main().catch((e) => {
  console.error('[brand-hero] 치명 오류:', e instanceof Error ? e.message : e);
  process.exit(1);
});
