# 아낙스랩스 (Anaks Labs) — 웹사이트 제작+호스팅 SaaS

> AI로 고객 니치에 맞춘 웹사이트를 자동 생성하고, 자체 인프라(멀티테넌트)에 호스팅하며,
> 월 유지보수 구독 + 편집 크레딧으로 수익을 내는 서비스.
> 전체 요구사항: `docs/SPEC.md` (반드시 먼저 읽을 것)

## 확정된 아키텍처 결정 (변경 금지 — 변경은 사용자 승인 필요)

1. **하이브리드 사이트 모델 (v4: 페이지>섹션 2계층)**: 고객 사이트 = `sites.site_config`(jsonb) 하나로 표현.
   - `SiteConfig{ version:2, theme, meta, pages[], nav?, businessInfo? }`. `theme`(사이트별 AI 생성 폰트/팔레트/커스텀 CSS) + **`pages[]`**(각 페이지 = `SitePage{ id,title,slug,sections[],showInNav?,navLabel? }`, 홈 slug=`''`).
   - 각 페이지 = `sections[]`(수직 스택). 각 섹션 내부는 **자유배치 캔버스**: 요소들이 `frame {x,y,w,h}` 절대좌표(디자인 폭 1440px 기준)로 배치.
   - **헤더 내비 자동 생성**: 내비 노출 페이지(`showInNav!==false`) ≥2 & `nav.enabled!==false`면 `TenantHeader`가 페이지 목록에서 헤더 내비를 렌더(단일 페이지는 미표시=무회귀). 페이지 간 링크는 `/{slug}`(홈 `/`), Export는 상대 파일명(`./{slug}.html`).
   - v1 config(`sections[]` 평면)는 읽기 경계에서 `normalizeSiteConfig`로 무손실 v2 승격(홈 페이지 1개). 데이터 계층 read 지점에서만 정규화.
   - 렌더링: 뷰포트 폭에 비례 스케일. 모바일(<768px): 요소를 y좌표 순으로 자동 스택(MVP). 서브페이지 서빙: `/s/[domain]/[...path]`(단일 세그먼트 slug), SEO(sitemap/llms.txt/jsonld)는 전 페이지 반영.
2. **PPT식 자유배치 에디터**: 드래그 이동, 8핸들 리사이즈, 스냅 가이드, z-order, 인스펙터, undo/redo(zundo), 초안 자동저장 → 발행(publish) 분리.
3. **멀티테넌트 서빙**: `xxx.anakslabs.com` → middleware가 호스트 파싱 → `/s/[domain]` rewrite → 발행된 site_config SSR 렌더. 커스텀 도메인은 Cloudflare for SaaS Custom Hostnames.
4. **멀티테넌트 DB**: Supabase 단일 프로젝트, 모든 테이블 `client_id` 격리 + RLS. 잔액은 `credit_ledger`가 원본(source of truth), `credit_balances`는 캐시.
5. **Mock 모드가 1급 시민**: `MOCK_MODE=1`(기본)이면 외부 연동(DB/Auth/AI/PG/Cloudflare) 전부 인메모리 mock으로 대체되어 키 없이 전체 플로우 데모 가능. 실키를 꽂으면 실연동.

## 온보딩 플로우 (로그인 후 고객 경험 — 순서 고정)

설문(레퍼런스 이미지·색·톤·목적·섹션 구성) → **1차 가공**(AI 디자인 후보 3안 — 테마+히어로 비주얼, 3D 렌더 스타일 포함 — 중 1개 선택) → **2차 가공**(PPT식 캔버스 편집, 페이지별) → 확정 → 호스팅(서브도메인 즉시 라이브)

**v4 페이지 구성(page>section 2계층)**: 템플릿(`SITE_TEMPLATES`)이 목적×업종 → 페이지 분할을 결정. `templatePages`가 홈/소개/문의 3계층으로 결정적 분할(홈=hero+판매/콘텐츠, 소개=`about`/`team`, 문의=`contact`; `singlePage` 템플릿[원페이지·이력서]은 단일 홈, 소개/문의 콘텐츠가 없으면 단일 홈 폴백). `planFromTemplate`이 각 `SectionPlanItem.pageSlug`를 찍어 설문에 실리고, `buildSiteConfigFromSurvey`가 pageSlug로 섹션을 묶어 **v2 pages를 직접 생성** + 페이지 간 앵커(`#sec-x`)를 `/{slug}#sec-x`로 재작성. 커스텀 섹션(suggest-section)·부가기능(extras-inject)은 `targetPageSlug`로 대상 페이지 지정 가능(미지정 시 전 페이지 탐색). 사업자정보(businessInfo)는 v3 Phase 4 에디터 모달로 입력(발행 게이트).

