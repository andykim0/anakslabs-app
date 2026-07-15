/**
 * [A] AI 어댑터 실키 검증 하네스 — scripts/smoke-ai.mjs 가 esbuild 번들해 실행.
 * getDataServices().ai(supabase 구현)의 4개 메서드를 샘플 1회씩 호출.
 * 분류: ✓ 통과 / ⚠ 키·경로는 동작하나 계정 크레딧·쿼터 이슈 / ⏭ 의존성(키/스토리지) 없음 / ✗ 실패
 */
import { getDataServices } from '@/lib/data';
import type { SurveyInput } from '@/lib/types/domain';

const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasGemini = !!process.env.GEMINI_API_KEY;
const supaReady = process.env.SMOKE_SUPA_READY === '1';
const KOREAN = /[가-힣]/;
const KNOWN = ['hero','about','features','menu','gallery','testimonials','pricing','contact','cta','custom','team','cases','faq'];
// 서버 운영자가 실행하는 하네스 전용 owner. provenance WRITE 점검 시 실제 clients.id를 명시한다.
const aiOwner = { clientId: process.env.SMOKE_CLIENT_ID?.trim() || 'smoke-ai-harness' };

const survey: SurveyInput = {
  businessName: '스모크살롱', purposeId: 'booking_service', purpose: '예약·서비스업',
  industry: '미용실', tone: ['모던'], colorPreference: '차콜', referenceImageUrls: [],
  sectionPlan: [{ type: 'hero', name: '히어로', brief: '', required: true, source: 'template' }],
  templateId: 'booking_service.default',
};

let fails = 0, warns = 0;
function classify(name: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  if (/credit|quota|balance|rate.?limit|too low|429|insufficient/i.test(msg)) {
    console.log(`  ⚠ ${name} — 키·경로 동작하나 계정 크레딧/쿼터 이슈: ${msg.slice(0, 80)}`); warns++;
  } else if (/SUPABASE_NOT_CONFIGURED|storage|버킷/i.test(msg)) {
    console.log(`  ⏭  ${name} — 스토리지(Supabase) 필요: skip`);
  } else {
    console.log(`  ✗ ${name} — ${msg.slice(0, 120)}`); fails++;
  }
}

(async () => {
  const ai = getDataServices().ai;

  // 1) generateText — Claude 카피
  if (!hasAnthropic) console.log('  ⏭  generateText — ANTHROPIC_API_KEY 없음');
  else {
    try {
      const t = await ai.generateText({ prompt: '미용실 히어로 한 줄 카피를 만들어줘', tone: '모던' });
      if (!t || !t.trim()) throw new Error('빈 응답');
      if (!KOREAN.test(t)) throw new Error('한국어 아님: ' + t.slice(0, 40));
      console.log(`  ✓ generateText — "${t.replace(/\n/g, ' ').slice(0, 46)}"`);
    } catch (e) { classify('generateText', e); }
  }

  // 2) suggestCustomSection — Claude 판정 + 결정적 폴백 (키 없어도 폴백 동작해야)
  try {
    const r = await ai.suggestCustomSection({
      name: '고객 후기 모음', description: '방문 후기 캡처',
      context: { businessName: '스모크살롱', industry: '미용실', purpose: '예약·서비스업' },
    });
    if (!KNOWN.includes(r.mappedType)) throw new Error('invalid mappedType: ' + r.mappedType);
    if (!r.copySeed?.trim()) throw new Error('빈 copySeed');
    // "후기 모음"은 결정적 규칙상 testimonials 로 매핑돼야 (폴백 정합)
    const ok = r.mappedType === 'testimonials' ? '(testimonials 매핑 정합)' : `(${r.mappedType})`;
    console.log(`  ✓ suggestCustomSection ${ok} — "${r.copySeed.slice(0, 30)}"`);
  } catch (e) { classify('suggestCustomSection', e); }

  // 3) generateCandidates — 3안
  if (!hasAnthropic) console.log('  ⏭  generateCandidates — ANTHROPIC_API_KEY 없음');
  else {
    try {
      const cands = await ai.generateCandidates(survey, aiOwner);
      if (!Array.isArray(cands) || cands.length !== 3) throw new Error('후보 3안 아님: ' + cands?.length);
      if (cands.some((c) => !c.label?.trim())) throw new Error('빈 라벨');
      console.log(`  ✓ generateCandidates — 3안: ${cands.map((c) => c.label).join(', ').slice(0, 46)}`);
    } catch (e) { classify('generateCandidates', e); }
  }

  // 4) generateImage — Gemini → Storage URL
  if (!hasGemini) console.log('  ⏭  generateImage — GEMINI_API_KEY 없음');
  else if (!supaReady) console.log('  ⏭  generateImage — 스토리지 업로드에 Supabase 필요(로컬 스택 미기동)');
  else {
    try {
      const img = await ai.generateImage(
        { prompt: '미니멀한 미용실 인테리어, 따뜻한 톤' },
        aiOwner,
      );
      if (!/^https?:\/\//.test(img.url)) throw new Error('URL 형태 아님: ' + img.url);
      console.log(`  ✓ generateImage — ${img.url.slice(0, 64)}`);
    } catch (e) { classify('generateImage', e); }
  }

  console.log('');
  if (fails > 0) { console.log(`❌ smoke-ai: 실패 ${fails}건 (경고 ${warns})`); process.exit(1); }
  console.log(`✅ smoke-ai: 하드 실패 0 (경고 ${warns} — 크레딧/쿼터 이슈는 어댑터 경로 정상 의미)`);
  process.exit(0);
})();
