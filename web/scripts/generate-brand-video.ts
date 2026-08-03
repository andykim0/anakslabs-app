/**
 * [일회성 도구] Anaks Labs 히어로 브랜드 영상 — 선택한 신규 후보를 시작 프레임으로
 * Veo fast image-to-video 2안 생성.
 * 어댑터 경유(generateVeoVideoBytes — 업로드 없이 바이트만) → 메인 체크아웃 scripts/out/에 로컬 저장
 * (SaaS 스토리지 미오염). 하드 에러(billing/모델없음)면 남은 시안 중단(과금 방지).
 *
 * 실행: node --env-file=<메인 web/.env.local> <bundle.mjs>   (esbuild 번들, server-only는 tsconfig 스텁)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateVeoVideoBytes } from '@/lib/ai/veo-video';
import { FAST_MODEL } from '@/lib/ai/video-pipeline-core';

const OUT = process.env.BRAND_HERO_OUT || '/Users/axxykim/Desktop/anakslabs/web/scripts/out';
// 후보 검수 결과: 2번이 상승 곡선과 16:11 랜딩 크롭이 가장 안정적이다.
const START_FRAME = process.env.ANAKS_START_FRAME || join(OUT, 'anakslabs-hero-candidate-2.png');

const MOTION = `One continuous eight-second premium 3D product shot. Keep the transparent
browser portal geometrically stable. Begin with the three luminous ribbons visibly
separate: royal blue, cyan, and mint. They flow forward through the glass portal
while one thin scanning plane sweeps across exactly once. The three polished glass
orbs pulse in sequence, then the ribbons merge smoothly into one clean rising arc
toward the upper right. Use only a very slow, restrained four-percent camera dolly
with subtle parallax and physically plausible refraction. A traveling light pulse
returns the energy state and camera framing near the opening frame for a seamless
loop. Elegant, airy, precise, optimistic.

No cuts, no camera shake, no speed ramps, no new objects, no particles, no scene
change. Do not morph or bend the browser frame. No chips, circuit boards, circuit
traces, constellations, or node networks. No darkening, purple, magenta, warm hues,
letters, numbers, typography, logos, watermarks, or UI copy. Keep the cool-white,
royal-blue, cyan, and mint palette constant throughout.`;

const COUNT = 2;
const RESOLUTION = '1080p' as const; // 기존 assets(720p) 미교체 — 별도 파일로만 저장
const UNIT_USD = 0.96; // Veo fast 8초 1080p 추정 원가
const USD_KRW = 1380;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const base64 = readFileSync(START_FRAME).toString('base64');
  console.log(`[brand-video] 시작프레임=${START_FRAME} (${(base64.length / 1024).toFixed(0)}KB b64), model=${FAST_MODEL}, ${RESOLUTION}, ${COUNT}안`);

  let ok = 0;
  const t0all = Date.now();
  for (let i = 1; i <= COUNT; i++) {
    const t0 = Date.now();
    try {
      const { bytes, mimeType } = await generateVeoVideoBytes({
        prompt: MOTION,
        image: { base64, mimeType: 'image/png' },
        model: FAST_MODEL,
        resolution: RESOLUTION,
      });
      const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
      const file = join(OUT, `anakslabs-brand-video-1080-${i}.${ext}`);
      writeFileSync(file, bytes);
      ok += 1;
      console.log(
        `[${i}/${COUNT}] OK  ${mimeType}  ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB  ` +
          `${((Date.now() - t0) / 1000).toFixed(0)}s  est $${UNIT_USD.toFixed(2)} (≈₩${Math.round(UNIT_USD * USD_KRW)})  → ${file}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${i}/${COUNT}] FAIL  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${msg.slice(0, 300)}`);
      // 하드 에러(billing/미설정/모델없음)면 남은 시안 중단 — 불필요한 과금·시간 방지
      if (/VEO_BILLING_REQUIRED|VEO_NOT_CONFIGURED|NOT_FOUND|404|not found|is not supported/i.test(msg)) {
        console.error('[brand-video] 하드 에러 → 남은 시안 중단.');
        break;
      }
    }
  }
  console.log(
    `[brand-video] 완료: ${ok}/${COUNT}, ${((Date.now() - t0all) / 1000).toFixed(0)}s, ` +
      `추정 과금 $${(UNIT_USD * ok).toFixed(2)} (≈₩${Math.round(UNIT_USD * ok * USD_KRW)})`,
  );
}

main().catch((e) => {
  console.error('[brand-video] 치명 오류:', e instanceof Error ? e.message : e);
  process.exit(1);
});
