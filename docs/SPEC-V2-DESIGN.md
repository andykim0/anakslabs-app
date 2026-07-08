# 아낙스랩스 스펙 개정 v2 — 애드온 설계서

> **성격**: 설계 문서 (구현 금지 상태에서 작성됨). 구현 담당(Opus 4.8 세션)은 이 문서의 각 항목을
> 우선순위 순서대로 구현한다. 각 절의 "SPEC 병합 텍스트"는 `docs/SPEC.md`에 그대로 붙일 수 있는 형태다.
> **범위 제외**: SEO/AEO (별도 개정에서 다룸).
> **근거 코드 기준**: 2026-07-08 main (`surveySchema`=schemas.ts:198, sites DDL=0001_init.sql:35,
> 온보딩 위저드 3스텝, SectionCopy 6키, SectionType 10종, 크레딧 RPC 규약).

---

## 0. 총괄

### 0.1 우선순위

| 페이즈 | 항목 | 이유 |
|---|---|---|
| **P0** (문서·정책, 반나절) | §1 포지셔닝 · §4 크레딧 법적 주석 · §8 약관 조항 · §3 환불 정책 문구 | 코드 거의 없음, 계약 전 리스크 차단 |
| **P1** (핵심 기능, 각 1~2일) | §5 HTML Export 엔진 · §3 무료 재생성 · §6 법적 필수요소 · §7 서베이 확장 | 고객 경험/전환에 직결 |
| **P2** (데이터 축적 후) | §2 QA 자동화 (스키마는 P1에 선반영, 자동 전환 활성화는 승인률 데이터 축적 후) | 임계치 판단에 실데이터 필요 |

### 0.2 계약 파일 변경 목록 (Architect 승인 항목 — 구현 첫 단계에서 일괄 반영)

| 파일 | 변경 | 사유 |
|---|---|---|
| `lib/types/domain.ts` | `SurveyInput` 확장(§7), `Site`에 export/재생성 필드(§3·5), `EditRequest.isInitialRevision`(§3), `Client.businessInfo`(§6) | 데이터 모델 |
| `lib/data/types.ts` | `SitesRepo`/`EditRequestsRepo` 시그니처 소폭 확장, `ExportService` 신설(§5) | 인터페이스 |
| `lib/credits/constants.ts` | 환불 정책 상수(§3), 만료 고지 시점 상수(§4) | 정책 단일 소스 |
| **`SectionType` 변경 없음** | 예약/오시는길 등 신규 페이지는 기존 타입 매핑(§7.3)으로 흡수 | 에디터·렌더러 영향 0 |

### 0.3 마이그레이션 계획

신규 파일 `supabase/migrations/0002_spec_v2.sql` 하나에 통합:

```sql
-- §3 최초 결과물 안전장치
alter table sites add column free_regens_used int not null default 0;
alter table edit_requests add column is_initial_revision boolean not null default false;
alter table payments add column refunded_at timestamptz;
alter table payments add column refund_amount numeric;          -- numeric 불변식 준수

-- §5 Export
alter table sites add column export_status text
  check (export_status in ('none','processing','ready','failed')) default 'none';
alter table sites add column export_requested_at timestamptz;
alter table sites add column export_url text;                    -- Storage signed URL 아님: object path 저장
alter table clients add column cancel_requested_at timestamptz;  -- 해지 요청 시각

-- §6 법적 필수요소
alter table clients add column business_info jsonb;              -- BusinessInfo 형태(아래)

-- §2 QA 자동화 (스키마만 선반영)
alter table edit_requests add column auto_approved boolean not null default false;
alter table edit_requests add column reviewed_at timestamptz;
alter table edit_requests add column qa_note text;
create table qa_automation_rules (
  edit_type text primary key check (edit_type in ('text','image','video','structure')),
  enabled boolean not null default false,
  approval_threshold numeric not null default 0.98,
  min_samples int not null default 30,
  sample_audit_rate numeric not null default 0.10,
  updated_at timestamptz not null default now()
);
```

RLS: 신규 컬럼은 기존 정책 상속. `qa_automation_rules`는 service_role 전용.
`sites` 보호컬럼 트리거에 `export_*`, `free_regens_used` 추가(고객 직접 UPDATE 차단 — 서버 경유만).

