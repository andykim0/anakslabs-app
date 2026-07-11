/**
 * mock 모드 데모 시드 — supabase/seed.sql과 내용 일치 (파일 대조 유지).
 *
 * 차이점 (의도된 것):
 *  - client id: DB는 auth.users uuid, mock은 세션 쿠키 계약값 'demo-premium' / 'demo-basic'
 *  - 화로담 site_config: seed.sql의 간이판 대신 완성도 높은 HWARODAM_SITE_CONFIG 사용
 *  - 원격 picsum 이미지 → 로컬 /mock 자산 (오프라인 데모 1급 시민)
 *
 * 정합 검증 (seed.sql과 동일해야 하는 값):
 *  - premium 잔액 6 = initial_grant +3(180일) + purchase +5(365일) - 소모 3 + 환불 1
 *  - basic 잔액 1 = initial_grant +1(180일)
 *  - 결제 4건: 화로담 build_fee 1,290,000 / credit_pack 65,000(+5) / maintenance 49,000, 민트 build_fee 490,000
 *  - 편집 요청 3건: applied(text) / qa_review(image) / rejected(image, 환불됨)
 */
import type { Client, CreditLedgerEntry, EditRequest, Payment, Site } from '@/lib/types/domain';
import { QA_AUTOMATION_DEFAULTS } from '@/lib/credits/constants';
import { daysAgoIso, daysFromIso, type MockStore } from './store';
import { normalizeSiteConfig } from '@/lib/types/site';
import { ensureMotion } from '@/lib/motion/validate';
import { HWARODAM_SITE_CONFIG } from './hwarodam';
import { MINTWASH_DRAFT_CONFIG } from './mintwash';

export const DEMO_PREMIUM_ID = 'demo-premium';
export const DEMO_BASIC_ID = 'demo-basic';

export const HWARODAM_SITE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const MINTWASH_SITE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const EDIT_TEXT_APPLIED_ID = '33333333-3333-3333-3333-333333333331';
const EDIT_IMAGE_QA_ID = '33333333-3333-3333-3333-333333333332';
const EDIT_IMAGE_REJECTED_ID = '33333333-3333-3333-3333-333333333333';

const PAY_HWA_BUILD_ID = 'pay-hwarodam-build-001';
const PAY_HWA_PACK_ID = 'pay-hwarodam-pack5-001';
const PAY_HWA_MAINT_ID = 'pay-hwarodam-maint-001';
const PAY_MINT_BUILD_ID = 'pay-mintwash-build-001';

const KEY_HWA_BUILD = 'mock_toss_hwarodam_build_001';
const KEY_HWA_PACK = 'mock_toss_hwarodam_pack5_001';
const KEY_HWA_MAINT = 'mock_toss_hwarodam_maint_2026_07';
const KEY_MINT_BUILD = 'mock_toss_mintwash_build_001';

