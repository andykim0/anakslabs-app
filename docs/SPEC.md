# 아낙스랩스 — 웹사이트 End-to-End 제작 + 호스팅 SaaS 스펙

> 원본 빌드 스펙 (2026-07-08 확정). 아키텍처 확정 사항은 하단 부록 A 참조.

## 1. 프로젝트 개요

아낙스랩스(Anaks Labs)의 웹사이트 제작 SaaS는 AI로 고객 니치에 맞춘 웹사이트를 자동 생성하고, 자체 인프라에 호스팅하며, 월 유지보수 구독과 편집 크레딧으로 수익을 내는 서비스다. 목표는 소상공인/소규모 사업자에게 기존 에이전시(평균 430만~800만원) 대비 5분의 1 이하 가격에 웹사이트를 제공하면서, 낮은 한계원가 구조(인프라 고정비 + AI API 변동비)로 높은 마진을 유지하는 것.

핵심 제품 두 티어:
- **Basic**: 이미지 전용, 정적 사이트, 39만~59만원(1회) + 월 19,000~29,000원(유지보수)
- **Premium**: 영상/애니메이션 포함, 동적 사이트(폼/CMS), 89만~149만원(1회) + 월 39,000~59,000원(유지보수)

## 2. 기술 스택 & 아키텍처

- **호스팅/프론트엔드**: Vercel (단일 팀 계정, 동적 라우팅 기반 멀티테넌트 앱). Pro 플랜($20/월).
- **도메인/SSL**: 두 경로 구분.
  1. **기본 서브도메인** (`xxx.anakslabs.com`): 자체 존 와일드카드 — 무료.
  2. **고객 소유 커스텀 도메인** (`xxx.com`): Cloudflare for SaaS **Custom Hostnames**. 100개까지 무료, 이후 $0.10/호스트네임/월.
- **백엔드/DB**: Supabase 단일 Pro 프로젝트($25/월) 멀티테넌트. 모든 데이터 `client_id` 구분 + RLS 격리.
- **인증**: Supabase Auth. OAuth = **카카오(1순위)**, **구글**. 이메일/비번은 백업. MAU 10만까지 무료 → 인증 한계원가 0.
- **AI 생성 API**:
  - 이미지: Nano Banana (Gemini 2.5 Flash Image), $0.039/장 (배치 $0.0195/장)
  - 카피/텍스트: GLM 계열 LLM
  - 영상/애니메이션: Veo 3.1 API, $0.15~0.40/초 (8초 클립 약 1,700~4,500원)
- **결제**: 국내 PG(토스페이먼츠 등) — 1회 빌드비 / 월 구독 / 크레딧 팩 세 타입.

### 인프라 원가 (고객 100명까지 거의 고정): Vercel $20 + Cloudflare $0 + Supabase $25 ≈ 월 63,000원

### 2.1 인증 연동 상세

- 카카오: 카카오 디벨로퍼스 앱 등록 → REST API 키/Secret → Supabase Providers > Kakao → Redirect URI = Supabase 콜백. **기본/1순위 로그인**.
- 구글: GCP OAuth 클라이언트 → Supabase Providers > Google.
- (2차 백로그) 네이버 로그인, 이메일 매직링크.
- `auth.users` = 최종 고객(사업자)만. 내부 운영진은 별도 role 클레임/관리자 계정으로 구분.
- 온보딩: 빌드비 결제 → 소셜 로그인 계정 생성 → `clients` row ↔ `auth.users.id` 연결 → 초기 크레딧(Basic 1 / Premium 3) 지급까지 하나의 트랜잭션.

### 2.2 커스텀 도메인 연결 플로우

기본값은 `xxx.anakslabs.com` 즉시 라이브. 고객 도메인 연결 시:

1. 대시보드에서 "내 도메인 연결" → 도메인 입력 (권장 `www.xxx.com`)
2. 백엔드가 Cloudflare for SaaS API(`POST /zones/:zone_id/custom_hostnames`) 등록 → 검증용 CNAME/TXT 수신
3. 고객에게 DNS 레코드 추가 스텝별 가이드 표시 (CNAME 권장, apex는 flattening/ALIAS 또는 A레코드/리다이렉트 우회)
4. DNS 전파 후 Cloudflare가 SSL(DV) 자동 발급 → `active`
5. fallback origin으로 기존 멀티테넌트 앱 라우팅
6. 완료 시 `sites.domain_type='custom'`, `dns_verified=true` + 알림(이메일/카카오 알림톡)
7. 전파 최대 24~48h — 대시보드에 진행 상태(대기중/검증중/완료) 실시간 표시

**과금**: 연결 자체는 무료 포함. DNS 대행만 1회 옵션(1만~2만원 또는 크레딧 1개).

## 3. 데이터 모델 (Supabase)

핵심 테이블: `clients`(auth.users 1:1, tier basic/premium, status), `sites`(domain, domain_type subdomain/custom, dns_verified, cloudflare_hostname_id, vercel_project_id, status building/live/pending_dns/suspended, **site_config jsonb**), `credit_balances`(캐시 잔액), `credit_ledger`(지급/차감 원장 — 잔액의 source of truth), `edit_requests`(type text/image/video/structure, credit_cost, status pending/ai_processing/qa_review/applied/rejected, ai_output jsonb), `payments`(type build_fee/maintenance_subscription/credit_pack, credits_granted).

RLS: `client_id = auth.uid()` 기반. 관리자는 service role 우회. 정확한 DDL은 `supabase/migrations/` 참조.

## 4. 크레딧 시스템 (핵심 요구사항)