---

## 1. 차별화 포인트 (포지셔닝)

**코드 변경 없음. SPEC 문서 + 랜딩 카피 백로그.**

### ▶ SPEC 병합 위치: 1장과 2장 사이, 새 "1.5 포지셔닝" 절

```markdown
## 1.5 포지셔닝 — 우리는 빌더가 아니라 "디지털 외주 대체재"다

아임웹·식스샵(50만~200만원+월 1~5만원), Wix/Durable 등 AI 빌더는 이미 비슷한 가격대에 존재한다.
아낙스랩스의 포지션은 "더 싼 빌더"가 아니라 **"고객이 아무것도 만지지 않는 완전 풀서비스"**다.

**타겟 고객 (좁힘)**: 셀프서브 도구를 배울 시간·의지가 없는 비개발자 소상공인.
오프라인 실체가 있는 업종 우선 — 요식(화로구이·카페·베이커리), 뷰티(미용실·네일·피부),
생활서비스(세탁·수선·청소), 의원·한의원, 학원, 부동산. 공통점: ① 웹사이트가 없거나
네이버 플레이스/블로그가 전부 ② 에이전시 견적(400만원+)에 좌절한 경험 ③ "알아서 해달라"가 니즈.

**풀서비스 vs 셀프서브 — 결정적 차이**

| | 셀프서브 빌더 (아임웹/Wix) | 아낙스랩스 |
|---|---|---|
| 첫 결과물 | 고객이 템플릿 골라서 직접 조립 | 설문 10분 → AI가 3안 제시 → 완성본 수령 |
| 수정 | 고객이 도구를 배워서 직접 | 요청만 하면 AI+QA가 처리 (크레딧) |
| 디자인 품질 | 템플릿 티 (같은 템플릿 수천 개) | 사이트별 생성 테마 (팔레트·타이포 조합이 매번 다름) |
| 호스팅·도메인·SSL | 고객이 설정 | 전부 포함, 즉시 라이브 |
| 고객이 배워야 할 것 | 빌더 사용법 | 없음 (선택: PPT식 에디터) |

**우리가 하는 것 / 안 하는 것**

- 하는 것: 완성형 원페이지~소규모 사이트, 호스팅·도메인 연결, 크레딧 기반 유지보수, 카피·이미지 AI 생성
- 안 하는 것: 쇼핑몰/결제 기능(식스샵 영역), 대규모 다국어 사이트, 커뮤니티/게시판, 고객 직접 코드 수정
```

### 구현 체크리스트
- [ ] SPEC 1.5 삽입
- [ ] 랜딩(`app/page.tsx`) 히어로 카피를 포지셔닝에 맞게 갱신 — "고객이 아무것도 만지지 않는" 강조 (P2)

---

## 2. QA 자동화 로드맵

### ▶ SPEC 병합 위치 ①: 2장 인프라 원가표에 행 추가

```markdown
| QA 인건비 (변동비) | 편집 요청 1건당 0.5~2분 검수 × 시급 환산 ≈ 건당 200~800원.
고객 수·편집량에 **비례 증가** — "한계원가 ~0" 주장의 유일한 예외이며, 아래 QA 자동화 로드맵으로 상쇄한다. |
```

### ▶ SPEC 병합 위치 ②: 5장 뒤 새 "5.1 QA 자동화 로드맵" 절

```markdown
## 5.1 QA 자동화 로드맵

**원칙**: 사람 QA는 초기 신뢰 구축 장치이지 영구 비용이 아니다. 편집 유형별 승인률이
임계치를 넘으면 해당 유형을 자동 승인으로 전환하고, 표본 감사로 품질을 유지한다.

**자동 전환 규칙** (`qa_automation_rules` 테이블, 유형별):
- 최근 50건 중 표본 최소 30건 이상 && 승인률(무수정 승인 비율) ≥ 98% → 관리자 대시보드에 "자동화 가능" 알림
- 전환은 관리자가 토글로 명시 활성화 (자동 활성화 금지 — 사람이 결정)
- 자동 승인된 건 중 10%를 무작위 표본 감사 큐에 적재. 표본 감사에서 반려 2건 연속 발생 시 해당 유형 자동화 즉시 해제
- 영상(video)은 원가가 높아 자동화 대상 제외 (항상 사람 QA)

**플로우 변경**: 편집 요청 생성 시 규칙 조회 → enabled면 status를 qa_review 대신
`applied`로 직행(+auto_approved=true), 10% 확률로 감사 플래그.
```

