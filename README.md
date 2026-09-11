# Anaks Labs — AI website generator + hosting SaaS

> Portfolio mirror of the working repo (743 commits). The rest of this README is in Korean; this section is the English summary.

**What it does.** Generates a complete multi-page website for a small business from its brand inputs — brand / colour extraction, page and section generation, live preview, one-click deploy to managed hosting — and sells it as a one-time build plus a monthly maintenance subscription.

**Stack.** TypeScript / Next.js (`web/`), Supabase (auth, Postgres, storage), Vercel, AI generation APIs (image and video).

**Run it without keys.** Mock mode is the default (`NEXT_PUBLIC_MOCK_MODE` unset or `1`): every external integration — database, auth, AI, payments, CDN — is replaced by in-memory fakes, so the whole generate → preview → deploy flow runs locally with no credentials. Set `NEXT_PUBLIC_MOCK_MODE=0` to hit real services.

**What I'd point at first.** The multi-page site model (pages > sections) and the preview / deploy pipeline under `web/`.

---

# 아낙스랩스 (Anaks Labs)

> AI로 고객 니치에 맞춘 웹사이트를 **자동 생성**하고, 자체 인프라에 **멀티테넌트로 호스팅**하며,
> 월 유지보수 구독 + 편집 크레딧으로 수익을 내는 웹사이트 제작 SaaS.

에이전시(평균 430만~800만원) 대비 **5분의 1 이하** 가격에 프리미엄 웹사이트를 제공하고,
낮은 한계원가(인프라 고정비 + AI API 변동비)로 높은 마진을 유지하는 것이 목표.

- **Basic**: 이미지 전용 정적 사이트 · 39만~59만원(1회) + 월 19,000~29,000원
- **Premium**: 영상/애니메이션 포함 동적 사이트 · 89만~149만원(1회) + 월 39,000~59,000원

---

## 빠른 시작 (키 없이 전체 데모)

`MOCK_MODE=1`이 **기본값**이라 외부 연동(DB·인증·AI·결제·도메인) 없이 전체 플로우가 동작합니다.

```bash
cd web
npm install       # 최초 1회
npm run dev       # http://localhost:3000
```

`web/.env.local`이 없으면 자동으로 mock 모드입니다. 실연동은 [docs/SETUP.md](docs/SETUP.md) 참조.

### 데모 진입점

| 경로 | 내용 |
|---|---|
| `/` | 제품 랜딩 |
| `/login` | **데모 버튼 3개** — Premium 고객 / Basic 고객 / 관리자 (mock 로그인) |
| `/dashboard` | 고객 홈 — 사이트 목록, 크레딧, 온보딩 진입 |
| `/dashboard/sites/[id]/editor` | **PPT식 자유배치 캔버스 에디터** |
| `/onboarding` | 설문 → AI 후보 3안 → 생성 위저드 |
| `/admin` | 관리자 콘솔 — QA 큐, 고객 관리, 인프라 모니터 |
| `/s/hwarodam.anakslabs.com` | **발행된 데모 사이트**(화로담 숯불 화로구이)가 실제 서빙되는 모습 |

**데모 계정** (mock 시드):
- **화로담 김대표** (Premium, 크레딧 6) — 라이브 사이트 1개, 결제/편집 이력 보유
- **민트세탁소 박사장** (Basic, 크레딧 1) — 온보딩 중 초안 · Basic이라 영상 편집 시 업셀 모달

---

## 온보딩 플로우 (제품 코어 — 순서 고정)

```
설문 ─────────────→ 1차 가공 ──────────→ 2차 가공 ──────→ 확정 ──→ 호스팅
(레퍼런스·색·톤·      (AI 디자인 후보 3안    (PPT식 캔버스     (발행)   (xxx.anakslabs.com
 목적·섹션 구성)       중 1개 선택,          자유 편집)                 즉시 라이브)
                      3D 렌더 포함)
```

---

## 아키텍처 한눈에

1. **하이브리드 사이트 모델** — 고객 사이트 = `sites.site_config`(jsonb) 하나.
   `theme`(사이트별 AI 생성 폰트/팔레트/CSS) + `sections[]`(수직 스택). 각 섹션 내부는
   **자유배치 캔버스**(요소가 `frame {x,y,w,h}` 절대좌표, 디자인 폭 1440px 기준).
   렌더 시 뷰포트 폭에 비례 스케일(cqw), 모바일은 y좌표 순 자동 스택.