## 디렉토리 소유권 (병렬 작업 시 자기 영역만 수정)

| 영역 | 경로 |
|---|---|
| DB 스키마/RLS/함수 | `supabase/` |
| 데이터 계층·서비스·API | `web/src/lib/data/`, `web/src/lib/services/`, `web/src/lib/ai/`, `web/src/app/api/` |
| 캔버스 에디터 | `web/src/components/editor/`, `web/src/app/(dashboard)/dashboard/sites/[siteId]/editor/`, `web/src/stores/` |
| 고객 대시보드/온보딩 | `web/src/app/(dashboard)/`(에디터 페이지 제외), `web/src/app/(auth)/`, `web/src/components/dashboard/` |
| 멀티테넌트 렌더러 | `web/src/proxy.ts`, `web/src/app/s/`, `web/src/components/site-renderer/` |
| 관리자 콘솔 | `web/src/app/(admin)/`, `web/src/components/admin/` |
| 계약(타입/인터페이스/상수) | `web/src/lib/types/`, `web/src/lib/data/types.ts`, `web/src/lib/credits/constants.ts`, `web/src/lib/env.ts` — **Architect(메인 세션) 소유, 에이전트 수정 금지. 변경 필요 시 보고만.** |

공유 파일(`package.json`, `globals.css`, 루트 `layout.tsx`)은 빌드 에이전트 수정 금지 — 필요 의존성은 결과 보고에 명시.

## 불변식 (어기면 리뷰에서 반려)

- 크레딧 잔액을 직접 UPDATE 금지. 반드시 원장(`credit_ledger`) append → 잔액 재계산/트리거.
- 크레딧 차감/지급은 원자적(SQL 함수 또는 단일 트랜잭션). 부족 시 차감 자체가 실패해야 함.
- 결제 웹훅은 멱등(payment key 기준 dedup). 중복 웹훅 = 크레딧 1회만 지급.
- 만료: 지급 lot 단위(초기지급 180일, 구매 365일), 소진은 만료 임박 lot부터(FIFO by expires_at).
- 금액/크레딧은 numeric. float 연산 금지.
- 모든 테넌트 테이블 RLS: `client_id = auth.uid()` 기반. 관리자는 service role.
- Basic 티어가 영상 편집 요청 시: 차감 전에 업셀 안내(크레딧 3개 소모 vs Premium 업그레이드) 노출.
- 캔버스 좌표계: 디자인 폭 1440 고정(`DESIGN_WIDTH`). 에디터와 렌더러가 동일 상수 공유.
- Next.js는 **16.2.10** — `middleware.ts` 컨벤션 금지(deprecated, `proxy.ts`와 공존 시 빌드 에러). 호스트 라우팅은 `web/src/proxy.ts`만.
- mock 세션 계약: 쿠키 `anaks_mock_session`(httpOnly), 값 = mock client id `demo-premium`|`demo-basic`|`admin`. 정의는 `web/src/app/api/_lib/guards.ts`(MOCK_SESSION_COOKIE), auth 서비스가 동일 이름/값을 읽음.
- 크레딧 단가·초기지급·만료일은 `lib/credits/constants.ts`와 SQL(handle_* 함수, edit_requests 정책)에 이중 존재 — 변경 시 반드시 마이그레이션 동반.
- `sites.domain`은 소문자 정규화 저장/조회. 데모 라이브 도메인: `hwarodam.anakslabs.com`.

## v2 애드온 불변식 (스펙 개정 v2 — `docs/SPEC-V2-DESIGN.md` 구현본)