### ▶ SPEC 병합 위치 ③: 8장 MVP 우선순위에 "9. QA 자동화 임계치 모니터링 대시보드" 추가

### 설계 상세 (구현자용)

- **데이터**: 0002 마이그레이션의 `edit_requests.auto_approved/reviewed_at/qa_note` + `qa_automation_rules`
- **승인률 집계**: SQL 뷰 `qa_approval_stats` — `edit_type`별 최근 50건의 `applied`(무수정) 비율. 관리자 API `GET /api/admin/qa-stats`가 뷰 조회
- **관리자 UI**: `/admin/qa`에 유형별 게이지 4개(승인률/표본수/임계 도달 여부) + 자동화 토글. 토글은 `POST /api/admin/qa-rules` (service_role로 rules 갱신)
- **편집 파이프라인 수정점**: `app/api/edit-requests/route.ts`의 상태 전이 한 곳 — rules 조회 → 분기. mock 모드는 rules를 인메모리로
- **수용 기준**: 자동화 OFF 상태에서 기존 플로우와 100% 동일 동작(회귀 없음). ON 시 auto_approved 건이 QA 큐에 안 뜨고 감사 큐(별도 필터)에 10%만 노출

---

## 3. 최초 결과물 컨펌/안전장치

### ▶ SPEC 병합 위치 ①: 5장 편집 플로우 앞, 새 "4.6 최초 결과물 컨펌 단계" 절

```markdown
## 4.6 최초 결과물 컨펌 단계 (환불·이탈 방지 안전장치)

결제 후 첫 결과물이 기대와 다를 때 초기 크레딧(1~3개)만으로는 재작업이 부족하다.
두 겹의 안전장치를 둔다:

1. **온보딩 무료 재생성 1회**: 2차 가공(에디터) 진입 전, 생성 결과 화면에서
   "마음에 안 들어요 — 다시 생성" 1회 무료 제공. 크레딧 차감 없음.
   같은 설문으로 후보 3안부터 다시 뽑거나(설문 수정 허용), 같은 후보로 재생성 중 선택.
   `sites.free_regens_used`로 횟수 관리 (한도 1).
2. **최초 발행 후 7일 무료 수정권 1회**: 사이트당 최초 발행 후 7일 내 첫 편집 요청 1건은
   크레딧을 차감하지 않는다 (`edit_requests.is_initial_revision = true`, 원장 기록 없음).
   영상(video) 유형은 제외 (원가 사유).
```

### ▶ SPEC 병합 위치 ②: 6장 결제 로직에 환불 정책 표 추가

```markdown
**빌드비 환불 정책** *(시행 전 법률 검토 필요 — 전자상거래법 청약철회 규정 대조)*

| 시점 | 환불률 | 비고 |
|---|---|---|
| 결제 후 7일 이내 && 사이트 미발행 | 100% | 전자상거래법 청약철회 준용 |
| 발행 후 14일 이내 | 50% | 제작 용역 기제공분 공제 |
| 발행 후 14일 초과 | 환불 불가 | 약관 명시 + 결제 전 고지 필수 |

환불 시 초기 지급 크레딧은 미사용분에 한해 회수(`admin_adjust` 음수 원장).
환불 기록은 payments.refunded_at / refund_amount (numeric).
```

### 설계 상세 (구현자용)

