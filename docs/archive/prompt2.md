# [Opus 마스터 프롬프트] Asset Provenance Launch Track

## “AI는 아트디렉션을 만들고, 고객이 제공한 실제 자산만 사실을 말한다”

> 이 문서 전체를 하나의 실행 프롬프트로 사용하라.
>
> 전략은 **B안: 런칭 임계 보호를 먼저 적용하고, 전면 마이그레이션은 fast-follow로 분리**다.
> 이 작업은 한 브랜치에서 끝내는 batch가 아니라, 사람 승인 게이트를 둔 3개 merge track이다.

---

## 0. 임무와 성공 기준

`/Users/axxykim/Desktop/anakslabs`에서 자산 출처(provenance)와 사실 슬롯 정책의 런칭 필수 범위를 구현하라.

이번 작업이 보장해야 하는 것은 다음 여섯 가지다.

1. `origin`은 서버가 실제 유입 경로에서만 기록하며 클라이언트가 주장할 수 없다.
2. 실제 제품·음식·매장·사람·포트폴리오·결과를 나타내는 factual 슬롯에는 적격 고객 자산만 들어간다.
3. 고객 실사 업로드가 없을 때 AI가 그 사업의 가짜 실사 사진을 생성하지 않는다.
4. AI 자산은 명백한 아트디렉션·무드·장식에만 사용하며 factual 자격을 절대 상속하지 않는다.
5. 기존 before/after 전용 계약을 보존하고, 기능은 법무 승인 전까지 기본 OFF로 둔다.
6. 기존 사이트와 레거시 이미지 경로는 feature flag로 격리하여 런칭 직전 대규모 회귀를 만들지 않는다.

핵심 제품 원칙:

> **AI는 아트디렉션을 만든다. 고객이 제공하고 확인한 서버 등록 자산만 실제 사업에 대한 사실을 확립한다.**

이 원칙은 프롬프트 문구가 아니라 타입, 서버 경계, assignment 정책, publish 감사, 테스트로 강제해야 한다.

---

## 1. 실행 규율

### 1.1 추측 금지

- 아래에 적힌 타입명·파일명·심볼은 목표 계약이다. 저장소의 실제 구조와 다르면 임의로 비슷한 코드를 새로 만들지 마라.
- 먼저 실제 심볼, 호출 경로, DB 스키마, feature flag 체계, 테스트 체계를 정찰하고 기존 구조에 화해(reconcile)하라.
- 동일 개념의 타입이나 레지스트리가 이미 있으면 중복 구현하지 말고 canonical 정의로 통합하라.
- 중대한 불일치, 선행 브랜치 미머지, 깨진 baseline을 발견하면 정확한 증거와 선택지를 보고하고 중단하라.

### 1.2 사용자 작업 보존

- dirty worktree와 untracked 파일은 사용자 소유다.
- 특히 아래 문서를 구현 커밋에 포함하지 마라.
  - `docs/asset-provenance-master-prompt.md`
  - `docs/asset-provenance-launch-master-prompt.md`
  - `docs/demo-sprint-profiles.md`
- 관련 없는 파일을 수정·삭제·포맷하지 마라.
- `git reset --hard`, 강제 checkout, 강제 push, 자동 stash, 사용자 파일 삭제를 금지한다.
- 커밋 전에는 반드시 staged diff와 포함 파일 목록을 확인하라.

### 1.3 자동 머지 금지

- 각 track은 별도 브랜치와 별도 리뷰 단위다.
- 사람 승인 게이트에 도달하면 보고 후 **반드시 멈춰라**.
- 명시적 승인 없이 다음 track 생성, main merge, production migration 적용, feature flag 활성화를 하지 마라.
- 이미 승인되어 다음 track을 재개하는 경우, 최신 main에서 선행 track이 실제로 merge됐는지 다시 확인하라.

### 1.4 품질 게이트

각 track 시작 전과 완료 전, 저장소의 실제 package manager와 스크립트를 확인한 뒤 다음과 동등한 전체 게이트를 실행하라.

```bash
npx tsc --noEmit
npm test
npm run build
```

- 저장소에 더 권위적인 명령이 있으면 그것을 사용하고 보고서에 실제 명령을 남겨라.
- 기존 실패가 있으면 작업 실패와 구분할 수 있도록 시작 전 baseline을 기록하라.
- 테스트를 삭제·skip·완화해서 green을 만들지 마라.
- 타입을 `any`, 무분별한 cast, non-null assertion으로 우회하지 마라.

---

## 2. Gate 0 — motion-signatures-v2 선행 조건

자산 provenance 작업을 시작하기 전에 `motion-signatures-v2`가 단순히 로컬 커밋된 상태가 아니라 **main에 실제로 merge된 상태**여야 한다.

다음을 증명하라.

1. 현재 저장소와 worktree 상태
2. 현재 main HEAD
3. `feature/motion-signatures-v2`의 tip 또는 해당 변경을 식별할 수 있는 commit
4. 그 commit이 main의 ancestor인지 여부
5. main에서 typecheck, test, build가 green인지 여부
6. motion 쪽에서 이미 도입한 provenance 타입·migration·before/after 계약·URL heuristic의 위치

판정 규칙:

- 선행 변경이 main에 없으면 **직접 merge하지 말고 중단 보고**하라.
- main baseline이 red면 provenance 구현을 시작하지 말고 실패 명령·로그·관련 파일을 보고하라.
- 선행 조건이 충족된 경우에만 Track 1로 들어간다.
- URL 패턴이나 URL 문자열로 upload/AI 출처를 추론하는 기존 heuristic은 호환·migration 힌트일 수는 있지만, factual eligibility의 권위적 근거가 될 수 없다.

---

## 3. 이번 런칭 범위와 명시적 비범위

### 3.1 런칭 전 반드시 구현

