#!/usr/bin/env node
/**
 * [Veo] 영상 생성 e2e 스모크. 비용 안전 게이트 — 기본은 skip, SMOKE_VEO_RUN=1 일 때만 유료 1회.
 *   GEMINI_API_KEY 없음        → exit 3 skip ("GEMINI_API_KEY + billing 필요")
 *   키 있으나 SMOKE_VEO_RUN≠1   → exit 3 skip (비용 안내 — 8초 클립 ≈ 1,700~4,500원, 1회만)
 *   SMOKE_VEO_RUN=1 + supabase → e2e 1회(start→폴링→Storage URL). supabase 미기동이면 유료 호출 전 중단.
 * 키/URL 은 env·`npx supabase status -o env` 로만 — 하드코딩 없음. 절대 다회 호출 금지.
 * exit: 0 성공 / 1 실패 / 2 도구·전제 오류 / 3 skip(키 없음/비용 미승인/billing)
 */
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'web');

if (!process.env.GEMINI_API_KEY) {
  console.log('⏭  GEMINI_API_KEY 없음 — Veo 하네스 준비 완료(미실행). GEMINI_API_KEY(+billing 활성) 필요.');
  process.exit(3);
}
if (process.env.SMOKE_VEO_RUN !== '1') {
  console.log('⏭  비용 발생 보호 — 실제 생성 미실행.');
  console.log('   Veo 8초 클립 1회 ≈ 1,700~4,500원. 승인 시:');
  console.log('   SMOKE_VEO_RUN=1 GEMINI_API_KEY=... node scripts/smoke-veo.mjs   (로컬 supabase 스택 필요)');
  process.exit(3);
}

// supabase 크레덴셜(스토리지 업로드) — 유료 호출 전에 확보. 없으면 중단(돈 낭비 방지).
let supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let supaAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
let supaSvc = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!supaUrl) {
  try {
    const out = execSync('npx --yes supabase status -o env', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const get = (k) => (out.match(new RegExp('^' + k + '="(.*)"$', 'm')) || [])[1] || '';
    supaUrl = get('API_URL'); supaAnon = get('ANON_KEY'); supaSvc = get('SERVICE_ROLE_KEY');
  } catch { /* 없음 */ }
}
if (!supaUrl || !supaSvc) {
  console.log('✗ 로컬 supabase 스택이 필요합니다(생성 영상 Storage 업로드). `npx supabase start` 후 재실행.');
  process.exit(2);
}
console.log(`▶ Veo e2e 1회 실행 (모델=${process.env.VEO_MODEL || 'veo-3.1-generate-preview'}) · supabase=${supaUrl}`);
console.log('  ⚠ 유료 호출 — 8초 클립 1회 비용 발생. 폴링 최대 ~5분.');

const shim = path.join(WEB, '.smoke-veo-empty.js');
const bundle = path.join(ROOT, '.smoke-veo-bundle.cjs');
const cleanup = () => { for (const f of [shim, bundle]) { try { if (existsSync(f)) unlinkSync(f); } catch { /* noop */ } } };
try {
  writeFileSync(shim, 'module.exports = {};\n');
  execSync(
    `npx esbuild scripts/smoke-veo.harness.ts --bundle --platform=node --format=cjs --tsconfig=tsconfig.json ` +
    `--alias:server-only=${shim} --alias:next/headers=${shim} --outfile=${bundle}`,
    { cwd: WEB, stdio: ['ignore', 'ignore', 'inherit'] },
  );
} catch { console.error('esbuild 번들 실패'); cleanup(); process.exit(2); }

const run = spawnSync('node', [bundle], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_MOCK_MODE: '0',
    NEXT_PUBLIC_SUPABASE_URL: supaUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supaAnon,
    SUPABASE_SERVICE_ROLE_KEY: supaSvc,
  },
});
cleanup();
process.exit(run.status ?? 1);