- **재생성 API**: `POST /api/onboarding/regenerate { siteId, survey? }` — 소유권 검증 → `free_regens_used < 1` 확인(초과 시 409 `REGEN_LIMIT`) → 설문이 오면 sites.survey 갱신 → `generateCandidates` 재실행 후 후보 단계로 복귀, 또는 body에 `candidate` 포함 시 `generateSiteConfig`로 draft 교체 → `free_regens_used + 1`. **주의**: 카운터 증가는 생성 성공 후(AI 실패 시 무료 기회 소진 금지)
- **무료 수정권 판정**: edit-requests 라우트에서 (① 해당 site의 edit_requests가 0건 ② `published_at`이 있고 now < published_at+7일 ③ type ≠ video) 전부 참이면 `credits.consume` 스킵 + `is_initial_revision=true`. 원장에 0원 기록도 남기지 않음(원장은 실변동만 — 불변식 유지)
- **UI**: 생성 완료 화면(generate-step)에 재생성 버튼 + 남은 무료 횟수. 에디터/크레딧 페이지 편집 폼에 "첫 수정 무료" 배지 조건부 노출
- **환불 처리**: 관리자 수동(`POST /api/admin/payments/[id]/refund { amount }`) — PG 환불 API 호출은 실모드 TODO 주석, mock은 기록만. 크레딧 회수 로직 포함
- **수용 기준**: 재생성 2회째 409 / 무료 수정권은 사이트당 정확히 1회 / video는 무료 대상 제외 / 환불 시 payments·원장 정합

---

## 4. 크레딧 유효기간 법적 검토

**코드 변경 최소 (만료 임박 고지 크론 1개). 주로 SPEC 문구.**

### ▶ SPEC 병합 위치: 4.4절 전면 개정

```markdown
### 4.4 만료 정책 ⚠️ 시행 전 법률 검토 필요

**법적 성격 정의 (약관에 명시)**: 크레딧은 "편집 용역 이용권"이다 — 현금성 충전금이 아니며
양도·현금 환급 대상이 아님을 약관에 명확히 정의한다. 다만 무기명 선불전자지급수단으로
해석될 리스크(전자금융거래법)와, 유상 구매분에 대한 소비자분쟁해결기준(포인트 잔여가치)
적용 가능성이 있으므로 시행 전 변호사 검토를 필수로 한다.

**만료 기간** (기존 유지하되 고지 의무 추가):
- 초기 지급 180일 / 구매 365일 (lot 단위, FIFO 소진 — 기존 구현 유지)
- **만료 30일 전 고지 의무**: 이메일/알림톡으로 잔여 크레딧·만료일 고지 (공정위 표준약관 준용)
- 구매 크레딧은 **구매 후 7일 내 미사용 시 청약철회(전액 환불) 허용**

**만료 시 처리 — 소멸 단독이 아닌 선택지 병기** (법률 검토 결과에 따라 택1):
- A안(기본): 만료 소멸 + 30일 전 고지 (현행)
- B안(보수적): 만료 시 자동 1회 90일 연장 후 소멸
- C안(최보수): 유상 구매분에 한해 만료 시 잔여가치 90% 환급

구현은 A안으로 하되, B/C 전환이 가능하도록 만료 크론과 원장 구조(lot 단위)를 유지한다.
```

### 설계 상세 (구현자용)

- **만료 임박 고지 크론**: `/api/cron/expire-credits` 확장 또는 별도 `/api/cron/expiry-notice` — 30일 내 만료 lot 보유 고객 조회 → 알림 발송(알림 인프라 없으므로 v2에서는 `notifications` 콘솔 로그 + 대시보드 배너로 대체, 이메일은 TODO). **대시보드 배너는 이미 크레딧 페이지에 만료 임박 표시가 있으므로 그 로직 재사용**
- **청약철회**: §3 환불 API 재사용(대상: credit_pack, 조건: 7일 내 && 해당 lot 소진 0)
- **수용 기준**: 크레딧 페이지에 만료 30일 내 lot 경고 노출 / 약관 문구 docs/legal 반영

---

## 5. 해지 시 마이그레이션/백업 (정적 HTML Export) — 본 개정의 핵심 기능

### ▶ SPEC 병합 위치 ①: 새 "9장 사이트 이관·백업 (정적 Export)" 장

