# supabase/ — 스키마 · RLS · 크레딧 SQL 함수

아낙스랩스 멀티테넌트 DB 계층. 앱은 기본 `MOCK_MODE=1`(인메모리)로 동작하므로
이 디렉토리는 **실제 DB 모드**(`NEXT_PUBLIC_MOCK_MODE=0`) 개발/배포 시에만 필요하다.

## 파일 구성

| 파일 | 내용 |
|---|---|
| `migrations/0001_init.sql` | 코어 테이블 6종(clients·sites·edit_requests·credit_ledger·credit_balances·payments) + 인덱스 + RLS + 권한 + 크레딧/결제 SQL 함수 |
| `migrations/0002_spec_v2.sql` | v2 애드온: export 컬럼·`admin_refund_payment`·`credit_lot_remaining`·`qa_approval_stats` 뷰·storage 버킷(exports/client-assets)·sites 보호컬럼/edit_requests RLS 강화 |
| `migrations/0003_form_submissions.sql` | 테넌트 문의 폼 수신 테이블(RLS: 소유 client SELECT만, INSERT는 service_role) |
| `migrations/0004_business_info_migrate.sql` | v2 `clients.business_info` → 사이트 `site_config/draft_config.businessInfo` 이관(idempotent, 컬럼은 deprecated 유지) |
| `migrations/0005_scans.sql` | SEO/AEO/GEO 진단 결과 테이블(익명 client_id null 허용, 가입 후 claim) |
| `migrations/0006_service_role_grants.sql` | **앱 테이블 6종에 service_role DML 명시 부여** — 0001/0003/0005가 anon/authenticated 회수만 하고 기본권한에 의존해 실 DB 모드에서 permission denied로 통짜 차단되던 버그 해소. 금전 테이블은 함수 경유 불변식 유지 위해 의도적 제외 |
| `seed.sql` | 데모 데이터 (화로담=premium 라이브 사이트+businessInfo, 민트세탁소=basic 온보딩 중) |
| `config.toml` | 로컬 Supabase 스택 설정 (`npx supabase start` 진입점) |

> 마이그레이션은 번호 순 누적 적용된다. `npx supabase db reset`이 `0001→0006` + `seed.sql`을 한 번에 재적용한다.

## 로컬 실행

사전 준비: Docker Desktop 실행 중이어야 한다.

```bash
# 저장소 루트에서
npx supabase start          # 로컬 스택 기동 (초회는 이미지 pull로 수 분 소요)
npx supabase db reset       # migrations + seed.sql 적용 (스키마 변경 시마다)
npx supabase status         # API URL / anon key / service_role key 확인
npx supabase stop           # 종료
```

`npx supabase status` 출력값을 `web/.env.local` 에 주입하면 실 DB 모드로 전환된다:

```bash
NEXT_PUBLIC_MOCK_MODE=0
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Studio(테이블 뷰어): http://127.0.0.1:54323

> 시드의 데모 유저 2명은 `auth.users` 에 직접 삽입한 **데이터 전용 계정**이다
> (화면/쿼리 데모용 — 실제 소셜 로그인은 불가).

## 원격(프로덕션) 적용

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push        # migrations만 적용 (seed 미적용)
```

## OAuth 프로바이더 등록 (카카오 1순위, 구글)

공통 Redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
(로컬은 `http://127.0.0.1:54321/auth/v1/callback`)

### 카카오