- canonical generic asset registry의 최소 계약
- upload/import/AI 유입 경로의 서버 권위적 origin stamping
- 기존 URL 계약과 공존하는 additive dual-write 또는 adapter
- factual/atmospheric/decorative 슬롯 정책
- 고객 실사 방향은 업로드 필수
- 업로드 없는 photoreal AI 생성 경로 제거
- AI 자산의 factual assignment 차단
- 신규 v2 사이트에 대한 assignment-time enforcement
- renderer defense-in-depth와 publish/preflight 감사
- 사실 이미지가 없을 때 text/shape/motion 기반 정직한 fallback
- 기존 사이트 무회귀 호환성 테스트
- before/after 기본 OFF와 기존 특수 계약 보존

### 3.2 런칭 후 fast-follow로 분리

이번 작업에서 다음을 억지로 완성하지 마라.

- 모든 기존 사이트의 전수 provenance backfill
- 레거시 사이트의 강제 publish 차단
- `SiteConfig`·`imagePool` 전체를 한 번에 `AssetRef`로 재작성
- 일반 메뉴·매장 사진마다 별도의 per-asset attestation UI
- 외부 import 자산의 완전한 권리 검증 체계
- 비전 모델을 이용한 생성물 분류를 주 방어선으로 도입
- licensed stock marketplace 또는 stock 권리 계약
- 법무 승인 없는 beauty/remodeling before/after 활성화
- 결제 백엔드 신설 또는 가격 정책 변경

fast-follow 항목을 TODO로 코드 곳곳에 흩뿌리지 말고 완료 보고서의 단일 backlog로 정리하라.

---

## 4. 변하지 않는 도메인 원칙

### 4.1 출처와 사용 목적은 다른 축이다

자산 자체의 출처와 특정 슬롯에서의 사용 역할을 하나의 필드로 섞지 마라.

- `AssetRecord`: 자산이 어디에서 왔고 서버가 무엇을 알고 있는가
- `AssetUsage`: 해당 자산을 어떤 슬롯에서 어떤 주장으로 사용하는가
- `SlotPolicy`: 그 슬롯이 어떤 자격을 요구하는가

AI 이미지가 추상 배경에 쓰이는 것은 허용될 수 있지만, 같은 이미지가 메뉴 제품 사진으로 들어가는 것은 허용되지 않는다. 따라서 안전성은 `origin` 하나가 아니라 `AssetRecord × AssetUsage × SlotPolicy`의 조합으로 판정한다.

### 4.2 factual 슬롯은 fail-closed다

출처나 확인 상태가 없거나 모호하면 factual로 허용하지 마라.

- 모르는 URL을 customer upload로 추정하지 마라.
- URL 도메인·파일명·폴더명으로 사실성을 인증하지 마라.
- AI 생성물을 사람이 선택했다는 이유로 customer upload로 승격하지 마라.
- 고객 업로드를 AI가 재생성·합성·대체한 결과물은 새 `ai_generated` 자산이며 factual 자격을 상속하지 않는다.
- 정책 서비스가 실패하거나 레코드를 찾지 못하면 신규 v2 factual assignment는 거부한다.

### 4.3 방어 우선순위

1. AI에게 사실 피사체를 생성하도록 요청하지 않는다.
2. 생성 API가 금지 조합을 거부한다.
3. assignment가 부적격 자산을 factual 슬롯에 저장하지 못하게 한다.
4. renderer가 잘못된 데이터의 표시를 다시 막는다.
5. publish/preflight가 최종 위반을 차단한다.
6. 비전 분류기는 필요하다면 보조 신호일 뿐이다.

비전 분류기가 없어도 시스템은 안전해야 한다.

---

## 5. 사실 콘텐츠와 허용 출처

다음 슬롯은 실제 사업에 대한 주장이다.

| 실제로 주장하는 내용 | 슬롯 역할 | 런칭 시 허용 자산 |
|---|---|---|
| 실제 음식·메뉴·판매 제품 | factual | 확인된 customer upload |
| 실제 매장·외관·인테리어 | factual | 확인된 customer upload |
| 실제 직원·의사·변호사·강사·고객 | factual/person | customer upload + 자산별 인물 동의 |
| 실제 포트폴리오·완성 프로젝트·결과 | factual | 확인된 customer upload |
| 전후 결과 | factual/before_after | 기능 allowlist + 기존 전용 증빙을 통과한 customer upload pair |
| 추상 무드·색·빛·재질·패턴 | atmospheric | AI 허용 |
| 명백히 합성된 3D 브랜드 월드 | decorative/atmospheric | AI 허용 |
| 명백한 일러스트·콜라주 | decorative/atmospheric | AI 허용 |
| 그래픽 타이포·브랜드 shape | decorative | 코드 생성 또는 AI 허용 |

추가 규칙:

- `customer_import`는 `customer_upload`와 구분해 기록한다.
- 런칭 v2에서는 import 권리 검증이 완성되기 전까지 imported asset을 factual에 자동 허용하지 마라.
- 기존 import 기반 사이트는 legacy flag 아래 기존 렌더를 유지하되, 신규 v2 사이트의 factual eligibility 근거로 import URL을 사용하지 마라.
- `licensed_stock`은 실제 계약이 없으므로 이번 enum에 미리 추가하지 마라.

---

## 6. Canonical 최소 계약

정찰 후 저장소의 실제 명명 규칙에 맞추되, 의미적으로 다음 계약을 만족하라.

```ts
export type AssetOrigin =
  | 'customer_upload'
  | 'customer_import'
  | 'ai_generated'
  | 'legacy_unknown';

export type AssetRole =
  | 'factual'
  | 'atmospheric'
  | 'decorative';

export type AssetSubject =
  | 'product'
  | 'place'
  | 'person'
  | 'portfolio'
  | 'before_after'
  | 'abstract';

export interface AssetRecord {
  id: string;
  origin: AssetOrigin;
  mediaType: 'image' | 'video';
  storageKey: string | null;
  canonicalUrl: string;
  createdAt: string;
  ownerId: string;
}

export interface AssetUsage {
  assetId: string;
  role: AssetRole;
  subject: AssetSubject;
  slotKey: string;
}

export interface AssetRef {
  assetId: string;
  url: string;
}
```