```markdown
## 9. 사이트 이관·백업 (정적 Export)

**목적**: 해지 시 사이트가 사라진다는 lock-in 불안을 제거한다. 계약 전 반대 사유 1순위 대응.

**제공 시점** (셋 다):
1. 고객이 구독 해지를 요청할 때 — 해지 플로우 안에서 "내 사이트 HTML로 받기" 제공
2. 유예기간(7일) 만료로 suspended 확정 시 — 자동 생성 후 다운로드 링크 통보
3. 관리자 수동 트리거 (분쟁·CS 대응)

**산출물 정의** (약관 §11과 동일 문구 유지):
- `index.html` + `assets/` (이미지·영상·셀프호스트 폰트) 를 담은 zip 1개
- 발행 시점의 발행본(site_config)을 재현. 반응형(데스크톱+모바일) 포함
- 어떤 웹호스팅에도 업로드 즉시 동작 — 아낙스랩스 인프라 의존 0
- **폼·예약·CMS 등 당사 백엔드 의존 동적 기능은 미작동** (약관 고지, 하자 아님)

**보관**: export zip은 생성 후 30일 보관(서명 URL 7일 단위 재발급). 해지 고객의
사이트 데이터(site_config·자산)는 해지 확정 후 90일 보관 후 삭제 — 그 안에는 재생성 가능.
```

### ▶ SPEC 병합 위치 ②: 7장 대시보드 고객용에 "해지 예정/해지 시 정적 HTML 백업 다운로드" 추가, 6장 해지 로직에 "유예 만료 시 자동 export + 통보" 한 줄 추가

### 아키텍처 (구현자용 — 이 절이 구현 명세다)

**신규 모듈** `web/src/lib/export/` (데이터 계층 소유 구역):

```
lib/export/
├── exporter.ts        # 오케스트레이터: exportSite(siteId) → { zipPath }
├── render-static.ts   # SiteRenderer → 완전한 HTML 문서 문자열
├── collect-assets.ts  # site_config 순회 → 자산 URL 수집·재작성
├── self-host-fonts.ts # Google Fonts/Pretendard CSS+woff2 다운로드
└── zip.ts             # 디렉토리 → zip 버퍼
```

1. **render-static.ts** — `renderToStaticMarkup(<SiteRenderer config={published} mode="auto" interactive />)`
   (react-dom/server, 이미 순수 서버 컴포넌트라 그대로 직렬화 가능 — 검증 하네스에서 기실증).
   문서 셸 래핑: `<!doctype html>` + `<head>`(meta.title/description/ogImage, viewport, 폰트 링크
   또는 셀프호스트 `@font-face` CSS) + 베이스 CSS(렌더러가 주입하는 BASE_CSS + scoped customCss를
   `<style>`로 인라인). Tailwind 클래스(`hidden md:block`/`md:hidden`)는 렌더러가 auto 모드 전환에
   사용하므로 **해당 2클래스만 미니 CSS로 인라인** (Tailwind 전체 불필요):
   `@media(min-width:768px){.md\:block{display:block}.md\:hidden{display:none}} .hidden{display:none}` 등
2. **collect-assets.ts** — 순회 대상: `ImageElement.src`, `VideoElement.src/poster`,
   `SectionBackground.image.src`, `meta.ogImage`. http(s) URL만 다운로드(safeMediaSrc 화이트리스트
   재사용), `assets/<sha1-8>.<ext>`로 저장하고 config 사본의 src를 상대경로로 재작성한 뒤 렌더.
   실패 자산은 원본 URL 유지 + 결과 리포트에 경고
3. **self-host-fonts.ts** — 기본은 CDN 링크 유지(간단·안전). `selfHostFonts: true` 옵션 시:
   기존 `site-renderer/fonts.ts`의 `googleFontUrls()` 결과 CSS를 UA(woff2) 헤더로 fetch →
   CSS 내 폰트 URL 다운로드 → `assets/fonts/` + url() 재작성. Pretendard는 jsDelivr CSS 동일 처리.
   **v2 기본값: 해지 export는 selfHostFonts=true** (우리 의존 아니지만 완전 독립 보장)
4. **zip.ts** — 의존성 `archiver`(신규, package.json 보고 필요). Vercel Node 런타임 필요:
   route에 `export const runtime = 'nodejs'`, `export const maxDuration = 60`
5. **저장·전달** — zip을 Supabase Storage 비공개 버킷 `exports/`에 업로드(`{siteId}/{ts}.zip`),
   `sites.export_url`에 object path 저장, 다운로드 시점에 signed URL(7일) 발급.
   mock 모드: zip을 만들되 Storage 대신 `/tmp` + 응답으로 직접 스트리밍

**API**:

| 메서드 | 경로 | 동작 |
|---|---|---|
| `POST` | `/api/sites/[siteId]/export` | 소유권 검증 → status 'processing' → 동기 생성(자산 수십 개, 60s 내) → 'ready' + path 저장. 실패 시 'failed' |
| `GET` | `/api/sites/[siteId]/export` | status 조회 + ready면 signed URL 반환 |
| `POST` | `/api/subscription/cancel` | `clients.cancel_requested_at` 기록 → export 자동 트리거 → 해지 안내 응답 |

**UI**: 사이트 상세(`site-detail.tsx`)에 "HTML 백업" 카드 — 버튼 → 진행 표시(폴링) → 다운로드.
해지 플로우(설정 페이지)에서 동일 컴포넌트 재사용 + "동적 기능 미작동" 고지 체크박스(§8 연계).

**수용 기준**:
- 화로담 발행본 export → zip 해제 → `python3 -m http.server`로 열었을 때 데스크톱/모바일 렌더 동일, 네트워크 탭에 외부 요청 0(셀프호스트 모드)
- 이미지 15장+ 사이트 60초 내 완료, 실패 자산 있어도 zip 생성은 성공(경고 포함)
- 미발행(draft) 사이트는 400 — 발행본만 export

---

## 6. 법적 필수요소 자동 삽입

### ▶ SPEC 병합 위치 ①: 2.1 온보딩 플로우에 사업자 정보 입력 추가

```markdown
- 온보딩 설문에 **사업자 정보 입력** 단계 추가: 상호(법인명), 대표자명, 사업자등록번호,
  사업장 주소, 연락처(전화·이메일), 통신판매업 신고번호(해당 시).
  설문 중에는 건너뛰기 허용, **발행(publish) 시 필수** — 미입력 시 발행 버튼에서 입력 유도.
  (사업자정보는 전자상거래법·정보통신망법상 표시 의무 — 없으면 "완제품"이 아니다)
```

### ▶ SPEC 병합 위치 ②: 새 "10장 법적 필수요소 자동 삽입" 장

```markdown
## 10. 법적 필수요소 자동 삽입

모든 발행 사이트에 자동 포함:
1. **사업자정보 푸터**: 상호·대표자·사업자등록번호·주소·연락처를 사이트 최하단 밴드로 자동 렌더
   (테마 팔레트 상속, 디자인 훼손 최소화). 고객이 끌 수 없음(법적 의무).
2. **개인정보처리방침 / 이용약관 페이지**: `xxx.anakslabs.com/privacy`, `/terms` 자동 생성 —
   표준 템플릿에 사업자 정보·수집 항목을 변수 치환. AI 자유 생성이 아닌 **고정 템플릿**
   (법적 문서의 환각 리스크 차단). Premium 폼/예약 기능 사용 시 수집 항목 자동 반영.
   푸터에 두 페이지 링크 자동 삽입.
```

### 설계 상세 (구현자용)

- **데이터**: `clients.business_info jsonb` — `{ legalName, representative, bizRegNo, address, phone, email, ecommerceRegNo? }`. TS 타입 `BusinessInfo`를 domain.ts에 추가(계약). 사이트별 상이 케이스는 v3로 미룸(고객당 1사업자 가정)
- **핵심 설계 결정 — SiteConfig 계약 불변**: 푸터는 config에 넣지 않는다. `/s/[domain]/page.tsx`가 이미 site row를 로드하므로 client의 business_info를 함께 조회해 `<LegalFooter info theme />`(site-renderer 신규 컴포넌트)를 SiteRenderer 아래에 렌더. **export(§5)도 동일하게 포함**. 에디터 캔버스에는 미표시(편집 불가 영역), 대신 에디터 하단에 "발행 시 사업자정보 푸터가 자동 추가됩니다" 안내
- **법무 페이지 라우트**: `app/s/[domain]/privacy/page.tsx`, `terms/page.tsx` — 템플릿은 `lib/legal/templates.ts`(순수 문자열 함수, 변수 치환). proxy.ts rewrite는 catch-all이 이미 처리(확인 필요: `/s/[domain]/[...path]` 존재 — privacy/terms 전용 라우트가 우선 매칭되도록 배치)
- **발행 게이트**: `publish` 라우트에서 business_info 부재 시 409 `BUSINESS_INFO_REQUIRED` → 대시보드가 입력 모달 표시 후 재시도. 설정 페이지에도 상시 편집 폼(`PATCH /api/me/business-info`)
- **설문 연계(§7)**: 설문 마지막 스텝에 선택 입력, 저장 시 clients로
- **수용 기준**: business_info 입력 → 발행 → `/s/{domain}`에 푸터+링크, privacy/terms 200 / 미입력 발행 시도 409 / export zip에도 privacy.html·terms.html 포함

