import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import {
  assertMedicalPublicConfig,
  enforceGeneratedMedicalConfig,
  generateMedicalSafeCopy,
  MedicalAdPublicBoundaryError,
  screenMedicalCustomerCopy,
  screenMedicalSiteConfig,
} from '@/lib/content/medical-ad-enforcement';
import { MEDICAL_AD_POLICY_VERSION } from '@/lib/content/medical-ad-policy';
import { checkPublish } from '@/lib/publish/preflight';

function config(input: {
  medical?: boolean;
  industryId?: 'clinic';
  text?: string;
} = {}): SiteConfig {
  return {
    version: 2,
    theme: {
      fonts: { heading: "'Pretendard', sans-serif", body: "'Pretendard', sans-serif" },
      palette: {
        background: '#ffffff',
        surface: '#f7f7f7',
        text: '#111111',
        muted: '#555555',
        primary: '#174dda',
        accent: '#087d70',
      },
    },
    meta: {
      title: '온결 의원',
      description: '진료 범위와 예약 방법을 안내합니다.',
      purposeId: 'booking_service',
      templateId: 'booking_service.clinic',
      ...(input.medical ? { industryClass: 'medical' as const } : { industryClass: 'workshop' as const }),
      ...(input.industryId ? { industryId: input.industryId } : {}),
    },
    pages: [{
      id: 'home',
      title: '홈',
      slug: '',
      sections: [{
        id: 'hero',
        type: 'hero',
        name: '진료 안내',
        height: 720,
        background: { color: '#ffffff' },
        elements: [{
          id: 'hero-title',
          kind: 'text',
          frame: { x: 120, y: 120, w: 900, h: 120 },
          z: 1,
          text: input.text ?? 'Clear information for your visit',
          style: { fontSize: 48, fontFamily: 'heading', color: '#111111' },
        }],
      }],
    }],
  };
}

function survey(text: string): SurveyInput {
  return {
    businessName: '온결 의원',
    purposeId: 'booking_service',
    purpose: 'Appointment-based services',
    industry: '의원',
    industryClass: 'medical',
    tone: ['차분한'],
    colorPreference: 'blue',
    referenceImageUrls: [],
    sectionPlan: [{
      type: 'hero',
      name: '첫 화면',
      brief: text,
      required: true,
      source: 'template',
    }],
    templateId: 'booking_service.clinic',
    contentDepth: {
      version: 2,
      facts: [],
      faqAnswers: [],
      imports: [],
      surveyBrief: {
        version: 1,
        valueProposition: text,
      },
    },
  };
}

test('비의료 config는 즉시 빈 결과이며 생성 enforcement가 객체·바이트를 바꾸지 않는다', () => {
  const input = config({ text: '국내 유일한 공간 설계' });
  const before = JSON.stringify(input);
  const screened = screenMedicalSiteConfig(input);
  const enforced = enforceGeneratedMedicalConfig(input);
  assert.equal(screened.medical, false);
  assert.deepEqual(screened.violations, []);
  assert.strictEqual(enforced.config, input);
  assert.equal(JSON.stringify(enforced.config), before);
});

test('clinic industryId와 medical industryClass 불일치는 허용하지 않는다', () => {
  const result = screenMedicalSiteConfig(config({ industryId: 'clinic' }));
  assert.equal(result.classificationMismatch, true);
  assert.equal(result.ok, false);
  assert.equal(result.blockViolations[0]?.kind, 'classification');
});

test('block과 warn을 구분해 수집하며 warn도 현재 공개 경계에서는 fail-closed한다', () => {
  const blocked = screenMedicalSiteConfig(config({
    medical: true,
    industryId: 'clinic',
    text: 'We guarantee 100% results.',
  }));
  assert.ok(blocked.blockViolations.some((violation) => (
    violation.kind === 'copy' && violation.ruleId === 'medical-guarantee-safety'
  )));

  const warned = screenMedicalSiteConfig(config({
    medical: true,
    industryId: 'clinic',
    text: 'Laser treatment provides effective improvement.',
  }));
  assert.ok(warned.warnViolations.some(
    (violation) => violation.ruleId === 'medical-side-effect-disclosure',
  ));
  assert.equal(warned.ok, false);
});

test('고객 입력 위반은 필드 경로·안전대체 힌트를 보존하고 자동 치환하지 않는다', () => {
  const input = survey('The only treatment with a 100% guaranteed cure.');
  const before = JSON.stringify(input);
  const violations = screenMedicalCustomerCopy(input);
  assert.ok(violations.some((violation) => (
    violation.path === 'contentDepth.surveyBrief.valueProposition'
    && violation.safeReplacementHint.length > 0
  )));
  assert.equal(JSON.stringify(input), before);
});

test('결정적 시스템 폴백은 금지 카피를 안전 카탈로그로 바꾸고 정책 버전을 기록한다', () => {
  const result = enforceGeneratedMedicalConfig(config({
    medical: true,
    industryId: 'clinic',
    text: 'The only treatment with a 100% guaranteed cure.',
  }));
  assert.equal(result.usedFallback, true);
  assert.equal(result.result.ok, true);
  assert.equal(result.config.meta.medicalAdPolicyVersion, MEDICAL_AD_POLICY_VERSION);
  assert.doesNotMatch(JSON.stringify(result.config), /100%|guaranteed cure|only treatment/iu);
});

test('의료 AI 카피는 1회 제약 재시도 후에도 위반이면 결정적 카탈로그로 강등한다', async () => {
  const prompts: string[] = [];
  const output = await generateMedicalSafeCopy({
    industryClass: 'medical',
    prompt: 'Treatment introduction',
    scope: 'body',
    generate: async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1 ? '100% guaranteed cure' : 'The only guaranteed cure';
    },
  });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Medical advertising constraints/u);
  assert.equal(output.resolution, 'catalog-fallback');
  assert.equal(screenMedicalSiteConfig({
    ...config({ medical: true, industryId: 'clinic' }),
    meta: { ...config().meta, industryClass: 'medical', industryId: 'clinic', description: output.text },
  }).ok, true);
});

test('checkPublish와 공개/export 경계가 같은 전체 config 검사를 소비한다', () => {
  const contaminated = config({
    medical: true,
    industryId: 'clinic',
    text: 'A 100% cure with no side effects',
  });
  const gate = checkPublish(contaminated, 'basic');
  assert.equal(gate.ok, false);
  assert.ok(gate.blockers.some((blocker) => /Medical advertising publication blocked/u.test(blocker)));
  assert.throws(
    () => assertMedicalPublicConfig(contaminated),
    MedicalAdPublicBoundaryError,
  );
});

test('생성·수정·발행·tenant·export 경계는 의료 단일 정책 모듈을 직접 소비한다', () => {
  const files = [
    'src/app/api/onboarding/generate/route.ts',
    'src/app/api/onboarding/regenerate/route.ts',
    'src/app/api/edit-requests/route.ts',
    'src/lib/publish/preflight.ts',
    'src/app/s/[domain]/_shared.tsx',
    'src/lib/export/run-export.ts',
  ];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /medical-ad-enforcement/u, `${file} must consume the shared policy boundary`);
  }
  assert.match(
    readFileSync('src/lib/admin/edit-fulfillment-service.ts', 'utf8'),
    /checkPublish\(input\.config/u,
  );
  assert.match(
    readFileSync('src/app/api/admin/video-queue/[siteId]/complete/route.ts', 'utf8'),
    /checkPublish\(nextSiteConfig/u,
  );
});