위 `AssetOrigin`은 목표 canonical 계약이지, 기존 값을 일괄 문자열 치환하거나 삭제해도 된다는 뜻이 아니다. 현재 저장소에는 최소 다음 provenance/source 어휘가 공존한다.

| 위치 | 현재 필드/타입 | 알려진 값 |
|---|---|---|
| `web/src/lib/uploads/asset-provenance.ts` | `CustomerAssetSource` / `source` | `customer-upload`, `ai-generated`, `synthetic` |
| `web/src/lib/types/site.ts`, `web/src/app/api/_lib/schemas.ts` | render/export `provenance` | `customer-provided`, `ai-generated`, `curated`, `unknown` |
| `web/src/lib/motion/signatures.ts` | motion asset `source` | `customer-upload`, `ai-generated`, `external`, `curated` |
| 이 문서의 목표 계약 | `AssetOrigin` | `customer_upload`, `customer_import`, `ai_generated`, `legacy_unknown` |

이 목록도 완전하다고 가정하지 마라. T1.1에서 DB constraint, Zod schema, TypeScript union, API DTO, fixture, serializer까지 전수 검색해 추가 어휘를 찾아야 한다. `source`, `provenance`, `origin`, `curated`는 이름이 비슷해도 같은 의미라고 가정하지 마라.

이는 예시 형태다. 다음 원칙이 더 중요하다.

- DB와 서버의 기존 ID, tenant/site ownership, media type, storage 구조를 재사용하라.
- `origin`은 create 경로에서 서버만 결정한다.
- 클라이언트 DTO에 writable `origin`을 노출하지 마라.
- update API에서 `origin` 변경을 금지하라.
- inline metadata보다 서버 registry가 권위적이다.
- 정적 export에 필요한 데이터는 안전한 projection으로 직렬화하되, 클라이언트가 다시 권위적 provenance로 제출할 수 없게 하라.
- `legacy_unknown`은 사실 자격이 아니라 호환 상태다.

### 6.1 일반 확인과 자산별 확인을 분리

일반 제품·메뉴·매장·포트폴리오 업로드에는 온보딩 또는 사이트 단위 1회 포괄 확인을 사용한다.

권장 의미:

> “업로드하는 사진은 이 실제 사업과 관련되어 있고, 사용할 권리가 있으며, 실제 제품·장소·작업을 사실대로 보여줍니다.”

서버는 확인 문구의 version, 확인 시각, actor, site/account 범위를 저장해야 한다. 단순 boolean 하나만 저장하지 마라.

자산별 확인이 필요한 것은 다음이다.

- 사람 사진: 초상·사용 동의
- before/after: 동일 사례, 실제 결과, 원본성, 사용 권리 등 기존 전용 증빙

일반 사진 모두에 per-asset modal을 강제하지 마라. 무결성을 지키면서 불필요한 온보딩 마찰을 만들지 않는 것이 v1의 제품 결정이다.

---

## 7. before/after 계약 보존

before/after는 generic asset registry의 필드 묶음이 아니라 **전용 extension**이다.

기존 `CustomerAssetProvenance`, `caseId`, `sameCaseAttested` 또는 동등한 작동 계약을 먼저 찾아 그대로 보존하라.

목표 구조:

```ts
interface BeforeAfterEvidence {
  beforeAssetId: string;
  afterAssetId: string;
  caseId: string;
  sameCaseAttested: true;
  rightsAttestedAt: string;
  factualAttestedAt: string;
  // 기존 계약의 필수 필드를 보존한다.
}
```

금지사항:

- 모든 `AssetRecord`에 `caseId`나 `sameCaseAttested`를 강제하지 마라.
- 기존 before/after 테스트와 의료 차단 로직을 generic registry로 대체하거나 약화하지 마라.
- AI 생성·AI 편집·미확인 import 자산을 before/after pair에 허용하지 마라.

런칭 기본값:

- `BEFORE_AFTER_ENABLED=false`
- 의료·의원 업종은 flag와 무관하게 항상 차단
- beauty·피부·반영구·remodeling 등은 법무가 승인한 정확한 allowlist에만 제한적으로 활성화
- allowlist가 구현·승인되지 않았으면 모든 업종에서 OFF 유지
- 이 구현을 “법률 준수 보장”이라고 표현하지 마라. 제품 안전장치이며 법무 검토를 대체하지 않는다.

---

## 8. Feature flag와 cohort 격리

저장소의 기존 flag 시스템이 있으면 재사용하라. 의미적으로 다음 flag를 제공한다.

```txt
ASSET_PROVENANCE_V2_WRITE
ASSET_PROVENANCE_V2_ASSIGN
ASSET_PROVENANCE_V2_ENFORCE_NEW_SITES
ASSET_PROVENANCE_V2_ENFORCE_LEGACY
BEFORE_AFTER_ENABLED
```

기본 정책:

- 모든 flag는 server-owned다.
- `ASSET_PROVENANCE_V2_ENFORCE_LEGACY=false`
- `BEFORE_AFTER_ENABLED=false`
- 신규 v2 cohort는 서버가 version marker를 기록한다.
- 클라이언트가 query/body/localStorage로 cohort나 enforcement를 바꾸지 못한다.
- flag 미설정·조회 실패 시 legacy 전체를 깨뜨리지 말고, 신규 v2 factual assignment는 fail-closed한다.
- write → assign → enforce 순으로 단계적으로 켤 수 있어야 한다.

기존 `SiteConfig`와 `imagePool`을 한 번에 재작성하지 마라.

- 기존 URL string 경로를 유지한다.
- 새 경로에서 `AssetRef`를 additive하게 dual-write하거나 boundary adapter로 변환한다.
- 새 enforcement는 v2 cohort에만 적용한다.
- flag OFF 상태에서 기존 사이트의 HTML/DOM/주요 스냅샷이 동일하다는 compatibility test를 둔다.