---

## 7. 서베이(설문) 확장

### ▶ SPEC 병합 위치: 부록 B 온보딩 플로우의 "설문" 정의 개정

```markdown
**설문 구성 (4그룹 아코디언, 1스텝 유지)**

① **아이덴티티**: 상호명 · 태그라인(선택) · 컨셉 모드("실제 매장 정보로" vs
   "가상 컨셉으로 만들어주세요 — AI가 그럴듯하게 창작") · 로고/브랜드 자산 업로드(이미지 드롭,
   선택 — 없으면 AI가 텍스트 로고타입으로 처리) · 사업자 정보(선택 입력, §10 연계)
② **스타일**: 톤 칩 · 선호 컬러 · 레퍼런스 이미지 (기존 유지)
③ **페이지 구성**: 섹션 멀티 선택 — **업종 입력 시 추천 섹션이 업종별로 다르게 하이라이트**
   (design-knowledge 랜딩 패턴 기반). 예: 요식업 → 메뉴·예약 CTA 추천 / 세탁소 → 요금·수거신청 추천.
   "예약" 선택 시 방식 질문: 네이버예약/캐치테이블 링크 삽입 vs 단순 "예약 문의" CTA.
④ **콘텐츠 소스**: "AI가 그럴듯한 카피·메뉴를 채워주세요 (나중에 교체)" vs
   "실제 내용은 내가 제공 (플레이스홀더 최소화)" — 후자는 자유 텍스트 입력란 노출.
```

### 설계 상세 (구현자용)

- **SurveyInput 확장** (계약 — domain.ts):

```ts
// 추가 필드 (전부 optional — 기존 mock/시드/테스트 무파손)
tagline?: string;
conceptMode?: 'real' | 'fictional';          // 기본 'real'
logoUrl?: string;
contentMode?: 'ai' | 'provided';             // 기본 'ai'
providedContent?: string;                     // contentMode='provided' 시 원문
reservationMode?: 'external_link' | 'cta';   // 예약 섹션 선택 시
reservationUrl?: string;
businessInfo?: BusinessInfo;                  // §6 연계
```

- **zod(schemas.ts)**: 위 필드 optional로 확장. logoUrl은 safeMediaSrc 검증
- **SectionType 불변 원칙**: "예약"은 `cta`(라벨: 예약), "오시는길/영업시간"은 `contact`, "프라이빗/단체석"은 `custom`으로 매핑 — UI 라벨만 다르게, 계약·에디터·렌더러 무변경. 매핑 테이블은 survey-step 상수
- **추천 섹션 API**: 신규 불필요 — `design-knowledge`는 클라이언트 번들 가능한 순수 데이터이므로 survey-step이 `findPattern`/키워드 매칭을 직접 import (server-only 아님 확인 필요: design-knowledge.ts에 server-only 없으면 그대로, 있으면 경량 추천 함수만 분리)
- **로고 업로드**: `POST /api/uploads` (multipart, 5MB 제한, png/jpg/webp/svg) → Storage `client-assets` 공개 버킷 → URL. mock: data URL 그대로 저장(5MB 제한 동일). **SVG는 sanitize 필수**(스크립트 제거 — 저장형 XSS 벡터)
- **생성 파이프라인 반영**: `refineCandidateTexts`/`generateSectionCopy` 프롬프트에 tagline·conceptMode·contentMode·providedContent 전달. contentMode='provided'면 카피 프롬프트가 "창작 금지, 아래 원문을 다듬기만" 지시. 로고는 hero 섹션에 ImageElement로 배치(site-templates 확장)
- **수용 기준**: 기존 설문(신 필드 없음)으로도 온보딩 전체 통과(하위호환) / 로고 업로드 → 히어로 반영 / 업종 "카페" 입력 시 추천 배지 변화 확인