export function buildSeed(): MockStore {
  // ---------- 고객 ----------
  const clients = new Map<string, Client>([
    [
      DEMO_PREMIUM_ID,
      {
        id: DEMO_PREMIUM_ID,
        name: '화로담 김대표',
        email: 'kim@hwarodam.kr',
        authProvider: 'kakao',
        tier: 'premium',
        status: 'active',
        createdAt: daysAgoIso(30),
        // [v3 통일] 사업자정보는 SiteConfig.businessInfo(사이트 단위)로 이동 → HWARODAM_SITE_CONFIG.businessInfo
      },
    ],
    [
      DEMO_BASIC_ID,
      {
        id: DEMO_BASIC_ID,
        name: '민트세탁소 박사장',
        email: 'park@mintwash.kr',
        authProvider: 'google',
        tier: 'basic',
        status: 'active',
        createdAt: daysAgoIso(10),
        // [v3 통일] 사업자정보는 SiteConfig.businessInfo(사이트 단위)로 이동
      },
    ],
  ]);

  // ---------- 사이트 ----------
  const sites = new Map<string, Site>([
    [
      HWARODAM_SITE_ID,
      {
        id: HWARODAM_SITE_ID,
        clientId: DEMO_PREMIUM_ID,
        name: '화로담',
        domain: 'hwarodam.anakslabs.com', // 소문자 저장 계약
        domainType: 'subdomain',
        dnsVerified: false,
        cloudflareHostnameId: null,
        status: 'live',
        // [v4] 시드 주입 지점 정규화 — 저장소엔 v2만 존재 (리터럴은 v1 그대로 유지) + motion 기본값
        siteConfig: ensureMotion(normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG))),
        // 발행본과 동일한 초안으로 시작 (에디터 재진입 기준) — seed.sql과 동일
        draftConfig: ensureMotion(normalizeSiteConfig(structuredClone(HWARODAM_SITE_CONFIG))),
        publishedAt: daysAgoIso(20),
        createdAt: daysAgoIso(28),
      },
    ],
    [
      MINTWASH_SITE_ID,
      {
        id: MINTWASH_SITE_ID,
        clientId: DEMO_BASIC_ID,
        name: '민트세탁소',
        domain: null, // 온보딩 중 — 발행 시 서브도메인 자동 할당
        domainType: 'subdomain',
        dnsVerified: false,
        cloudflareHostnameId: null,
        status: 'draft',
        siteConfig: null,
        draftConfig: ensureMotion(normalizeSiteConfig(structuredClone(MINTWASH_DRAFT_CONFIG))),
        publishedAt: null,
        createdAt: daysAgoIso(5),
      },
    ],
  ]);

  // ---------- 결제 (웹훅 처리 결과와 동일한 형태) ----------
  const payments = new Map<string, Payment>([
    [
      PAY_HWA_BUILD_ID,
      {
        id: PAY_HWA_BUILD_ID,
        clientId: DEMO_PREMIUM_ID,
        type: 'build_fee',
        amount: 1_290_000,
        creditsGranted: 3,
        providerPaymentKey: KEY_HWA_BUILD,
        createdAt: daysAgoIso(30),
      },
    ],
    [
      PAY_HWA_PACK_ID,
      {
        id: PAY_HWA_PACK_ID,
        clientId: DEMO_PREMIUM_ID,
        type: 'credit_pack',
        amount: 65_000,
        creditsGranted: 5,
        providerPaymentKey: KEY_HWA_PACK,
        createdAt: daysAgoIso(15),
      },
    ],
    [
      PAY_HWA_MAINT_ID,
      {
        id: PAY_HWA_MAINT_ID,
        clientId: DEMO_PREMIUM_ID,
        type: 'maintenance_subscription',
        amount: 49_000,
        creditsGranted: 0,
        providerPaymentKey: KEY_HWA_MAINT,
        createdAt: daysAgoIso(8),
      },
    ],
    [
      PAY_MINT_BUILD_ID,
      {
        id: PAY_MINT_BUILD_ID,
        clientId: DEMO_BASIC_ID,
        type: 'build_fee',
        amount: 490_000,
        creditsGranted: 1,
        providerPaymentKey: KEY_MINT_BUILD,
        createdAt: daysAgoIso(10),
      },
    ],
  ]);

  const paymentKeys = new Map<string, string>([
    [KEY_HWA_BUILD, PAY_HWA_BUILD_ID],
    [KEY_HWA_PACK, PAY_HWA_PACK_ID],
    [KEY_HWA_MAINT, PAY_HWA_MAINT_ID],
    [KEY_MINT_BUILD, PAY_MINT_BUILD_ID],
  ]);

  // ---------- 크레딧 원장 (source of truth) ----------
  // 시간순: 지급 → 소모 → 환불. seed.sql과 동일한 최종 잔액 (premium 6 / basic 1)
  const ledger: CreditLedgerEntry[] = [
    {
      id: 'seed-led-1',
      clientId: DEMO_PREMIUM_ID,
      amount: 3,
      reason: 'initial_grant',
      referenceId: PAY_HWA_BUILD_ID,
      expiresAt: daysFromIso(daysAgoIso(30), 180),
      createdAt: daysAgoIso(30),
    },
    {
      id: 'seed-led-2',
      clientId: DEMO_BASIC_ID,
      amount: 1,
      reason: 'initial_grant',
      referenceId: PAY_MINT_BUILD_ID,
      expiresAt: daysFromIso(daysAgoIso(10), 180),
      createdAt: daysAgoIso(10),
    },
    {
      id: 'seed-led-3',
      clientId: DEMO_PREMIUM_ID,
      amount: 5,
      reason: 'purchase',
      referenceId: PAY_HWA_PACK_ID,
      expiresAt: daysFromIso(daysAgoIso(15), 365),
      createdAt: daysAgoIso(15),
    },
    {
      id: 'seed-led-4',
      clientId: DEMO_PREMIUM_ID,
      amount: -1,
      reason: 'edit_text',
      referenceId: EDIT_TEXT_APPLIED_ID,
      expiresAt: null,
      createdAt: daysAgoIso(6),
    },
    {
      id: 'seed-led-5',
      clientId: DEMO_PREMIUM_ID,
      amount: -1,
      reason: 'edit_image',
      referenceId: EDIT_IMAGE_REJECTED_ID,
      expiresAt: null,
      createdAt: daysAgoIso(4),
    },
    {
      id: 'seed-led-6',
      clientId: DEMO_PREMIUM_ID,
      amount: 1,
      reason: 'refund',
      referenceId: EDIT_IMAGE_REJECTED_ID,
      expiresAt: daysFromIso(daysAgoIso(3), 365),
      createdAt: daysAgoIso(3),
    },
    {
      id: 'seed-led-7',
      clientId: DEMO_PREMIUM_ID,
      amount: -1,
      reason: 'edit_image',
      referenceId: EDIT_IMAGE_QA_ID,
      expiresAt: null,
      createdAt: daysAgoIso(2),
    },
  ];

  // 지급 lot별 잔여 — FIFO(만료 임박 lot부터) 소진을 반영한 상태.
  // premium 소모 3은 만료가 가장 이른 initial_grant lot(+150일)에서 전부 차감됨.
  const lots = [
    { entryId: 'seed-led-1', clientId: DEMO_PREMIUM_ID, remaining: 0, expiresAt: daysFromIso(daysAgoIso(30), 180) },
    { entryId: 'seed-led-2', clientId: DEMO_BASIC_ID, remaining: 1, expiresAt: daysFromIso(daysAgoIso(10), 180) },
    { entryId: 'seed-led-3', clientId: DEMO_PREMIUM_ID, remaining: 5, expiresAt: daysFromIso(daysAgoIso(15), 365) },
    { entryId: 'seed-led-6', clientId: DEMO_PREMIUM_ID, remaining: 1, expiresAt: daysFromIso(daysAgoIso(3), 365) },
  ];

  // grant 멱등키 — seed.sql의 SQL 함수가 남기는 idempotency_key와 동일 규약
  const grantKeys = new Set<string>([
    `initial_grant:${KEY_HWA_BUILD}`,
    `purchase:${KEY_HWA_PACK}`,
    `initial_grant:${KEY_MINT_BUILD}`,
    `refund:${EDIT_IMAGE_REJECTED_ID}`,
  ]);

  // ---------- 편집 요청 ----------
  const editRequests = new Map<string, EditRequest>([
    [
      EDIT_TEXT_APPLIED_ID,
      {
        id: EDIT_TEXT_APPLIED_ID,
        clientId: DEMO_PREMIUM_ID,
        siteId: HWARODAM_SITE_ID,
        type: 'text',
        creditCost: 1,
        status: 'applied',
        requestedContent: '히어로 문구를 더 짧고 힘있게 바꿔주세요. 수식어는 빼고요.',
        aiOutput: { elementId: 'hero-title', text: '여섯 가지 요리,\n하나의 불' },
        createdAt: daysAgoIso(6),
        appliedAt: daysAgoIso(5),
      },
    ],
    [
      EDIT_IMAGE_REJECTED_ID,
      {
        id: EDIT_IMAGE_REJECTED_ID,
        clientId: DEMO_PREMIUM_ID,
        siteId: HWARODAM_SITE_ID,
        type: 'image',
        creditCost: 1,
        status: 'rejected',
        requestedContent: '외관 사진을 한낮의 밝은 사진으로 바꿔주세요.',
        aiOutput: {
          url: '/mock/gen-texture-2.svg',
          qaNote: '브랜드 톤(무디 다크)과 상충 — 반려 후 야간 외관으로 재제안 예정',
        },
        createdAt: daysAgoIso(4),
        appliedAt: null,
      },
    ],
    [
      EDIT_IMAGE_QA_ID,
      {
        id: EDIT_IMAGE_QA_ID,
        clientId: DEMO_PREMIUM_ID,
        siteId: HWARODAM_SITE_ID,
        type: 'image',
        creditCost: 1,
        status: 'qa_review',
        requestedContent: '메뉴 섹션 상단에 갈비 클로즈업 사진을 어둡고 무디한 톤으로 추가해주세요.',
        aiOutput: {
          url: '/mock/gen-texture-1.svg',
          prompt: 'moody charcoal-grilled galbi closeup, dark editorial food photography',
        },
        createdAt: daysAgoIso(2),
        appliedAt: null,
      },
    ],
  ]);

  return {
    clients,
    sites,
    ledger,
    lots,
    grantKeys,
    editRequests,
    payments,
    paymentKeys,
    domainStates: new Map(),
    cfHostnameCount: 7, // 관리자 인프라 모니터 데모용
    exportBlobs: new Map(),
    qaRules: new Map(
      (['text', 'image', 'video', 'structure'] as const).map((editType) => [
        editType,
        {
          editType,
          enabled: false, // 기본 OFF — 회귀 없음 (관리자 명시 토글로만 활성화)
          approvalThreshold: QA_AUTOMATION_DEFAULTS.approvalThreshold,
          minSamples: QA_AUTOMATION_DEFAULTS.minSamples,
          sampleAuditRate: QA_AUTOMATION_DEFAULTS.sampleAuditRate,
        },
      ]),
    ),
    scans: new Map(),
    formSubmissions: new Map(),
    counters: { id: 0, text: 0, image: 0 },
  };
}