2. **PPT식 캔버스 에디터** — 드래그·8핸들 리사이즈·스냅 가이드·z-order·인스펙터·undo/redo·자동저장 → 발행 분리.
3. **멀티테넌트 서빙** — `xxx.anakslabs.com` → `proxy.ts`가 호스트 파싱 → `/s/[domain]` rewrite → 발행본 SSR. 커스텀 도메인은 Cloudflare for SaaS.
4. **멀티테넌트 DB** — Supabase 단일 프로젝트, 전 테이블 `client_id` + RLS 격리. 잔액은 `credit_ledger`(원장)가 원본, `credit_balances`는 캐시.
5. **Mock 모드 1급 시민** — `MOCK_MODE=1`이면 전 연동을 인메모리 mock으로 대체. 실키를 꽂으면 실연동.

### 디렉토리 구조

```
anakslabs/
├── CLAUDE.md                  # 아키텍처 헌법 · 소유권 · 불변식 (작업 전 필독)
├── docs/
│   ├── SPEC.md                # 전체 요구사항 명세
│   ├── SETUP.md               # 실연동 단계별 런북 (Supabase 로컬 → 프로덕션)
│   └── STATUS.md              # 빌드/검증/잔여 작업 스냅샷
├── supabase/
│   ├── migrations/0001_init.sql  # 테이블 6종 + RLS + 크레딧/결제 SQL 함수 8종
│   ├── seed.sql               # 데모 데이터
│   └── README.md              # DB 셋업 · RPC 규약 · RLS 요약
└── web/                       # Next.js 16 앱 (App Router)
    └── src/
        ├── app/
        │   ├── (auth)/        # 로그인
        │   ├── (dashboard)/   # 고객 대시보드 · 온보딩 · 캔버스 에디터
        │   ├── (admin)/       # 관리자 콘솔
        │   ├── api/           # API 라우트 (인증·온보딩·크레딧·편집·결제·도메인·관리자·크론)
        │   └── s/[domain]/    # 멀티테넌트 사이트 렌더 페이지
        ├── proxy.ts           # 호스트 라우팅 (middleware 후속 컨벤션)
        ├── components/
        │   ├── editor/        # 캔버스 에디터
        │   ├── site-renderer/ # 발행 사이트 렌더러 (cqw 비례 스케일)
        │   ├── dashboard/     # 고객 UI
        │   └── admin/         # 관리자 UI
        ├── stores/            # zustand + zundo (에디터 상태/undo)
        └── lib/
            ├── types/         # 계약: site.ts(캔버스), domain.ts(도메인 모델)
            ├── data/          # 데이터 계층 — index.ts(팩토리) + mock/ + supabase/
            ├── services/      # auth · cloudflare
            ├── ai/            # gemini-image · glm-text · veo-video 어댑터
            ├── credits/       # 크레딧 상수
            └── env.ts         # 환경 플래그
```

---

## 기술 스택

Next.js 16(App Router) · TypeScript · Tailwind v4 · Supabase(Auth: 카카오/구글, DB+RLS) ·
Zustand+zundo(에디터/undo) · TanStack Query · react-hook-form+zod · framer-motion · lucide-react.
결제: 토스페이먼츠. AI: 이미지 Nano Banana(Gemini) · 텍스트 GLM · 영상 Veo 3.1 — 전부 `lib/ai/` 어댑터 뒤에.

## 크레딧 규칙 요약

- **초기 지급**: Basic +1 / Premium +3 (빌드비 결제 웹훅에서 자동)
- **소모**: 텍스트 1 / 이미지 1 / 영상 3(Premium 전용, Basic은 업셀) / 구조변경 2
- **팩**: 1개 15,000원 / 5개 65,000원 / 10개 120,000원
- **만료**: 초기 지급분 180일 · 구매분 365일 (만료 임박 lot부터 FIFO 소진)
- **불변식**: 잔액 직접 UPDATE 금지 → 원장 append 후 재계산. 웹훅 멱등. 금액은 numeric(float 금지).

## 명령어

```bash
cd web && npm run dev        # MOCK_MODE=1 기본 — 키 없이 전체 데모
cd web && npm run build      # 프로덕션 빌드 (통합 검증 기준)
cd web && npx tsc --noEmit   # 타입 체크
```

## 문서 지도

| 문서 | 언제 보나 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 코드 작업 전 — 소유권 경계·불변식 |
| [docs/SPEC.md](docs/SPEC.md) | 요구사항 전문 |
| [docs/SETUP.md](docs/SETUP.md) | mock → 실연동으로 전환할 때 |
| [docs/STATUS.md](docs/STATUS.md) | 무엇이 완성됐고 무엇이 남았나 |
| [supabase/README.md](supabase/README.md) | DB 스키마·RPC·RLS 세부 |