---

## 8. 구독 취소·소유권 약관 조항

**코드 변경 없음(§5가 기술 구현). 약관 문서 + 고지 UI 3곳.**

### ▶ SPEC 병합 위치: 새 "11장 약관 핵심 조항 (초안)" 장 — 아래 조문 그대로 수록

```markdown
## 11. 약관 핵심 조항 (초안 — 시행 전 변호사 검토 필수)

### 제○조 (지식재산권 및 소유권)
① 고객이 제공하거나 이용 과정에서 생성한 콘텐츠(텍스트·이미지·영상·로고 등)의 소유권은 고객에게 있다.
② 계약 종료 시 당사가 제공하는 정적 산출물(HTML·CSS·이미지 등 자산 번들)의 사용·소유권은 고객에게 귀속된다.
③ 단, 사이트를 구동하는 플랫폼, 소스코드, 렌더링 엔진, 사이트 설정 데이터 구조 및 백엔드 시스템 일체의
   지식재산권은 당사에 있으며, 본 계약의 어떤 조항도 이를 고객에게 이전하는 것으로 해석되지 아니한다.

### 제○조 (계약 종료 및 사이트 이관)
① 계약 종료 시 고객의 요청이 있으면 당사는 발행된 사이트를 정적 번들(index.html + 자산 폴더)
   형태로 제공한다. (기술 명세는 9장 산출물 정의를 따른다)
② 정적 산출물은 발행 시점의 디자인·레이아웃·콘텐츠를 재현하며, 고객은 이를 임의의 웹호스팅에
   업로드해 독립적으로 운영할 수 있다.
③ 다만 폼 전송·예약·CMS·결제 등 당사 서버·백엔드에 의존하는 동적 기능은 정적 산출물에서
   작동하지 아니한다. 고객은 이를 사전에 인지·동의하며, 해당 기능의 미작동은 하자 또는
   계약 위반에 해당하지 아니한다.

### 고지 시점 (약관규제법 §3 명시·설명의무 — 3중 고지)
| 시점 | 방법 |
|---|---|
| 상품 설명/견적 단계 | 랜딩·요금 안내에 "Premium 동적 기능은 당사 호스팅 전용" 문구 |
| 결제 직전 | 체크박스 동의 (③항 요지) — 미체크 시 결제 진행 불가 |
| 해지 플로우 | export 다운로드 화면에서 재고지 |
```

### 설계 상세 (구현자용)
- 약관 전문 파일 위치: `docs/legal/terms-draft.md` (11장 조문 + 나머지 표준 조항 스캐폴드)
- 고지 UI 3곳: ① 랜딩 요금 카드 각주 ② mock 결제 확인 모달에 체크박스(실모드 토스 결제창 앞 단계) ③ §5 export 화면 고지 — 전부 동일 문구 상수(`lib/legal/notices.ts`)에서 가져와 표기 일관성 보장
- **수용 기준**: 결제 플로우에서 체크 없이는 진행 불가 / 세 지점 문구 동일

---

## 부록 — 구현 세션 착수 순서 (권장)

1. **계약 일괄 반영** (0.2 목록 — domain.ts/types.ts/constants.ts/zod) + `0002_spec_v2.sql` + mock 시드 정합
2. **P0**: SPEC.md에 §1·4·8 병합(문서), 환불 정책 상수/문구, docs/legal 초안, 고지 UI 3곳
3. **P1-a**: §5 Export 엔진 (가장 크고 독립적 — 병렬 착수 가능)
4. **P1-b**: §3 재생성+무료수정권 → §6 법적 필수요소 → §7 서베이 확장 (셋은 온보딩 파일을 공유하므로 순차)
5. **P2**: §2 QA 자동화 UI/파이프라인 (스키마는 1에서 이미 반영)
6. 매 단계: `tsc --noEmit` + `next build` + mock 온보딩 E2E + (실키 있으면) 라이브 스모크

**회귀 가드**: SurveyInput/Site 확장 필드는 전부 optional — 기존 화로담 시드·zod strict·에디터 자동저장이 무수정 통과해야 한다. Export와 LegalFooter는 SiteConfig 계약을 건드리지 않는다(핵심 설계 결정).
