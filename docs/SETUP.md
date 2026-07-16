# SETUP — mock에서 실연동으로 (단계별 런북)

> 기본은 `MOCK_MODE=1`(인메모리)이라 **키 없이 전체 데모**가 됩니다.
> 이 문서는 실제 DB·인증·AI·결제·도메인을 붙일 때의 순서와 준비물입니다.
> **하나가 아니라 5개의 독립 연동**이고, 대부분 대표님이 계정/키/사업 준비를 먼저 해야 합니다.

## 전체 그림

| 연동 | 무엇을 위해 | 대표님이 준비할 것 | 비용 | 우선순위 |
|---|---|---|---|---|
| **Supabase** (DB+인증) | 실 저장·카카오/구글 로그인·멀티테넌시 | 로컬은 Docker만 / 클라우드는 프로젝트+OAuth 앱 | 무료~$25/월 | **1 (토대)** |
| **Gemini / GLM** (AI) | 진짜 이미지·카피 생성 | API 키 | 호출당 과금 | 2 |
| **Veo 3.1** (영상) | 영상 편집 (Premium) | 현재 **스텁** → 실구현 필요 | 초당 과금 | 3 |
| **토스페이먼츠** | 실제 결제/구독 | **사업자등록 + 토스 가맹** | 수수료 | 4 |
| **Cloudflare + 도메인** | 서브도메인/커스텀 도메인 서빙 | **anakslabs.com 실소유** + Vercel 배포 | 도메인 연 1~2만원 | 5 |
| **네이버 IndexNow** | 발행 URL 변경 알림 | 16자 이상의 서버 시크릿 | 무료 | 5 |

전환 스위치는 `web/.env.local`의 `NEXT_PUBLIC_MOCK_MODE`. **`0`이면 실연동, 그 외/미설정이면 mock**입니다.

## 환경변수 전체 (`web/.env.local`)

`web/.env.example`을 복사해서 채웁니다. 빈 값이면 해당 연동만 비활성(mock 유지).

```bash
# ── 모드 ──
NEXT_PUBLIC_MOCK_MODE=1                 # 0 = 실연동, 그 외 = mock
NEXT_PUBLIC_ROOT_DOMAIN=anakslabs.com   # 서브도메인 서빙 루트

# ── Supabase (DB + Auth) ──
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=              # 서버 전용 — 클라이언트 노출 금지

# ── AI ──
GEMINI_API_KEY=                         # 이미지 (Nano Banana)
GLM_API_KEY=                            # 카피/텍스트

# ── Cloudflare for SaaS (커스텀 도메인) ──
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ZONE_ID=

# ── 토스페이먼츠 ──
TOSS_SECRET_KEY=                        # 서버 — 결제 조회/검증
NEXT_PUBLIC_TOSS_CLIENT_KEY=            # 클라이언트 — 결제창

# ── 크론 보호 ──
CRON_SECRET=dev-secret                  # /api/cron/* Bearer 검증

# ── 네이버 검색 발견 알림 ──
INDEXNOW_SECRET=                        # 서버 전용 16자 이상, 테넌트별 검증 키를 HMAC으로 파생
```

---

## 단계 1 — Supabase 로컬 ⭐ (여기서 시작)

계정·비용 없이 실제 Postgres + RLS + 크레딧 원장 + (설정 시) 소셜 로그인을 로컬에서 켭니다.

**사전 준비**: Docker Desktop 실행.

```bash
# 저장소 루트에서
npx supabase start          # 로컬 스택 기동 (초회는 이미지 pull로 수 분)
npx supabase db reset       # migrations 0001~0006 + seed.sql 일괄 적용
npx supabase status         # API URL / anon key / service_role key 출력
```

`status` 출력값을 `web/.env.local`에 주입하고 mock을 끕니다:

```bash
NEXT_PUBLIC_MOCK_MODE=0
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<status의 anon key>
SUPABASE_SERVICE_ROLE_KEY=<status의 service_role key>
```

```bash
cd web && npm run dev
```

