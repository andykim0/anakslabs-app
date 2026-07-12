/**
 * [v4 #4] 이미지 스타일 실물 샘플 3종 생성 — 설문 S5(이미지 스타일) 카드용.
 *
 * 같은 피사체(따뜻한 조명의 아늑한 카페 내부, 원목 테이블과 커피) × 3스타일(photo/3d_render/
 * illustration), 4:3. 기존 파이프라인(generateGeminiImage + buildImagePrompt — hex 금지·no-stock
 * 자동 준수)을 재사용하고 스타일별 heroImageFragment를 Scene에 주입한다.
 * 결과는 web/public/onboarding/style-samples/{photo,3d-render,illustration}.webp (sharp로 webp·리사이즈, ≤150KB).
 *
 * 실행(GEMINI_API_KEY 필수 — 회당 $0.039 실과금, MOCK 우회):
 *   node --conditions=react-server --env-file=web/.env.local --import tsx web/scripts/generate-style-samples.ts
 * (server-only import는 --conditions=react-server가 빈 모듈로 해소. 대안: scripts/tsconfig 스텁 경로.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { CandidateStyle } from '@/lib/types/domain';
import { generateGeminiImage } from '@/lib/ai/gemini-image';
import { buildImagePrompt, povForStyle } from '@/lib/design/quality-standards';
import { STYLE_DIRECTIONS } from '@/lib/ai/design-knowledge-data';

const SUBJECT = 'a warm cozy cafe interior, wooden tables and a cup of coffee, soft natural daylight';

/** 스타일별 대표 STYLE_DIRECTION(heroImageFragment·POV 원천) */
const REP_STYLE: Record<CandidateStyle, string> = {
  photo: 'warm-cozy',
  '3d_render': 'soft-clay-3d',
  illustration: 'flat-friendly-illust',
};
const FILE_NAME: Record<CandidateStyle, string> = {
  photo: 'photo',
  '3d_render': '3d-render',
  illustration: 'illustration',
};

const OUT_DIR = join(process.cwd(), 'public', 'onboarding', 'style-samples');

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let cost = 0;
  for (const style of ['photo', '3d_render', 'illustration'] as CandidateStyle[]) {
    const dir = STYLE_DIRECTIONS.find((s) => s.id === REP_STYLE[style]);
    if (!dir) throw new Error(`REP_STYLE 매핑 오류: ${REP_STYLE[style]}`);
    const povId = povForStyle(dir.id);
    const base = buildImagePrompt(povId, '카페', 'hero section', {
      candidateStyle: style,
      palettePrimary: '#c98a5e',
      background: '#f7ede2',
    });
    const prompt = `Scene: ${SUBJECT}. ${dir.heroImageFragment}.\n${base}`;

    console.log(`[${style}] 생성 중… (${dir.id})`);
    const t0 = Date.now();
    const img = await generateGeminiImage({ prompt, aspectRatio: '4:3' });
    cost += 0.039;
    const webp = await sharp(Buffer.from(img.base64, 'base64'))
      .resize(800, 600, { fit: 'cover' })
      .webp({ quality: 78 })
      .toBuffer();
    const path = join(OUT_DIR, `${FILE_NAME[style]}.webp`);
    writeFileSync(path, webp);
    console.log(`  저장 ${path} — ${(webp.length / 1024).toFixed(1)}KB, ${Date.now() - t0}ms`);
    if (webp.length > 150 * 1024) console.warn(`  ⚠ 150KB 초과 — quality를 낮추세요`);
  }
  console.log(`완료. 추정 과금 $${cost.toFixed(3)} (${3}장)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