- **Export 렌더링**: App Router는 `react-dom/server`(node) import 금지 → `react-dom/server.edge` 사용. 렌더는 route/`lib/export`(run-export)만 수행하고, `DataServices.exports`(saveExport/markFailed/getDownloadUrl)는 저장 전담 — `getDataServices()` 그래프(테넌트 페이지 포함)에 react-dom/server가 새어들면 빌드 에러.
- **법적 요소 = SiteConfig.businessInfo (사이트 단위, v3 통일)**: 사업자정보(`BusinessInfo`, 정의는 `lib/types/site.ts` — businessName/ownerName/businessNumber/address/phone/email?/mailOrderNumber?)는 `SiteConfig.businessInfo`에 둔다. 서빙(`/s/[domain]`)·Export 시점에 `site.siteConfig.businessInfo`로 `LegalFooter`·privacy/terms 렌더. 법무 문서는 **고정 템플릿**(`lib/legal/templates.ts`) — AI 생성 금지(환각 리스크). (v2의 `clients.business_info`·`Client.businessInfo`·설정 폼·`/api/me/business-info`는 이 계약으로 통일되어 제거됨)
- **발행 게이트**: 발행 시 `site.draftConfig.businessInfo` 없으면 409 `BUSINESS_INFO_REQUIRED`. 사업자정보 입력 UI는 **v3 Phase 4**에서 에디터 모달로 재구축 예정. 시드 데모 사이트는 `site_config`에 businessInfo 보유(발행 데모 보존).
- **§3 안전장치**: 온보딩 무료 재생성 1회(`sites.free_regens_used`, 성공 후 증가 — AI 실패 시 미소진). 최초 발행 7일 내 첫 편집 1건 무료(`is_initial_revision`, 원장 미기록, video 제외, rejected는 카운트 제외).
- **§2 QA 자동화 기본 OFF**: `qa_automation_rules.enabled` 기본 false = 기존 플로우 100% 동일(회귀 없음). enabled면 AI 성공 후 `applied` 직행 + `auto_approved`(QA 큐 제외). video는 자동화 영구 제외.
- **업로드 SVG sanitize 필수**: `/api/uploads`는 5MB·png/jpg/webp/svg. SVG는 저장 전 `sanitizeSvg`(스크립트/이벤트핸들러/위험스킴 제거) — 저장형 XSS 방어.
- **크레딧 법적 성격**: 약관상 "편집 용역 이용권"(현금성 충전금 아님). 환불정책은 `REFUND_POLICY` 상수(결제7일내미발행 100% / 발행14일내 50% / 이후 불가). 고지 문구 단일 소스 `lib/legal/notices.ts`.
- **0002 마이그레이션**: 신규 컬럼/함수(`admin_refund_payment`·`credit_lot_remaining`)·`qa_approval_stats` 뷰·storage 버킷(`exports` 비공개/`client-assets` 공개). sites 보호컬럼 가드에 `export_*`/`free_regens_used` 추가, edit_requests insert RLS에 `is_initial_revision=false && auto_approved=false` 강제.

## 크레딧 규칙 요약

초기 지급: Basic +1 / Premium +3 (build_fee 결제 웹훅에서 자동). 소모: 텍스트 1 / 이미지 1 / 영상 3(Premium 전용, Basic은 업셀) / 구조변경 2. 팩: 1개 15,000원 / 5개 65,000원 / 10개 120,000원.

## 명령어

```bash
cd web && npm run dev        # MOCK_MODE=1 기본 — 키 없이 전체 데모
cd web && npm run build      # 프로덕션 빌드 (통합 검증 기준)
cd web && npx tsc --noEmit   # 타입 체크
cd web && npm test           # 불변식 테스트 (node:test + tsx)
```

테스트 러너는 node:test + tsx. 새 불변식 테스트는 `__tests__/*.test.ts` 규약을 따르고 `npm test`에 포함되어야 한다.

## 기술 스택

Next.js 16.2(App Router, `web/`) · TypeScript · Tailwind v4 · Supabase(Auth: 카카오/구글, DB+RLS) · Zustand+zundo(에디터 상태/undo) · TanStack Query · react-hook-form+zod · framer-motion · lucide-react. 결제: 토스페이먼츠(mock 우선). AI: 이미지 Nano Banana(Gemini), 텍스트/카피 Claude(Anthropic, `@anthropic-ai/sdk`, 기본 `claude-opus-4-8`·`CLAUDE_MODEL`로 교체), 영상 Veo 3.1 — 전부 `lib/ai/` 어댑터 뒤에.

**디자인 지능 상시 내장**: `lib/ai/design-knowledge.ts`(+`-data.ts`) — frontend-design(Apache-2.0)·ui-ux-pro-max(MIT) 스킬에서 큐레이션한 팔레트 30·폰트페어 18(한글 폴백 체인)·스타일 13·랜딩 패턴 9 + `DESIGN_PRINCIPLES_PROMPT`. 1차 가공(`design-candidates.ts`→mock/실모드 공용)이 항상 사용: 후보 3안은 `selectDesignBriefs`로 결정적 선택(3d_render ≥1·다크/라이트 혼합·중복 금지), 테마 hex는 결정적(`buildThemeFromBrief` — LLM이 색을 만들지 않음), Claude는 라벨/설명/이미지 프롬프트만 다듬음(실패 시 결정적 폴백). 데이터 변경 시 `validateDesignKnowledge()`가 dev에서 무결성 검사.