---

## 9. 세 개의 merge track

## Track 1 — Registry, server stamping, compatibility seam

브랜치:

```txt
feature/asset-provenance-registry
```

최신 main에서 생성한다. 다른 feature branch 위에 직접 쌓지 마라.

### T1.1 정찰 보고

코드 변경 전 다음을 보고하라.

1. 일반 upload가 URL을 만들고 DB/site config에 전달하는 전체 경로
2. AI image/video 생성이 URL을 만들고 저장하는 전체 경로
3. customer import가 외부 URL을 다운로드·저장하는 전체 경로
4. `heroPhotoUrl`, `storePhotoUrls`, `imagePool`, `SiteConfig`, renderer, static export의 이미지 전달 구조
5. motion-signatures가 추가한 provenance와 before/after 계약
6. 현재 DB migration 번호·RLS·service-role 경계
7. 현재 feature flag 체계
8. 기존 테스트와 가장 작은 compatibility seam

정찰 결과가 본 프롬프트의 가정과 다르면, 변경 전에 화해 계획을 제시하라. 기존 canonical 타입과 충돌하는 새 enum을 만들지 마라.

#### T1.1-A Provenance 어휘 화해 — H1 핵심 승인물

위 §6에 명시된 기존 어휘를 포함해 저장소의 provenance/source/origin 값을 전수 조사하고, **코드를 변경하기 전에** 다음 열을 가진 화해표를 제출하라.

| legacy 타입/필드 | legacy 값 | 실제 writer/producer | 현재 의미 | canonical origin | origin이 아니라면 보존할 축 | read adapter | 신규 write 정책 | migration/backfill | 모호할 때 처리 | 회귀 테스트 |
|---|---|---|---|---|---|---|---|---|---|---|

화해 규칙:

1. 어떤 값도 조용히 삭제·병합·rename하지 마라. 모든 기존 enum 값에 명시적 행이 있어야 한다.
2. kebab-case와 snake_case 차이만 보고 의미가 같다고 가정하지 마라. 실제 생성 경로와 소비자를 추적하라.
3. `ai-generated`는 생성 경로 증거가 있으면 `ai_generated`로 화해하되, 기존 serializer/API를 위한 boundary adapter를 명시한다.
4. `synthetic`은 AI 또는 합성 생성 경로가 증명될 때만 `ai_generated` 후보가 된다. 명백한 합성이라는 표현 의미가 필요하면 origin과 별도로 `decorative` role 또는 동등한 축에 보존한다. 증거가 없으면 `legacy_unknown`으로 fail-closed한다.
5. `curated`는 그 자체로 자산 출처를 증명하지 않는다. 실제 의미가 편집 선택·추천·bundle 상태라면 origin enum에 억지로 넣지 말고 usage/curation flag 또는 동등한 별도 축으로 보존한다. underlying origin을 추적할 수 없으면 `legacy_unknown`이며, 절대 `customer_upload`로 승격하지 않는다.
6. `customer-provided`도 문자열만으로 `customer_upload`라고 단정하지 마라. 서버 등록 upload record 또는 기존 before/after registry처럼 신뢰할 수 있는 연결 증거가 있을 때만 화해한다. 증거가 없으면 기존 렌더 호환은 유지하되 신규 v2 factual eligibility는 주지 않는다.
7. `external`은 실제 customer import pipeline이 증명될 때만 `customer_import`로 화해한다. 임의의 원격 URL이면 `legacy_unknown`이다.
8. `unknown`은 `legacy_unknown`으로 화해하며 factual 자격을 갖지 않는다.
9. before/after의 `customer-provided` render 계약과 `customer-upload` registry 계약이 서로 다른 계층이라면 둘을 성급히 하나로 삭제하지 말고, adapter와 검증 연결을 명시한다.
10. 하나의 canonical server origin만 권위적이어야 한다. legacy 필드는 호환 projection/read adapter가 될 수 있지만 두 필드가 서로 다른 출처를 주장하는 dual authority를 만들지 마라.
11. canonical → legacy serialization과 legacy → canonical read의 양방향 동작을 각각 정의한다. round-trip이 불가능한 값은 손실 내용과 안전한 처리 방식을 H1에서 승인받는다.
12. 매핑되지 않은 새 값이나 불일치가 들어오면 신규 v2 factual 경로에서는 fail-closed하고 stable reason code를 남긴다.

H1 이전에는 다음을 하지 마라.

- 기존 enum 값 삭제
- DB enum/check constraint 변경
- 대량 backfill
- `synthetic` 또는 `curated`의 의미를 임의 확정
- legacy serializer 제거
- canonical enum을 전 경로에 강제 배포

화해표와 권장안을 먼저 제출하고, 실제 DB enum/contract 결정은 H1 승인 후 확정한다.

### T1.2 Additive registry

- 최소 generic asset registry와 필요한 server service를 추가한다.
- migration은 additive하고 되돌리기 쉬워야 한다.
- 기존 컬럼 삭제, destructive rewrite, 전수 backfill, 즉시 NOT NULL 강제를 하지 마라.
- tenant/site ownership과 접근 정책을 기존 모델에 맞게 강제한다.
- 일반 브라우저 클라이언트가 origin을 insert/update할 수 없도록 API와 RLS 또는 서버 경계를 함께 확인한다.
- 동일 자산의 중복 등록과 재시도에 안전한 idempotency를 고려한다.

### T1.3 Server-owned origin stamping

각 실제 생성 경계가 다음 origin을 기록하게 한다.

- 직접 upload 완료 경로 → `customer_upload`
- 외부 사이트/URL import 경로 → `customer_import`
- 모든 AI image/video 생성 경로 → `ai_generated`
- provenance를 판정할 수 없는 기존 URL → `legacy_unknown`

