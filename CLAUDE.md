# 아낙스랩스 (Anaks Labs) — 웹사이트 제작+호스팅 SaaS

> AI로 고객 니치에 맞춘 웹사이트를 자동 생성하고, 자체 인프라(멀티테넌트)에 호스팅하며,
> 월 유지보수 구독 + 편집 크레딧으로 수익을 내는 서비스.
> 전체 요구사항: `docs/SPEC.md` (반드시 먼저 읽을 것)

## 확정된 아키텍처 결정 (변경 금지 — 변경은 사용자 승인 필요)

1. **하이브리드 사이트 모델**: 고객 사이트 = `sites.site_config`(jsonb) 하나로 표현.
   - `theme`(사이트별 AI 생성 폰트/팔레트/커스텀 CSS) + `sections[]`(수직 스택).
   - 각 섹션 내부는 **자유배치 캔버스**: 요소들이 `frame {x,y,w,h}` 절대좌표(디자인 폭 1440px 기준)로 배치.
   - 렌더링: 뷰포트 폭에 비례 스케일. 모바일(<768px): 요소를 y좌표 순으로 자동 스택(MVP).
2. **PPT식 자유배치 에디터**: 드래그 이동, 8핸들 리사이즈, 스냅 가이드, z-order, 인스펙터, undo/redo(zundo), 초안 자동저장 → 발행(publish) 분리.
3. **멀티테넌트 서빙**: `xxx.anakslabs.com` → middleware가 호스트 파싱 → `/s/[domain]` rewrite → 발행된 site_config SSR 렌더. 커스텀 도메인은 Cloudflare for SaaS Custom Hostnames.
4. **멀티테넌트 DB**: Supabase 단일 프로젝트, 모든 테이블 `client_id` 격리 + RLS. 잔액은 `credit_ledger`가 원본(source of truth), `credit_balances`는 캐시.
5. **Mock 모드가 1급 시민**: `MOCK_MODE=1`(기본)이면 외부 연동(DB/Auth/AI/PG/Cloudflare) 전부 인메모리 mock으로 대체되어 키 없이 전체 플로우 데모 가능. 실키를 꽂으면 실연동.

## 온보딩 플로우 (로그인 후 고객 경험 — 순서 고정)

설문(레퍼런스 이미지·색·톤·목적·섹션 구성) → **1차 가공**(AI 디자인 후보 3안 — 테마+히어로 비주얼, 3D 렌더 스타일 포함 — 중 1개 선택) → **2차 가공**(PPT식 캔버스 편집) → 확정 → 호스팅(서브도메인 즉시 라이브)

## 디렉토리 소유권 (병렬 작업 시 자기 영역만 수정)

| 영역 | 경로 |
|---|---|
| DB 스키마/RLS/함수 | `supabase/` |
| 데이터 계층·서비스·API | `web/src/lib/data/`, `web/src/lib/services/`, `web/src/lib/ai/`, `web/src/app/api/` |
| 캔버스 에디터 | `web/src/components/editor/`, `web/src/app/(dashboard)/sites/[siteId]/editor/`, `web/src/stores/` |
| 고객 대시보드/온보딩 | `web/src/app/(dashboard)/`(에디터 페이지 제외), `web/src/app/(auth)/`, `web/src/components/dashboard/` |
| 멀티테넌트 렌더러 | `web/src/middleware.ts`, `web/src/app/s/`, `web/src/components/site-renderer/` |
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

## 크레딧 규칙 요약

초기 지급: Basic +1 / Premium +3 (build_fee 결제 웹훅에서 자동). 소모: 텍스트 1 / 이미지 1 / 영상 3(Premium 전용, Basic은 업셀) / 구조변경 2. 팩: 1개 15,000원 / 5개 65,000원 / 10개 120,000원.

## 명령어

```bash
cd web && npm run dev        # MOCK_MODE=1 기본 — 키 없이 전체 데모
cd web && npm run build      # 프로덕션 빌드 (통합 검증 기준)
cd web && npx tsc --noEmit   # 타입 체크
```

## 기술 스택

Next.js 15(App Router, `web/`) · TypeScript · Tailwind v4 · Supabase(Auth: 카카오/구글, DB+RLS) · Zustand+zundo(에디터 상태/undo) · TanStack Query · react-hook-form+zod · framer-motion · lucide-react. 결제: 토스페이먼츠(mock 우선). AI: 이미지 Nano Banana(Gemini), 텍스트 GLM, 영상 Veo 3.1 — 전부 `lib/ai/` 어댑터 뒤에.