**확인**: Studio(http://127.0.0.1:54323)에서 테이블 확인. `/dashboard`가 실 DB의 시드(화로담·민트세탁소)를 읽으면 성공.

- 스키마/RPC/RLS 세부·크레딧 함수 규약은 [supabase/README.md](../supabase/README.md).
- **권한 모델**: 모든 서버 DB 접근은 **service_role 단일 클라이언트**로만(브라우저→PostgREST 직결 없음). `anon`은 앱 테이블 접근 없음, `authenticated`는 RLS로 자기 행만, 서버는 `service_role`(RLS 우회). 앱 테이블 DML은 `0006`에서 명시 부여됐고, **금전 테이블(credit_ledger·credit_balances·payments)은 service_role조차 직접 쓰기 불가 — 함수 경유만**. (이 grant가 없으면 실 DB 모드가 permission denied로 막힌다.)
- 스키마 변경 때마다 `npx supabase db reset` 재실행.
- ⚠️ **시드의 데모 유저 2명은 소셜 로그인 불가한 데이터 전용 계정**입니다. 실 로그인은 단계 2 필요.
- ⚠️ 로컬에서 `MOCK_MODE=0`이면 로그인 페이지의 "데모 버튼"은 사라지고 카카오/구글 버튼만 남습니다 — 단계 2 없이는 로그인이 안 됩니다. 로그인 없이 DB만 보려면 Studio를 쓰세요.

---

## 단계 2 — 카카오 / 구글 OAuth (실 로그인)

공통 Redirect URI:
- 클라우드: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- 로컬: `http://127.0.0.1:54321/auth/v1/callback`

**카카오** (국내 1순위):
1. [카카오 디벨로퍼스](https://developers.kakao.com) → 애플리케이션 추가
2. 카카오 로그인 **활성화** + Redirect URI 등록
3. 동의항목: **카카오계정(이메일) 필수**
4. **REST API 키**(=Client ID) + **Client Secret** 발급
5. Supabase → Authentication > Providers > **Kakao**에 입력

**구글**:
1. GCP → OAuth 동의 화면 → OAuth 클라이언트 ID(웹) 생성
2. 승인된 리디렉션 URI에 위 Redirect URI 등록
3. Client ID/Secret을 Supabase → Providers > **Google**에 입력

로컬 프로바이더는 `supabase/config.toml`의 `[auth.external.*]` 블록 + `supabase/.env` 키 필요.

로그인 흐름: 카카오/구글 → `/api/auth/callback`(code exchange) → `clients.upsertFromAuth`로 `auth.users` ↔ `clients` 연결 → `/dashboard`.

---

## 단계 3 — Supabase 클라우드 (프로덕션)

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push          # migrations만 적용 (seed는 미적용 — 프로덕션엔 실데이터)
```

프로덕션 env(Vercel 등)에 클라우드 URL·anon·service_role 키 주입 + `NEXT_PUBLIC_MOCK_MODE=0`. Auth Providers는 클라우드 대시보드에서 단계 2대로 등록.

---

## 단계 4 — AI 생성 (Gemini / GLM)

```bash
GEMINI_API_KEY=...    # 이미지 — Gemini 2.5 Flash Image (Nano Banana)
GLM_API_KEY=...       # 카피
```

- 실모드 이미지는 base64 → Supabase Storage `ai-assets` 공개 버킷에 업로드 후 URL 저장(site_config에 base64를 넣지 않음).
- GLM 실패 시 결정적 템플릿 카피로 강등되어 온보딩이 죽지 않음.
- ⚠️ **Veo 3.1(영상)은 스텁**입니다. 실모드에서 영상 편집 요청 시 502 + **크레딧 자동 환불**로 안전하게 막힙니다. 실구현하려면 `web/src/lib/ai/veo-video.ts`에 predictLongRunning 폴링 + Storage 업로드 추가.
- 비용: 이미지 ~55원/장, 영상 초당 과금. 호출당 실비가 나가니 실키 전환 시 유의.

---

## 단계 5 — 토스페이먼츠 (결제)

**선행**: 사업자등록 + 토스페이먼츠 가맹 심사.

```bash
TOSS_SECRET_KEY=...            # 서버 — 결제 조회/검증
NEXT_PUBLIC_TOSS_CLIENT_KEY=...# 클라이언트 — 결제창
```

- 웹훅(`/api/payments/webhook`)은 **본문을 신뢰하지 않고** `TOSS_SECRET_KEY`로 토스 결제조회 API를 호출해 `status=DONE`·`orderId`·`totalAmount`를 재검증한 뒤에만 크레딧을 지급합니다(무인증 크레딧 발급 취약점 차단, 감사 반영). 미설정 시 실결제는 fail-closed로 거부됩니다.
- orderId 규약: `cp_{credits}_{clientId}_{nonce}`(팩) / `bf_{tier}_{clientId}_{nonce}`(빌드비) / `ms_{clientId}_{nonce}`(유지보수).
- ⚠️ **미구현**: 결제창 SDK(`@tosspayments/payment-sdk`) 클라이언트 연동. 현재 실모드 구매는 checkout 파라미터 반환까지만.

---

## 단계 6 — Cloudflare for SaaS + 도메인 (배포)

**선행**: `anakslabs.com` 실소유 + Cloudflare 존 등록 + Vercel 배포.

```bash
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ZONE_ID=...
```

- **기본 서브도메인**(`xxx.anakslabs.com`): 자체 존 와일드카드 — Cloudflare for SaaS 과금 대상 아님(무료).
- **커스텀 도메인**(고객 소유): `/api/domains`가 Cloudflare custom_hostnames API로 등록 → 검증 CNAME/TXT 반환 → 고객이 DNS 추가 → SSL 자동 발급 → `active`. 100개까지 무료, 이후 $0.10/호스트네임/월.
- 서빙 경로: 요청 host → `web/src/proxy.ts`가 파싱 → `/s/[domain]` rewrite → 발행본 SSR.
- `INDEXNOW_SECRET`을 설정하면 발행 성공 뒤 canonical 페이지 URL을 네이버 IndexNow에 비동기 통지합니다. 각 도메인의 검증 키는 `/indexnow-key.txt`에서 제공되며, 통지 수락은 색인·순위를 보장하지 않습니다.
- Vercel Cron: `web/vercel.json`에 `/api/cron/expire-credits` 매일 03:00 KST 등록됨(`CRON_SECRET` 검증).

---

## 실연동 검증 체크리스트

- [ ] `MOCK_MODE=0`에서 `npm run build` 그린
- [ ] 카카오/구글 로그인 → `/dashboard` 진입, `clients` row 생성 확인
- [ ] 온보딩: 설문 → AI 후보 3안(실 이미지) → 생성 → 발행 → `/s/{domain}` 서빙
- [ ] 크레딧: 팩 구매(토스 테스트키) → 웹훅 → 원장/잔액 반영
- [ ] 편집 요청: 이미지 1cr 차감 → QA 큐 → 승인/반려(환불) 확인
- [ ] 커스텀 도메인: request → DNS 안내 → `active` 전이
- [ ] 발행 후 `/indexnow-key.txt` 200 + 서버 로그에 IndexNow 오류 없음 확인
- [ ] 크론: `expire_credits` 만료 처리