클라이언트가 보낸 `origin`, `role`, `factual=true`를 믿지 마라. 무시보다 명시적 validation error가 계약을 더 명확하게 만든다면 거부하라. 어떤 방식을 택했는지 테스트로 고정한다.

### T1.4 Compatibility seam

- 기존 URL 결과를 깨지 않으면서 서버가 `AssetRef`를 함께 얻을 수 있는 dual-write 또는 adapter를 만든다.
- hot render path에서 이미지마다 개별 DB query가 발생하지 않게 batch resolve/cache 경계를 설계한다.
- 기존 사이트와 기존 API response shape가 flag OFF에서 유지되는지 증명한다.
- URL heuristic은 `legacy_unknown` migration hint로만 제한한다.

### T1.5 Track 1 필수 테스트

- upload origin은 서버가 `customer_upload`로 기록
- AI origin은 서버가 `ai_generated`로 기록
- import origin은 `customer_import`로 구분
- client-supplied origin 위조 거부 또는 무시
- origin update 불가
- 다른 tenant 자산 참조 불가
- retry/idempotency 동작
- flag OFF에서 기존 image URL flow 무회귀
- generic asset에 before/after 전용 필드가 강제되지 않음
- 기존 before/after 계약·테스트 무회귀
- 발견된 모든 legacy provenance/source 값에 매핑 fixture가 존재
- `synthetic`, `curated`, `external`, `unknown`이 조용히 유실되거나 `customer_upload`로 승격되지 않음
- 매핑되지 않은 값은 신규 v2 factual 경로에서 fail-closed
- legacy read/write adapter의 round-trip 또는 의도된 손실 정책이 테스트로 고정됨
- canonical origin과 legacy projection이 불일치할 때 서버 registry가 우선하며 위반이 탐지됨

### T1.6 Track 1 완료와 H1

커밋 예시:

```txt
feat(assets): add server-owned provenance registry
feat(assets): dual-write asset refs behind launch flags
test(assets): enforce provenance authority and compatibility
```

전체 품질 게이트를 실행하고 다음을 보고하라.

- 변경 파일과 migration
- 기존 어휘 전체 목록과 canonical 타입 화해표
- `synthetic`, `curated`, `external`, `customer-provided`의 최종 의미·목적 필드·손실 여부
- canonical authority와 legacy read/write adapter 경계
- RLS/API 권위 경계
- dual-write와 rollback 방식
- 테스트 전후 수와 결과
- known risks

그 후 **HUMAN GATE H1에서 멈춰라.**

H1의 승인 대상은 **provenance 3개 이상 어휘의 전 값 매핑표**, DB enum/contract, migration, origin 경계, legacy adapter, 호환 전략이다. 단 하나의 값이라도 의미·목적지·fail-closed 정책이 미정이면 H1을 통과한 것으로 간주하지 마라. 승인·merge 확인 전 Track 2를 시작하지 마라.

---

## Track 2 — Truth policy, AI generation, direction UI

브랜치:

```txt
feature/asset-truth-policy
```

H1 승인 후 Track 1이 merge된 최신 main에서 생성한다.

### T2.1 Slot policy registry

섹션 이름에 흩어진 조건문 대신 canonical policy registry를 만든다. 저장소에 `PURPOSE_SCHEMA_MAP` 또는 동등 패턴이 있으면 재사용한다.

최소 판정 입력:

- site/tenant
- industry
- slot key 또는 purpose
- role
- subject
- asset record
- attestation state
- feature flags/cohort

최소 판정 출력:

```ts
type AssetPolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'MISSING_ASSET_RECORD'
        | 'LEGACY_ORIGIN_NOT_FACTUAL'
        | 'AI_NOT_ALLOWED_IN_FACTUAL_SLOT'
        | 'IMPORT_NOT_VERIFIED_FOR_FACTUAL_SLOT'
        | 'MISSING_GENERAL_ATTESTATION'
        | 'MISSING_PERSON_CONSENT'
        | 'BEFORE_AFTER_DISABLED'
        | 'BEFORE_AFTER_INDUSTRY_BLOCKED'
        | 'BEFORE_AFTER_EVIDENCE_INVALID'
        | 'ASSET_OWNER_MISMATCH';
    };
```

실제 코드의 error/result 패턴에 맞추되, stable reason code를 유지하라.

### T2.2 Hero 이중성

hero를 무조건 decorative 또는 factual로 고정하지 마라.

- 실제 제품·매장·사람을 보여주며 실제 사업을 암시 → factual
- 추상 형태·재질·빛·타이포·명백한 가상 3D world → atmospheric/decorative
- 실제처럼 보이는 가짜 카페 인테리어, 실제처럼 보이는 가짜 빵·커피 → 금지

purpose와 카피가 실제 대상을 주장하는지까지 고려하되, 모호하면 factual로 취급한다.

### T2.3 이미지 방향 UI 재설계

사용자가 선택하는 방향은 다음 네 가지로 제한한다.

1. **실사 사진 — 실제 사진 필요**
   - 고객 업로드의 crop, framing, color grade, layout, motion만 사용
   - 실제 제품·장소·사람을 AI로 재생성하지 않음
2. **3D 브랜드 월드**
   - 명백히 합성된 프리미엄 3D
   - 실제 판매 제품이나 실제 매장을 증명하는 척하지 않음
3. **일러스트·콜라주**
   - 의도적으로 비사진적이고 편집적인 표현
4. **추상 에디토리얼**
   - 색, 빛, 재질, 기하, 타이포 중심

실사 선택에 적격 upload가 없으면 생성 버튼까지 진행시키지 말고 다음 의미의 안내를 제공한다.

> 사실적인 이미지는 실제 사업장을 보여줘야 합니다. 실제 사진을 올리거나, 명백히 예술적인 AI 방향을 선택하세요.

기존 `photo` 기본 선택과 fallback을 점검하라. 신규 v2 플로우에서는 upload 없이 `photo`/`photorealistic` 생성으로 자동 하향되지 않아야 한다.

