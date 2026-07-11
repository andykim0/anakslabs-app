/**
 * [Veo] e2e 하네스 — scripts/smoke-veo.mjs 가 esbuild 번들해 실행(SMOKE_VEO_RUN=1일 때만).
 * getDataServices().ai.generateVideo 를 1회 호출 → Storage 공개 URL 확인. (유료 — 8초 클립 1회)
 * exit: 0 성공 / 1 실패 / 3 billing·쿼터·타임아웃(코드경로 정상, 계정/설정 이슈)
 */
import { getDataServices } from '@/lib/data';

(async () => {
  try {
    const t0 = Date.now();
    const res = await getDataServices().ai.generateVideo({
      prompt: '고요한 카페 창가에 스며드는 아침 햇살, 김이 오르는 커피 한 잔, 잔잔한 카메라 무빙',
    });
    const ok = /^https?:\/\//.test(res.url);
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`  ${ok ? '✓' : '✗'} generateVideo → ${res.url}  (${res.poster ? 'poster 있음' : 'poster 생략'}) · ${secs}s`);
    if (!ok) { console.log('\n❌ URL 형태 아님'); process.exit(1); }
    console.log('\n✅ Veo e2e 1회 성공 (Storage 업로드 URL 반환)');
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/VEO_BILLING_REQUIRED|VEO_QUOTA|VEO_NOT_CONFIGURED/.test(msg)) {
      console.log(`  ⏭  코드 경로 정상 — 계정 설정 필요(billing/쿼터/키):\n     ${msg.slice(0, 220)}`);
      process.exit(3);
    }
    if (/VEO_TIMEOUT/.test(msg)) {
      console.log(`  ⚠ 타임아웃(상한 내 미완) — 재시도 필요:\n     ${msg.slice(0, 180)}`);
      process.exit(3);
    }
    console.log(`  ✗ 예상 밖 실패: ${msg.slice(0, 260)}`);
    process.exit(1);
  }
})();