1. [카카오 디벨로퍼스](https://developers.kakao.com) → 애플리케이션 추가
2. 제품 설정 > 카카오 로그인 **활성화** + 위 Redirect URI 등록
3. 동의항목: **카카오계정(이메일) 필수**, 닉네임 선택
4. 앱 키의 **REST API 키** = Client ID, 카카오 로그인 > 보안의 **Client Secret** 발급(사용함)
5. Supabase 대시보드 → Authentication > Providers > **Kakao** 에 위 두 값 입력

### 구글

1. GCP 콘솔 → OAuth 동의 화면 구성(외부) → 사용자 인증 정보 > **OAuth 클라이언트 ID**(웹) 생성
2. 승인된 리디렉션 URI에 위 Redirect URI 등록
3. Client ID / Secret 을 Supabase → Authentication > Providers > **Google** 에 입력

로컬에서 프로바이더를 쓰려면 `config.toml` 하단의 `[auth.external.*]` 블록 주석을 해제하고
`supabase/.env` 에 `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID` 등 키를 넣는다.

## 크레딧 시스템 규약 (중요)

원장(`credit_ledger`)이 잔액의 source of truth, `credit_balances`는 캐시다.
**세 금전 테이블(`credit_ledger`, `credit_balances`, `payments`)은 service_role을
포함한 어떤 API role도 직접 INSERT/UPDATE/DELETE 할 수 없다** (테이블 권한 회수됨).
모든 변동은 아래 security definer 함수를 RPC로 호출한다 — 전부 **service_role 전용**
(authenticated 는 EXECUTE 권한 없음, 서버 코드에서만 호출).

| 함수 | 용도 | 비고 |
|---|---|---|
| `grant_credits(client, amount, reason, ref?, idem_key?, expires_days?)` | 지급 | `idem_key` 중복 시 no-op |
| `consume_credits(client, amount, reason, ref?)` | 차감 | 부족 시 `insufficient_credits` exception(롤백), 성공 시 새 잔액 반환. 차감 전 해당 고객 만료분 자동 상쇄 |
| `refund_credits(client, reference_id)` | 반려 환불 | 차감 reference 기준 +환불, 멱등. 환불액 반환 |
| `expire_credits(now?)` | 만료 배치 | 만료 lot 잔여분 `expired` 상쇄, 처리 lot 수 반환, 멱등 |
| `handle_build_fee_payment(client, pay_key, amount, tier)` | 빌드비 웹훅 | 결제기록 + tier 반영 + 초기 크레딧(basic 1/premium 3, 180일). `pay_key` 중복 시 `{duplicated: true}` |
| `handle_credit_pack_payment(client, pay_key, amount, credits)` | 크레딧 팩 웹훅 | 결제기록 + 구매 크레딧(365일). 멱등 |
| `handle_maintenance_payment(client, pay_key, amount, pricing_version, period_months)` | 월 리테이너 웹훅 | 가격표 버전·기간을 결제 행에 고정하고 구독 갱신·월 크레딧을 원자 처리. 멱등 |

만료/소진 모델: 차감 행은 단순 음수 기록이고, lot별 잔여는
`지급 lot 용량(amount - expired 상쇄) - 총 소진량의 FIFO(expires_at asc) 배분`으로
재구성한다. `expired` 행은 `reference_id`로 대상 lot을 가리키므로 배치 재실행에도
중복 상쇄가 없다. 불변식: `credit_balances.balance = sum(credit_ledger.amount)`.

### 만료 배치 스케줄

둘 중 하나:

- **Vercel Cron**(권장): 매일 `/api/cron/expire-credits` 호출(`CRON_SECRET` 검증) →
  서버에서 `rpc('expire_credits')`.
- **pg_cron**: `select cron.schedule('expire-credits', '0 1 * * *', $$select public.expire_credits()$$);`

## 권한 모델 (service_role 단일 서버 접근)

앱 데이터 계층은 **service_role 단일 서버 클라이언트**로만 DB에 접근한다
(`web/src/lib/data/supabase/client.ts` — 브라우저에서 PostgREST로 직결하는 경로 없음).
따라서 실 DB 모드에서 앱이 동작하려면 서버가 쓰는 앱 테이블에 service_role DML이 있어야 한다:

- **anon** — 앱 테이블 접근 없음(전부 회수). 공개 진단 스캔·문의 폼 수신도 서버 라우트(service_role) 경유.
- **authenticated** — RLS로 **자기 `client_id` 행만** SELECT(+`sites`/`edit_requests`는 제한적 쓰기). RLS는 2차 방어선일 뿐, 정상 경로는 서버.
- **service_role** — RLS 우회(BYPASSRLS) + 앱 테이블 6종(clients·sites·edit_requests·form_submissions·scans·qa_automation_rules)에 DML 부여(`0006`). **단, 세 금전 테이블(credit_ledger·credit_balances·payments)은 service_role조차 직접 쓰기 불가 — security definer 함수 경유만**(아래 크레딧 규약).

> `0006` 이전에는 service_role DML을 Supabase 플랫폼 기본 권한에 의존해서, 로컬 CLI 등
> 기본권한이 다른 환경에서 `permission denied for table sites` 류로 실 DB 모드가 통짜로 막혔다.

## RLS 요약

- 고객(`authenticated`)은 모든 테이블에서 **자기 `client_id` 행만** 접근.
  - `clients`/`credit_*`/`payments`: SELECT만
  - `sites`: SELECT + UPDATE — 단 트리거가 `name`/`draft_config`/`survey` 외 컬럼 변경을 차단
    (발행·도메인·상태 변경은 서버의 service_role 경유)
  - `edit_requests`: SELECT + INSERT (신규는 `pending`, `credit_cost`는 고정 단가와 일치 강제)
- 관리자/서버: `service_role` (BYPASSRLS). 단, 금전 테이블 쓰기는 함수 경유만.

## TS 계약과 동기 유지

값을 바꾸면 반드시 함께 수정:

- 컬럼/체크 목록 ↔ `web/src/lib/types/domain.ts`
- 크레딧 단가·초기지급·만료일 ↔ `web/src/lib/credits/constants.ts`
  (SQL 쪽 하드코딩 위치: `handle_build_fee_payment`의 1/3·180일,
  `handle_credit_pack_payment`·`refund_credits`의 365일,
  `edit_requests_insert_own` 정책의 단가 case)