### T2.4 General attestation

- 일반 factual upload에 사이트/온보딩 단위 1회 확인 UI를 제공한다.
- 동의 전에는 업로드 저장 자체보다 factual assignment를 막는 쪽으로 UX를 설계한다.
- 확인 문구 version과 서버 기록을 연결한다.
- 사람 슬롯은 자산별 consent를 추가로 요구한다.
- before/after는 기존 자산별 전용 evidence를 요구한다.
- dark pattern이나 법적 보증처럼 보이는 카피를 피한다.

### T2.5 AI prompt와 generation API 강제

신규 v2 플로우에서 모델에 다음을 요청하지 마라.

- 그 카페가 실제 판매한다는 빵·커피·메뉴
- 그 업체의 실제 매장·인테리어·외관
- 실제 직원·전문가·고객
- 실제 포트폴리오·시공 결과·시술 결과
- before/after 결과
- 실제 제품처럼 오인될 hyperreal mock product

AI 허용 요청은 다음 범위다.

- abstract material, light, color, shape, texture
- clearly synthetic 3D brand world
- editorial illustration/collage
- typographic or symbolic composition

기존 `photorealistic-prompt`가 imaginary interior/product를 만드는 경로가 있으면 신규 v2에서 제거하거나 차단한다. 단순히 프롬프트에 “not real”을 한 줄 추가하는 것으로 끝내지 마라.

생성 API는 클라이언트가 factual subject를 보내면 server-side에서 거부해야 한다. AI 생성물은 어떤 reference upload가 있어도 `ai_generated`이며 role은 atmospheric/decorative만 가능하다.

### T2.6 Before/after launch switch

- `BEFORE_AFTER_ENABLED`는 기본 false다.
- 의료 업종은 항상 deny한다.
- beauty·피부·반영구·remodeling은 승인된 allowlist가 없으면 deny한다.
- 기존 evidence 계약을 그대로 호출하고 우회 경로가 없는지 검사한다.

### T2.7 Track 2 필수 테스트

- no-upload + real photo 선택 → UI/API 모두 차단
- v2 기본값이 photoreal 생성으로 떨어지지 않음
- AI factual product/place/person/portfolio/before_after 요청 거부
- 3D/illustration/abstract의 허용 범위 통과
- AI derivative가 factual 자격을 상속하지 않음
- 일반 upload + 유효한 site attestation은 일반 factual 슬롯에 허용
- attestation 없음은 거부
- person은 per-asset consent 없으면 거부
- customer import는 런칭 v2 factual에 자동 허용되지 않음
- before/after 기본 OFF
- 의료 before/after는 flag와 무관하게 deny
- 기존 before/after test 무회귀
- UI keyboard 접근성, 오류 메시지, loading/error state

### T2.8 Track 2 완료와 H2

커밋 예시:

```txt
feat(assets): add factual slot policy registry
feat(onboarding): require uploads for real-photo direction
feat(ai): block generated factual subjects
test(assets): cover truth policy and attestations
```

전체 품질 게이트와 관련 UI 테스트를 실행하고 다음을 보고하라.

- 슬롯 정책 표
- 허용/거부 API 예시
- 변경된 direction UX
- 제거·격리한 photoreal 경로
- attestation 저장 방식
- before/after flag 기본값
- 테스트 결과와 스크린샷 또는 실제 preview 증빙

그 후 **HUMAN GATE H2에서 멈춰라.**

H2의 승인 대상은 UX 문구, 전환율 마찰, AI 허용 범위, industry policy, before/after 출시 범위다. 승인·merge 확인 전 Track 3를 시작하지 마라.

---

## Track 3 — Assignment enforcement, honest fallback, publish audit

브랜치:

```txt
feature/asset-provenance-enforcement
```

H2 승인 후 Track 2가 merge된 최신 main에서 생성한다.

### T3.1 Assignment-time enforcement

가장 중요한 차단 지점은 renderer가 아니라 자산을 section/site config에 배정하는 순간이다.

- 신규 v2 site generation pipeline이 URL string만 고르는 대신 provenance-aware decision을 호출하게 한다.
- factual slot에 저장하기 전에 owner, origin, attestation, subject, industry policy를 검사한다.
- 거부된 assignment는 저장하지 않고 stable reason code와 fallback intent를 반환한다.
- 정책을 여러 renderer에 복사하지 말고 단일 service/registry를 사용한다.
- legacy path는 feature flag로 격리한다.

### T3.2 Renderer defense-in-depth

잘못된 저장 데이터나 오래된 draft가 들어올 수 있으므로 renderer에서도 다시 확인한다.

- factual slot의 부적격 AI/import/unknown 자산을 표시하지 않는다.
- 이미지 하나 때문에 전체 section을 crash시키지 않는다.
- 대체 이미지를 몰래 만들어 넣지 않는다.
- 올바른 semantic text, heading, CTA, structured content는 남긴다.
- media box를 제거하거나 사전에 치수를 예약해 CLS를 만들지 않는다.

### T3.3 Honest fallback

실제 사진이 없는 factual slot의 fallback은 다음 우선순위다.

1. 이미지 없는 강한 typography와 copy hierarchy
2. 브랜드 palette 기반 CSS/SVG shape
3. abstract texture/light/material
4. 명백한 illustration/collage
5. 명백한 fictional 3D brand world
6. premium motion signature

금지:

- 카페 업로드가 없을 때 AI 빵·커피·매장 사진
- 식당 업로드가 없을 때 AI 메뉴 사진
- 병원 업로드가 없을 때 AI 의사·환자·시술 결과
- 법무법인 업로드가 없을 때 가짜 변호사 portrait/office
- 시공업체 업로드가 없을 때 가짜 완공 portfolio

fallback은 “사진을 못 찾았습니다” 같은 깨진 상태가 아니라 의도된 premium art direction처럼 보여야 한다. 단, 실제 대상이 있는 것처럼 암시하면 안 된다.