### 4.1 초기 지급
- Basic build_fee 결제 완료 → `+1` (`reason='initial_grant'`) / Premium → `+3`. 결제 웹훅에서 자동, 수동 개입 없음.

### 4.2 소모 가중치
| 유형 | 크레딧 | 근거 |
|---|---|---|
| 텍스트/카피 수정 | 1 | LLM 원가 ~0 |
| 이미지 교체/추가 | 1 | ~55원/장 |
| 영상 클립 교체/추가 | 3 | 1,700~4,500원/클립 |
| 구조 변경(섹션 추가 등) | 2 | 작업 시간 |

- Basic이 영상 편집 요청 → 크레딧 있어도 **업셀 안내 먼저**: "영상 편집은 Premium 전용. 크레딧 3개로 1회 추가 vs Premium 업그레이드?"
- 잔액 < 소모량 → 제출 차단 + 크레딧 구매 유도.

### 4.3 크레딧 팩
1개 15,000원 / 5개 65,000원(13%↓) / 10개 120,000원(20%↓). 구매 즉시 원장 반영.

### 4.4 만료
- 초기 지급분 180일, 구매분 365일. 매일 cron이 만료분 `-amount` 상쇄 기록(`reason='expired'`).

### 4.5 유지보수 구독
- 구독료 = 호스팅·인프라 관리비, 크레딧과 별개. 결제 실패 시 사이트 `suspended` + 유예 7일. (로열티 크레딧은 MVP 제외.)

## 5. 편집 요청 처리 플로우

1. 대시보드에서 편집 요청 제출(유형 + 내용)
2. `credit_cost` 계산 → 잔액 확인 → 부족 시 구매 유도, 충분하면 선차감(hold) → `ai_processing`
3. 유형별 AI 호출: text→GLM, image→Nano Banana, video→Veo3
4. 결과를 `ai_output` 저장 → `qa_review` (초기엔 사람 QA 필수)
5. 승인 → 배포 트리거(재빌드/ISR 무효화) → `applied`
6. 반려 → 크레딧 환불(`reason='refund'`) + 재요청 안내

## 6. 결제/과금

| 유형 | 시점 | 처리 |
|---|---|---|
| 빌드비(1회) | 계약 체결 | `build_fee` 기록 + 초기 크레딧 트리거 |
| 유지보수(월) | 정기결제 | 실패 시 `suspended` + 유예 7일 |
| 크레딧 팩 | 수시 | 즉시 반영 |

## 7. 대시보드

- **고객용**: 사이트 미리보기, 편집 요청 폼, 크레딧 잔액/내역/구매, 구독·결제 내역, 커스텀 도메인 연결 + DNS 검증 진행 상태.
- **관리자용**: 고객/사이트 현황, QA 큐, 크레딧 수동 조정, 인프라 사용량(Vercel 대역폭·Supabase·Cloudflare 호스트네임 수) — 100개 임박 알림.

## 8. MVP 우선순위

1. Supabase 스키마 + RLS
2. 카카오/구글 OAuth + 로그인 플로우
3. 결제 웹훅 → 계정 연결 → 크레딧 초기 지급
4. 고객 대시보드 (편집 요청 + 크레딧)
5. AI API 연동 (이미지 우선, 영상 2차)
6. 관리자 QA 큐
7. Cloudflare for SaaS 커스텀 도메인 프로비저닝 + 상태 대시보드
8. 크레딧 구매/만료 배치

---

# 부록 A — 확정 결정 (2026-07-08, 사용자 승인)

1. **사이트 모델 = 하이브리드**: AI가 섹션 구조(JSON) + 사이트별 커스텀 테마(폰트/팔레트/CSS)를 생성. 멀티테넌트 렌더러 1개로 서빙. (프리폼 HTML·순수 템플릿 방식 기각)
2. **에디터 = 자유배치 캔버스**: PPT처럼 요소 드래그·리사이즈·자유좌표 배치. 섹션 = 슬라이드 개념. 디자인 폭 1440 기준, 모바일은 y순 자동 스택(MVP).
3. **범위 = 전체 MVP 스캐폴드**, 외부 연동은 전부 mock 모드(키 없이 로컬 데모), 실키 주입 시 실연동.

## 부록 B — 로그인 후 고객 플로우 (제품 코어)

1. **설문**: 웹사이트 방향 설정 — 레퍼런스 이미지 업로드, 컬러, 톤, 사이트 목적, 서브 섹션 구성
2. **1차 가공**: AI 생성 디자인 후보(3D 렌더링 스타일 포함) 중 1개 선택
3. **2차 가공**: PPT처럼 이미지·텍스트를 자유롭게 편집 (캔버스 에디터)
4. **확정(Confirm)**
5. **호스팅**: `xxx.anakslabs.com` 즉시 라이브 (+ 선택: 커스텀 도메인 연결)

## 부록 C — 디자인 품질 기준 ($10K 사이트 8원칙)

생성 결과물(테마·목업 데이터·데모 사이트)은 다음을 지향: ① 뚜렷한 관점(스타일 방향성) ② 타이포그래피(Inter 등 과사용 폰트 금지, 개성 있는 페어링) ③ 절제된 컬러(5개 내외 팔레트) ④ 위계(크기 대비로 시선 유도) ⑤ 이미지 품질 ⑥ 모션(과하지 않은 마이크로 인터랙션) ⑦ 모바일 전용 설계 ⑧ 마감 디테일(빠르고 완성된 느낌). 카피는 형용사 아닌 절제("Six dishes, one fire" 스타일).
