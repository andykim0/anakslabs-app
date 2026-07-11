#!/usr/bin/env node
/**
 * [A] AI 어댑터 실키 검증 런너.
 * ANTHROPIC_API_KEY / GEMINI_API_KEY 가 env 에 있으면 실제 AiService(supabase) 경로를 호출.
 * 둘 다 없으면 하네스만 준비된 상태로 skip(exit 3). 키는 env 에서만 — 하드코딩 없음.
 *
 * 실행:
 *   ANTHROPIC_API_KEY=... GEMINI_API_KEY=... node scripts/smoke-ai.mjs
 *   (generateImage 는 로컬 supabase 스택 기동 시 스토리지 업로드까지 검증)
 * exit: 0 통과 / 1 하드 실패 / 2 도구 오류 / 3 키 없음(skip)
 */
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');

const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;
if (!hasAnthropic && !hasGemini) {
  console.log('⏭  AI 키 없음 — 하네스 준비 완료(미실행).');
  console.log('   실행법: ANTHROPIC_API_KEY=... GEMINI_API_KEY=... node scripts/smoke-ai.mjs');
  console.log('   (generateImage 는 `npx supabase start` 후 실행하면 스토리지 업로드까지 검증)');
  process.exit(3);
}
console.log(`▶ 키: Anthropic=${hasAnthropic ? '있음' : '없음'} · Gemini=${hasGemini ? '있음' : '없음'}`);

// supabase 크레덴셜 — env 우선, 없으면 로컬 스택 status (이미지 스토리지·팩토리 구성용)
let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
let supaSvc = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supaUrl) {
  try {
    const out = execSync('npx --yes supabase status -o env', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const get = (k) => (out.match(new RegExp('^' + k + '="(.*)"$', 'm')) || [])[1] || '';
    supaUrl = get('API_URL'); supaAnon = get('ANON_KEY'); supaSvc = get('SERVICE_ROLE_KEY');
    if (supaUrl) console.log(`  supabase: 로컬 스택 (${supaUrl})`);
  } catch { /* 없음 */ }
}
const supaReady = !!(supaUrl && supaSvc);
if (hasGemini && !supaReady) console.log('  ⚠ Supabase 미구성 — generateImage 서브테스트는 skip(스토리지 필요)');

const shim = path.join(WEB, '.smoke-ai-empty.js');
const bundle = path.join(ROOT, '.smoke-ai-bundle.cjs');
const cleanup = () => { for (const f of [shim, bundle]) { try { if (existsSync(f)) unlinkSync(f); } catch { /* noop */ } } };

try {
  writeFileSync(shim, 'module.exports = {};\n');
  execSync(
    `npx esbuild scripts/smoke-ai.harness.ts --bundle --platform=node --format=cjs --tsconfig=tsconfig.json ` +
    `--alias:server-only=${shim} --alias:next/headers=${shim} --outfile=${bundle}`,
    { cwd: WEB, stdio: ['ignore', 'ignore', 'inherit'] },
  );
} catch {
  console.error('esbuild 번들 실패'); cleanup(); process.exit(2);
}

console.log('');
const run = spawnSync('node', [bundle], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_MOCK_MODE: '0',
    NEXT_PUBLIC_SUPABASE_URL: supaUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supaAnon,
    SUPABASE_SERVICE_ROLE_KEY: supaSvc,
    SMOKE_SUPA_READY: supaReady ? '1' : '0',
  },
});
cleanup();
process.exit(run.status ?? 1);