### T3.4 Motion integration

기존 motion signature를 재사용하되 provenance 규칙을 우회하지 마라.

- AI decorative layer가 factual media layer를 대체하거나 factual label을 얻지 못하게 한다.
- customer photo motion은 원본 사진의 framing, crop, grade, reveal, parallax 범위에 제한한다.
- AI video 또는 AI image-to-video 결과는 `ai_generated`이며 decorative/atmospheric만 가능하다.
- reduced motion에서는 콘텐츠가 즉시 보이고 사실 슬롯 정책이 동일하게 적용되어야 한다.
- fallback이 CLS, scroll jank, late layout insertion을 만들지 않게 한다.

### T3.5 Publish/preflight audit

신규 v2 cohort에 대해 publish 직전에 전체 asset usage를 감사한다.

차단 조건:

- factual slot에 `ai_generated`
- factual slot에 `legacy_unknown`
- factual slot에 미검증 `customer_import`
- 일반 factual slot에 general attestation 없음
- person slot에 per-asset consent 없음
- before/after flag/industry/evidence 위반
- 다른 owner/tenant 자산 참조
- 존재하지 않는 asset ID

감사 결과는 사용자에게 수정 가능한 메시지로 보여주고, 내부 로그에는 stable reason code와 slot key를 남긴다. 민감한 동의 원문이나 개인 데이터를 로그에 남기지 마라.

`ASSET_PROVENANCE_V2_ENFORCE_LEGACY=false`인 동안 기존 사이트 발행을 새 정책으로 갑자기 차단하지 마라. 대신 관찰 모드 audit metric을 둘 수 있다.

### T3.6 Static export와 성능

- 정적 export HTML에는 모든 semantic content가 존재해야 한다.
- JS·motion이 실패해도 heading, copy, CTA가 남아야 한다.
- 이미지가 제거될 때 layout shift가 없어야 한다.
- 적격 customer images는 dimensions/aspect ratio를 유지한다.
- below-the-fold 이미지는 lazy load하고, hero/poster는 기존 성능 정책을 따른다.
- asset policy 때문에 이미지마다 직렬 DB round trip을 추가하지 않는다.
- registry resolve를 batch/cache하고 ownership 누락이 생기지 않게 한다.

### T3.7 Track 3 필수 테스트

#### Assignment

- AI → factual assignment 저장 거부
- unknown/import → 신규 v2 factual 저장 거부
- 확인된 customer upload → 올바른 일반 factual 슬롯 허용
- owner mismatch 거부
- decorative AI → 허용된 decorative 슬롯 통과

#### Renderer

- 오염된 factual AI 데이터가 있어도 표시되지 않음
- 이미지 없는 fallback이 깨지지 않음
- semantic content 유지
- reduced motion에서 즉시 가시
- CLS를 유발하는 late insertion 없음

#### Publish

- 신규 v2 provenance 위반 하나라도 있으면 발행 차단
- 수정 가능한 reason/message 제공
- before/after default OFF 동작
- 기존 사이트는 legacy enforcement OFF에서 기존대로 동작

#### Compatibility

- 기존 `SiteConfig` fixture deserialize/render 성공
- 기존 URL-only image pool 경로 무회귀
- flag OFF snapshot/DOM equivalence
- static export 성공
- motion signature와 before/after 기존 회귀 테스트 green

#### Performance

- N개 이미지에 N개의 개별 registry query가 생기지 않음
- fallback과 audit이 build/render timeout을 만들지 않음
- 이미지 dimensions/lazy/poster 불변식 유지

### T3.8 Rollout 순서

코드 merge와 production activation은 별개다. 완료 보고에서 다음 순서의 rollout plan을 제시하되 직접 활성화하지 마라.

1. registry write only
2. staging dual-write 검증
3. 신규 내부 test site에 policy assignment
4. 신규 canary cohort enforce
5. audit metric 확인
6. 신규 사이트 전체 enforce
7. legacy는 계속 OFF

각 단계의 rollback은 flag disable만으로 가능해야 한다. DB 데이터를 삭제해야만 rollback할 수 있는 구조를 피한다.

### T3.9 Track 3 완료와 최종 게이트

커밋 예시:

```txt
feat(render): enforce provenance-aware asset assignment
feat(publish): audit factual media provenance for v2 sites
feat(fallback): add honest typography and abstract fallbacks
test(assets): cover publish, render, and legacy compatibility
```

전체 품질 게이트를 실행하고 최종 보고 후 멈춰라. 자동 merge·flag 활성화·production migration 적용을 하지 마라.

---

## 10. 절대 불변식 테스트

아래 테스트는 구현 세부와 무관하게 최종적으로 모두 존재해야 한다.

### Server authority

1. 클라이언트가 `origin=customer_upload`를 위조해 AI URL을 보낼 수 없다.
2. upload/import/AI 경로가 각각 올바른 origin을 서버에서 기록한다.
3. 등록 후 origin은 일반 update API로 바뀌지 않는다.
4. 다른 tenant의 asset ID를 사용할 수 없다.

### Factual eligibility

5. `ai_generated`는 모든 factual subject에서 거부된다.
6. `legacy_unknown`은 신규 v2 factual에서 거부된다.
7. `customer_import`는 런칭 v2 factual에서 자동 승인되지 않는다.
8. 일반 customer upload도 유효한 site attestation 없이는 factual에 들어가지 않는다.
9. person은 per-asset consent 없이는 들어가지 않는다.
10. AI derivative는 reference upload가 있어도 factual이 아니다.

### Generation

11. upload 없는 real-photo 방향은 생성 요청 전 차단된다.
12. prompt builder가 실제 제품·장소·사람·결과를 생성하도록 요청하지 않는다.
13. generation API가 factual subject 조합을 server-side에서 거부한다.
14. 허용된 3D/illustration/abstract만 decorative/atmospheric로 등록된다.

### Before/after

15. generic asset registry가 `caseId`를 요구하지 않는다.
16. 기존 before/after evidence 계약이 보존된다.
17. `BEFORE_AFTER_ENABLED` 기본값은 false다.
18. 의료 업종은 flag와 무관하게 거부된다.
19. AI·import·unknown before/after는 거부된다.

### Rendering and publishing

20. 오염된 factual AI asset은 renderer에서 표시되지 않는다.
21. 누락된 factual image는 가짜 사진이 아니라 의도된 typography/abstract fallback을 사용한다.
22. 신규 v2 publish audit가 모든 provenance 위반을 차단한다.
23. static export에 semantic content가 존재한다.
24. reduced-motion에서 콘텐츠가 즉시 보인다.
25. fallback과 media rejection이 CLS를 만들지 않는다.

### Compatibility

26. feature flag OFF에서 기존 사이트가 동일하게 렌더된다.
27. 기존 URL-only config와 image pool이 계속 작동한다.
28. 기존 motion/before-after 테스트가 회귀하지 않는다.
29. legacy enforcement는 기본 OFF다.
30. rollback은 데이터 삭제 없이 flag로 가능하다.

---

## 11. UX 품질 기준

이 시스템은 사용자를 벌주는 compliance UI가 아니라, 더 신뢰할 수 있는 프리미엄 웹사이트를 만드는 제품 기능이어야 한다.

- “AI 사용 금지”가 아니라 “실제 사진은 실제 사업을 보여주고, AI는 브랜드 세계를 만든다”로 설명한다.
- 실사 업로드가 없을 때 dead end를 만들지 말고 3D, illustration, abstract 방향을 즉시 preview하게 한다.
- preview에서 각 방향이 실제 고객 콘텐츠와 어떻게 결합되는지 보여준다.
- 같은 이미지를 필터만 바꾼 선택지처럼 보이게 하지 않는다.
- 업로드된 사진은 품질이 낮더라도 사실 피사체를 AI로 교체하지 않는다. crop, cleanup, color, layout의 허용 범위를 별도 정책으로 명확히 한다.
- 생성 이미지가 “실제 메뉴”, “실제 매장”, “실제 사례”로 읽힐 수 있는 카피 옆에 배치되지 않게 한다.
- 사용자가 차단 이유와 해결 방법을 한 번에 이해할 수 있어야 한다.

권장 사용자 해결 경로:

- 실제 사진 업로드
- 해당 슬롯을 이미지 없는 premium layout으로 전환
- 명백한 3D/illustration/abstract 방향 선택
- 부적절한 사실 주장을 제거하거나 decorative slot으로 변경

---

## 12. 보안·개인정보·관측성

- attestation과 consent는 actor, scope, version, timestamp를 서버에 기록한다.
- 민감한 원문, 얼굴 데이터, 의료 정보를 일반 application log에 남기지 않는다.
- asset ownership은 URL 소유가 아니라 서버 record의 tenant/site 관계로 확인한다.
- signed URL 만료와 canonical storage key를 구분한다.
- audit metric은 최소 다음을 집계할 수 있다.
  - origin별 등록 수
  - reason code별 assignment 거부 수
  - no-upload real-photo 차단 후 대체 방향 선택률
  - publish audit 실패율
  - fallback 사용률
- 관측성 이벤트가 고객의 원본 이미지나 민감한 attestation 내용을 포함하지 않게 한다.

---

## 13. 최종 완료 보고 형식

각 human gate 및 최종 완료 보고는 다음 순서를 지켜라.

### A. 상태

- 현재 track/branch
- base main commit
- 선행 track merge 확인
- worktree 상태

### B. 구현 결과

- 변경된 계약과 주요 파일
- DB migration/RLS/API 경계
- feature flag와 기본값
- 신규 v2와 legacy 경계
- before/after 보존 방식

### C. 정책 증빙

- factual/atmospheric/decorative 매핑
- 허용 및 거부 예시
- 서버 origin 위조 방지 증빙
- no-upload photoreal 차단 증빙
- honest fallback 예시

### D. 검증

- 실행한 정확한 typecheck/test/build 명령
- 각 exit code
- 테스트 수 전후 변화
- UI preview 또는 screenshot 경로
- compatibility 결과
- 성능 쿼리/CLS 검증 결과

### E. Git

- commit hash와 메시지
- staged/committed 파일 목록
- 관련 없는 사용자 파일이 포함되지 않았다는 확인

### F. 남은 위험과 다음 승인

- 알려진 위험
- 사람이 결정해야 할 항목
- rollback 방법
- 다음 track 시작 조건
- fast-follow backlog

---

## 14. 완료 정의

다음 조건을 모두 만족해야 런칭 임계 provenance 작업이 완료된 것이다.

- motion-signatures 선행 조건이 main에서 확인됨
- 세 track이 각각 독립적으로 리뷰·승인·merge됨
- origin이 모든 신규 유입 경계에서 server-stamped됨
- upload 없는 photoreal 생성이 신규 v2 경로에서 사라짐
- AI가 factual 슬롯에 assignment·render·publish되지 않음
- 일반 확인과 사람/before-after 자산별 확인이 올바르게 분리됨
- before/after 전용 계약이 보존되고 기본 OFF임
- 신규 v2 enforcement와 legacy 경로가 feature flag로 격리됨
- 기존 사이트가 flag OFF에서 동일하게 렌더됨
- 이미지가 없을 때 가짜 사진이 아니라 premium typography/abstract/motion fallback이 나옴
- typecheck, 전체 test, build가 green임
- production 활성화와 legacy migration은 별도 승인으로 남아 있음

마지막 판단 기준:

> 생성 이미지가 아름다운가보다 먼저, 그 이미지가 고객의 실제 사업에 대한 사실처럼 오인되는가를 묻는다. 오인될 수 있다면 factual 슬롯에 넣지 않는다. 실제 사진이 없다면 사실을 발명하지 말고 디자인의 힘으로 해결한다.
