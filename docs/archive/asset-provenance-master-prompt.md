# [Opus 마스터 프롬프트] PR$-batch — 자산 출처·사실 슬롯 강제 시스템 v2

## “AI는 아트디렉션을 만들고, 고객이 제공·확인한 서버 등록 자산만 사실을 표현한다”

역할:
너는 다보임(AnaksLabs)의 Senior Asset Platform Engineer이자 AI Content Safety Engineer다.

저장소:

- `/Users/axxykim/Desktop/anakslabs/web`

이번 작업은 프롬프트 문구를 조금 강화하는 작업이 아니다.

목표는 이미지의 출처, 변환 이력, 소유권, 사실성 확인, 사용 슬롯을 1급 데이터로 만들고 다음 전체 경로에서 구조적으로 강제하는 것이다.

업로드
→ 외부 사이트 이미지 가져오기
→ AI 이미지 생성
→ 후보 생성
→ 이미지 풀
→ 슬롯 배정
→ SiteConfig 저장
→ 렌더링
→ 정적 export
→ 발행 감사
→ 레거시 데이터 처리

구현·테스트·마이그레이션까지 완료하라. 기획 문서나 타입 예시만 제출하지 마라.

---

## 0. 작업 시작 전 필수 조건

현재 motion-signatures 작업과 provenance 초안이 진행 중일 수 있다.

먼저 실행:

```bash
git status --short
git branch --show-current
```

다음 조건을 모두 확인하라.

- `feature/motion-signatures-v2` 작업이 완료·커밋·main 병합됨
- worktree가 clean
- 현재 main이 최신 통합 상태
- motion signature의 asset/provenance 계약이 확정됨

하나라도 충족하지 않으면 브랜치를 전환하거나 파일을 수정하지 말고 중단·보고하라.

조건이 충족된 경우에만:

```bash
git switch -c feature/asset-provenance
```

금지:

- dirty worktree에서 checkout/switch
- 기존 사용자 변경 포함 커밋
- destructive Git 명령
- 배포된 migration 파일 수정
- motion branch가 만든 provenance 계약을 무시하고 별도 시스템 신설
- `docs/demo-sprint-profiles.md` 수정

`AGENTS.md`를 먼저 읽고, Next.js 관련 코드를 수정하기 전 설치된 Next.js 문서를 확인하라.

심볼 또는 파일 위치가 예상과 다르면 line number를 신뢰하지 말고 현재 심볼을 검색하라. 동등한 현재 구현을 찾을 수 있으면 적응하고, 핵심 계약이 예상과 다르면 중단·보고하라.

---

## 1. 제품 원칙

기존 표현:

> 고객 업로드가 사실을 확립한다.

이 표현은 충분하지 않다. 파일을 업로드했다는 사실만으로 실제 사업 내용이나 사용 권리가 증명되지는 않는다.

최종 원칙:

> AI는 아트디렉션을 만든다. 고객이 제공하고 사실성·사용권을 확인한 서버 등록 자산만 사실 슬롯에 들어갈 수 있다.

세 가지 불변식:

### 1. 출처는 서버 권위적이다

- `origin`은 업로드/AI/import 서버 경로가 결정
- client가 `origin`을 선택하거나 덮어쓸 수 없음
- URL, 파일명, storage prefix, SurveyInput 배열 membership은 provenance가 아님
- 모든 새 자산은 권위적인 `assetId`를 가짐

### 2. 출처와 사용 역할을 분리한다

- `origin`은 자산의 속성
- `factual`/`atmospheric`/`decorative`는 자산이 사용되는 슬롯의 역할
- 같은 자산도 사용 위치에 따라 다른 정책 평가가 필요
- client가 `role: factual`을 보내는 것으로 허용하지 않음

### 3. 사실 슬롯은 fail-closed다

- origin 불명
- assetId 없음
- 소유권 불명
- 사용권 확인 없음
- 사실성 확인 없음
- generative edit
- AI generation
- 사이트/고객 불일치

위 조건 중 하나라도 있으면 사실 슬롯에 들어갈 수 없다.

---

## 2. 사실 콘텐츠와 AI 허용 범위

사실 슬롯 — 검증된 고객 자산만:

- 실제 음식
- 실제 메뉴
- 실제 판매 제품
- 실제 음료·디저트·빵
- 실제 매장·사업장·인테리어
- 직원·의사·변호사·강사·대표자
- 실제 로고
- 자격증·문서·증빙
- 포트폴리오 작업물
- 완성 프로젝트·시공 사례
- 고객 사례
- before/after 결과

AI 허용 — non-factual 슬롯만:

- 명백히 합성된 3D 브랜드 월드
- 명백한 일러스트·콜라주
- 추상 에디토리얼
- 색·빛·질감·재질·기하학
- 장식 배경
- 명백히 가상의 브랜드 세계
- 제품·사람·실제 장소·결과를 표현하지 않는 무드 자산

curated/system/demo 자산:

- atmospheric/decorative만 가능
- production factual 슬롯 금지

AI reference가 고객 업로드여도:

```text
customer upload
→ generative edit 또는 image-to-video
≠ factual customer asset
```

`referenceAssetId` 또는 `parentAssetIds`가 있다는 이유로 사실 자격을 상속하지 않는다.

---

## 3. 실사 이미지 정책

신규 생성 경로에서는 AI photorealistic generation을 제거한다.

금지:

- 업로드 없이 AI가 실제 같은 카페·매장·병원·사무실을 생성
- 업로드 없이 AI가 실제 같은 음식·빵·커피·제품을 생성
- 업로드 없이 AI가 직원·전문가·고객을 생성
- 업로드 없이 AI가 완성 프로젝트나 포트폴리오를 생성
- `photo`라는 이름으로 imaginary realistic interior를 생성
- “무드 공간”이라는 이유로 실제 사업장처럼 보이는 장소 생성

신규 `real_photo` 방향:

- 서버 등록 고객 자산 필수
- AI 이미지 생성 API 호출 없음
- 원본 픽셀을 사용하는 크롭·프레이밍·리사이즈·압축·색조정 허용
- CSS Ken Burns, parallax, mask, scroll animation 허용
- generative fill, outpainting, object replacement, beauty enhancement 금지
- 생성형 업스케일 금지
- generative image-to-video 결과는 factual로 취급하지 않음
- 사실 이미지를 움직일 때 정확성이 필요하면 원본 사진의 CSS 기반 motion 사용

업로드가 없으면 `real_photo`를 선택하거나 자동 추천하지 않는다.

대신 다음 중 업종에 맞는 방향을 추천:

- 3D brand world
- illustration/collage
- abstract editorial
- typography-led design

---

## 4. Canonical asset contract

현재 motion branch가 추가한 다음 표현을 먼저 조사하라.

- `customer-upload`
- `customer-provided`
- `ai-generated`
- `curated`
- `unknown`
- `MotionMediaProvenance`
- `CustomerAssetProvenance`
- `motion_asset_provenance`
- before/after asset registry

서로 다른 provenance enum을 병렬로 유지하지 마라.

하나의 canonical module과 migration adapter를 만든다.

권장 구조:

```ts
export type AssetOrigin =
  | 'customer_upload'
  | 'customer_import'
  | 'ai_generated'
  | 'curated'
  | 'system'
  | 'unknown';

export type AssetTransformation =
  | 'original'
  | 'deterministic_edit'
  | 'generative_edit';

export type AssetMediaKind =
  | 'image'
  | 'video'
  | 'svg';

export type AssetSubject =
  | 'product'
  | 'place'
  | 'person'
  | 'portfolio'
  | 'before_after'
  | 'logo'
  | 'document'
  | 'abstract';

export interface AssetRecord {
  id: string;
  clientId: string;
  mediaKind: AssetMediaKind;
  origin: AssetOrigin;
  transformation: AssetTransformation;
  parentAssetIds: string[];
  objectPath: string;
  publicUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  originalSourceUrl?: string;
  rightsAttestedAt?: string;
  factualAttestedAt?: string;
  personConsentAttestedAt?: string;
  createdAt: string;
}

export type AssetSlotRole =
  | 'factual'
  | 'atmospheric'
  | 'decorative';

export interface AssetUsage {
  assetId: string;
  siteId: string;
  pageId?: string;
  sectionId?: string;
  elementId?: string;
  slotKey: string;
  slotRole: AssetSlotRole;
  subject: AssetSubject;
}

export interface AssetRef {
  assetId: string;
  src: string;
}
```

중요:

- `role`은 `AssetRecord` 안에 넣지 않는다.
- factual eligibility를 client 저장 boolean으로 만들지 않는다.
- 서버 순수 함수로 매번 판정한다.
- URL은 표시 수단일 뿐 증거가 아니다.
- `publicUrl`이 있더라도 `assetId`가 없으면 신규 factual 경로에서 거부한다.

예:

```ts
evaluateAssetUsage({
  asset,
  usage,
  clientId,
  siteId,
  context,
})
```

factual 허용 조건:

- assetId가 서버 레지스트리에서 조회됨
- 현재 client 소유
- 허용된 site usage
- origin이 `customer_upload` 또는 조건을 충족한 `customer_import`
- transformation이 `generative_edit`가 아님
- `rightsAttestedAt` 존재
- `factualAttestedAt` 존재
- person subject이면 `personConsentAttestedAt` 존재
- 사용 context와 slot policy 일치

---

## 5. Generic asset registry

TypeScript interface만 추가하고 끝내지 마라.

모든 신규 production 자산을 저장하는 generic server registry가 필요하다.

필수:

- generic assets table
- client ownership
- storage object path
- authoritative public URL
- MIME
- dimensions
- origin
- transformation
- lineage
- attestations
- timestamps
- site usage relation

권장:

- `assets`
- `asset_usages`
- before/after evidence용 별도 extension/table

before/after 전용 테이블에 `caseId`와 `usageContext`가 필수라면 generic registry로 그대로 사용하지 마라.

기존 `motion_asset_provenance`가 이미 적용된 경우:

- 배포 migration을 수정하지 않음
- 후속 migration 생성
- generic asset record와 before/after evidence를 assetId로 연결
- 기존 before/after API 계약을 migration adapter로 보존

generic 자산은 고객이 소유한 여러 사이트에서 재사용 가능할 수 있으므로, 자산 소유와 site usage를 단일 `siteId` 필드 하나로 혼합하지 말고 usage relation을 우선 검토한다.

RLS 및 service-role 경계:

- authenticated 사용자는 자기 asset만 조회
- insert/update의 권위 필드는 server/service 경로만
- clientId와 auth user 관계 검증
- 다른 고객 assetId 참조 차단
- 공개 URL을 복사해 asset 소유권을 우회할 수 없어야 함

---

## 6. AssetRef를 전체 파이프라인에 전파

현재 URL-only 계약을 조사:

- `heroPhotoUrl`
- `storePhotoUrls`
- `ContentItem.photoUrl`
- `DesignCandidate.heroImageUrl`
- `ImageElement.src`
- `SectionBackground.image.src`
- `SectionBackground.video/poster`
- `imagePool: string[]`
- upload API `{ url }`
- AI generation `{ url }`

신규 경로는 `AssetRef`를 사용한다.

권장 신규 필드:

- `heroAsset`
- `storeAssets`
- `ContentItem.photoAsset`
- `DesignCandidate.heroAsset`
- `ImageElement.asset`
- `SectionBackground.image.asset`
- video/poster asset refs
- typed asset pools

legacy URL 필드는 읽기 호환을 위해 유지할 수 있지만:

- 신규 generation은 assetId 없이 저장하지 않음
- 신규 publish는 assetId를 서버에서 재조회
- config의 src가 registry publicUrl과 일치하는지 검증
- client가 assetId와 다른 src를 조합해도 거부
- URL 배열에 들어 있다는 사실로 customer provenance를 추론하지 않음

현재 motion scene의 `provenanceFor(src, survey)` 같은 URL-membership 추론이 있으면 제거하고 server-resolved `AssetRef`를 사용한다.

모든 신규 upload 응답:

```ts
{
  url,
  assetId,
  asset
}
```

기존 `{url}` 소비자는 migration 기간 동안 호환하되 신규 온보딩은 assetId를 저장한다.

---

## 7. 업로드·import·AI 서버 스탬프

### A. Customer upload

서버가 스탬프:

- `origin: customer_upload`
- `transformation: original`
- clientId
- objectPath
- MIME
- dimensions
- createdAt

client가 origin을 보내더라도 무시하거나 schema에서 제거한다.

factual 사용 전에 고객 확인:

- 실제 본인 사업/상품/사람/공간을 나타냄
- 게시 권한 보유
- 사람 사진이면 필요한 동의 보유

### B. Customer import

현재 기존 사이트/온라인 채널에서 이미지를 가져와 우리 storage에 재업로드하는 경로는 `customer_upload`가 아니다.

서버가 스탬프:

- `origin: customer_import`
- originalSourceUrl
- `transformation: original`
- clientId
- objectPath
- dimensions

factual 허용 전:

- 해당 원본 채널/이미지 사용 권리 확인
- 실제 사업 콘텐츠라는 사실성 확인

단순히 우리 storage에 복사되었다는 이유로 factual 허용하지 않는다.

### C. AI generation

AI provider 호출 경로가 서버에서 스탬프:

- `origin: ai_generated`
- `transformation: generative_edit` 또는 original AI output에 해당하는 canonical 값
- parentAssetIds
- generator metadata 또는 prompt hash가 필요하면 서버 전용으로 기록

모든 AI 결과는 assetId를 반환한다.

AI generation request에서 client는 origin을 보내지 않는다.

API는 `slot intent`, `style direction`, `context`만 받고 서버가 정책을 결정한다.

factual slot 대상으로 AI 호출을 요청하면 provider 호출 전에 거부:

- HTTP 422
- stable policy error code
- 한국어 사용자 안내

403은 권한/entitlement 거부에만 사용한다.

---

## 8. 슬롯 정책 레지스트리

section type 하나만 보고 판단하지 마라.

다음을 조합해 slot policy를 결정:

- purposeId
- templateId
- industry class
- section.type
- section variant
- element kind
- semantic slot key
- intended subject

예:

- `menu:food` image → factual/product
- `menu:services` result image → factual/product 또는 result
- team profile → factual/person
- `gallery:works` → factual/portfolio
- `cases:projects` → factual/portfolio
- before/after → factual/before_after
- logo → factual/logo
- actual store gallery → factual/place/product
- abstract hero background → atmospheric/abstract
- decorative shape/media layer → decorative/abstract

`gallery` 전체를 무조건 factual 또는 decorative로 처리하지 않는다. variant와 purpose를 본다.

Hero:

- `real_photo`를 선택하고 검증 upload를 사용 → factual
- AI 3D/illustration/abstract → atmospheric/decorative
- AI hero의 alt/caption/copy가 “우리 실제 매장/제품”이라고 암시하면 안 됨

하나의 단일 정책 모듈을 assignment, sanitizer, renderer, publish audit가 공유한다.

---

## 9. 이미지 스타일 UI 재설계

기존 `CandidateStyle`:

- `photo`
- `3d_render`
- `illustration`

을 그대로 의미 변경해 혼란을 만들지 말고, 신규 이미지 방향 타입을 검토한다.

권장:

```ts
type ImageDirectionId =
  | 'real_photo'
  | '3d_brand_world'
  | 'illustration_collage'
  | 'abstract_editorial';
```

UI:

### 1. 실사 사진 — 실제 사진 필요

- 고객 업로드/검증 자산 사용
- AI 재생성 없음
- 실제 사업·상품을 가장 정확히 보여주는 방향
- 사용 가능한 적절한 upload가 없으면 disabled

안내:

> 사실적인 이미지는 실제 사업을 보여줘야 합니다. 실제 사진을 올리시거나, 명백히 예술적인 AI 방향을 선택하세요.

### 2. 3D 브랜드 월드

- 명백히 stylized
- 실제 제품·매장·사람·결과로 오인되지 않음
- 브랜드 팔레트와 형태에서 출발
- generic 3D clipart 금지

### 3. 일러스트·콜라주

- 명백히 예술적
- 실제 사업을 다큐멘트하는 척하지 않음
- 가짜 인물·상품·실적 금지

### 4. 추상 에디토리얼

- 형태·재질·빛·질감·타이포
- 실제 제품·사람·장소·결과 생성 금지
- 업로드가 없는 로컬 업종의 기본 안전 추천 후보

기본 추천:

- 업로드가 없으면 `real_photo`가 기본값이 될 수 없음
- 업종과 tone에 따라 3D/illustration/abstract 중 추천
- 카페·병원·뷰티라고 자동 photo 추천하지 않음

Legacy mapping:

- legacy `photo` + verified upload → `real_photo`
- legacy `photo` + upload 없음 → 신규 regeneration 시 `abstract_editorial` 또는 업종별 stylized 방향으로 강등
- 강등 로그와 사용자 안내
- 기존 published artifact를 조용히 재작성하지 않음

후보 생성·review step·요약 문구도 새 의미와 일치시킨다.

---

## 10. AI 프롬프트와 생성 경로

신규 generation에서 `buildPhotorealisticPhotoPrompt` 또는 동등한 imaginary realistic environment 경로를 호출하지 않는다.

`real_photo`:

- Gemini 이미지 생성 호출 0회
- 고객 AssetRef를 후보/히어로에 그대로 사용
- 디자인 후보는 같은 실제 사진에 테마·타이포·레이아웃만 다르게 적용

AI directions:

- 3D, illustration, abstract만
- 실제 product/person/place/portfolio/result/before-after 요청 금지
- 구체적인 주문 대상 생성 금지
- 로고·브랜드 텍스트 생성 금지
- 고객 팔레트·tone·layout role을 아트디렉션에 사용
- 자유 업종 문자열을 사실 피사체 요청으로 변환하지 않음
- arbitrary user edit prompt가 factual subject를 우회 요청하지 못하게 함

AI output이 reference customer asset을 사용하더라도:

- ai_generated/generative_edit
- atmospheric/decorative만
- factual eligibility 상속 금지

비전 분류기:

- 주 방어선이 아님
- 선택적 defense-in-depth
- 없더라도 AI가 factual 슬롯에 들어갈 수 없어야 함
- 존재하는 경우 classifier 실패가 factual 승격으로 이어지면 안 됨
- rejected/pending 상태를 명시적으로 관리
- 사용자가 생성 결과를 확인·재생성할 수 있게 함

---

## 11. Provenance-aware assignment

현재 string URL imagePool을 customer + AI로 섞은 뒤 슬롯에 순환 배정하는 구조를 제거하거나 legacy 경로로 격리한다.

신규 구조:

```text
typed asset pools
→ slot policy
→ eligible asset selection
→ SiteConfig
→ sanitizer
→ renderer
→ publish audit
```

예:

```ts
interface TypedAssetPool {
  factual: AssetRef[];
  atmospheric: AssetRef[];
  decorative: AssetRef[];
}
```

assignment invariants:

- AI asset → factual slot 0
- unknown asset → factual slot 0
- curated/system → factual slot 0
- generative derivative → factual slot 0
- 다른 client asset → 모든 slot 0
- factual slot은 subject/context 일치
- 실사 hero는 검증된 customer asset
- missing factual media는 AI pool로 충전하지 않음
- asset reuse/cost logic도 AssetRef 기준

renderer에서 거부하는 것은 마지막 방어다. 잘못된 asset을 먼저 SiteConfig에 배정하지 마라.

---

## 12. Missing factual media fallback

업로드가 없는 사실 슬롯에 AI 이미지를 대신 넣지 않는다.

정확한 fallback:

- 메뉴 사진 없음 → 텍스트 중심 메뉴 카드
- 팀 사진 없음 → 텍스트 중심 프로필
- 포트폴리오 이미지 없음 → 이미지 없는 프로젝트 설명 또는 업로드 요청
- 실제 매장 사진 없음 → 타이포 중심 hero
- 시공 사례 없음 → 사례 이미지 생략
- before/after 없음 → 비교 기능 비활성
- 로고 없음 → 텍스트 워드마크

허용되는 장식:

- CSS gradient
- shape
- border
- typography
- palette-derived surface
- 명백한 abstract 3D/illustration
- premium motion

AI 장식은 factual slot의 대체 이미지가 아니라 별도 decorative layer/container여야 한다.

Semantic rules:

- decorative image는 `alt=""`
- meaningful AI art는 “추상 브랜드 일러스트”처럼 사실 주장 없는 alt
- AI asset caption이 “우리 매장”, “대표 메뉴”, “실제 시공” 등을 암시하면 안 됨

---

## 13. Real-photo motion과 AI video

고객 업로드 사실 이미지를 그대로 움직이는 경우:

허용:

- CSS transform
- Ken Burns
- parallax
- clip reveal
- scroll scrub over original media
- opacity/mask
- deterministic crop/resize/compression

생성형 video/image edit:

- factual로 취급하지 않음
- origin/transform lineage 기록
- original customer photo는 factual poster/source로 보존
- 생성 video를 실제 제품·매장·결과의 증거처럼 사용하지 않음
- before/after에는 절대 사용하지 않음

`FAITHFUL_PHOTO_MOTION_DIRECTIVE` 같은 prompt는 보조 안전장치일 뿐, 생성 결과의 사실성을 보장하지 않는다.

정확한 피사체 보존이 필요한 factual 경험에서는 CSS 기반 motion을 우선한다.

---

## 14. Before/after 특수 게이트

motion branch의 before/after 계약을 유지·통합한다.

필수:

- 두 개의 authoritative assetId
- 같은 실제 case
- 현재 client 소유
- 허용된 site usage
- customer_upload 또는 정책상 허용된 원본
- AI 생성 아님
- generative edit 아님
- rights attestation
- same-case attestation
- beauty/remodeling만
- medical/clinic/dental/Korean medicine 차단
- “실제 사례” 라벨 강제
- Veo/AI image generation 호출 0

generic asset registry와 before/after evidence를 연결하되 특수 검증을 약화하지 않는다.

URL 두 개만으로 before/after를 만들 수 없어야 한다.

---

## 15. Renderer·server serving·publish audit

Renderer는 client-provided provenance string을 권한 증거로 신뢰하지 않는다.

서버 저장/서빙 경계에서 asset usage를 resolve하고 sanitizer 결과를 renderer에 전달한다.

방어:

- factual usage에 invalid asset → text-only/static fallback
- src와 authoritative registry URL 불일치 → 거부
- assetId 미조회 → unknown
- wrong client/site → 거부
- generative derivative → factual 거부
- AI asset → factual 거부

Publish audit:

하나라도 위반하면 신규 발행/재발행 차단:

- factual slot에 AI
- factual slot에 unknown
- assetId spoof
- URL mismatch
- owner/site mismatch
- missing attestation
- portfolio/team/product/place provenance 위반
- before/after 검증 실패
- medical before/after
- AI caption/alt가 사실을 주장

stable error code와 사용자 조치 안내를 제공한다.

예:

- `ASSET_ID_REQUIRED`
- `ASSET_NOT_FOUND`
- `ASSET_OWNER_MISMATCH`
- `ASSET_URL_MISMATCH`
- `FACTUAL_ATTESTATION_REQUIRED`
- `RIGHTS_ATTESTATION_REQUIRED`
- `PERSON_CONSENT_REQUIRED`
- `AI_ASSET_IN_FACTUAL_SLOT`
- `GENERATIVE_DERIVATIVE_IN_FACTUAL_SLOT`
- `UNKNOWN_ASSET_IN_FACTUAL_SLOT`
- `BEFORE_AFTER_POLICY_REJECTED`

---

## 16. Migration policy

절대 금지:

- unknown 자산을 atmospheric로 조용히 재분류
- URL prefix만 보고 customer upload 확정
- `storePhotoUrls` membership으로 provenance 확정
- 우리 storage에 있다는 이유로 customer upload 확정
- AI candidate URL을 customer asset으로 승격

재구성 가능한 경우:

- authoritative upload record
- AI generation record
- import record
- storage object metadata와 신뢰할 수 있는 서버 로그

위 근거로만 origin 복구.

복구 불가:

- `origin: unknown` 유지
- factual slot에서 fail-closed
- editor remediation 안내
- 새 save/publish/republish 차단 또는 text-only fallback

기존 live 처리:

- dynamic hosted rendering은 안전 fallback 적용
- 이미 생성된 immutable static artifact를 자동 변조하지 않음
- 관리 화면에 remediation issue 기록
- 다음 republish 전에 해결 강제
- before/after 및 의료 관련 고위험 위반은 별도 즉시 차단 정책 적용

모든 migration decision을 구조화 로그로 남긴다.

배포된 migration 파일은 수정하지 말고 새 migration을 추가한다.

---

## 17. Phase 계획

### PR0 — 정찰, 통합 계획

보고 후 핵심 계약이 일치하면 자동으로 다음 Phase 진행.

조사:

- 현재 motion provenance 계약
- before/after registry/table
- upload API
- import ingest
- AI storage
- heroPhotoUrl/storePhotoUrls
- ContentItem.photoUrl
- DesignCandidate.heroImageUrl
- ImageElement/SectionBackground
- imagePool과 slot assignment
- photorealistic generation 경로
- edit-request image generation
- static export
- publish audit
- legacy read normalization
- migration 배포 여부

### PR1 — canonical generic asset registry

- canonical enums
- AssetRecord
- AssetUsage
- generic DB/service
- RLS
- owner/site verification
- before/after extension integration
- server stamping

커밋:

```text
feat(assets): canonical asset registry와 서버 provenance 스탬프
```

### PR2 — AssetRef 전체 전파

- upload/import/AI response
- SurveyInput
- content items
- candidates
- typed pools
- SiteConfig
- image elements/backgrounds
- static export
- legacy URL adapters

커밋:

```text
feat(assets): AssetRef를 생성·저장·렌더 경로에 전파
```

### PR3 — slot policy registry

- purpose/template/variant/slot mapping
- factual eligibility evaluator
- assignment policy
- alt/caption semantics
- single source shared by sanitizer/publish

커밋:

```text
feat(assets): 사실·무드·장식 슬롯 정책 레지스트리
```

### PR4 — image direction UI

- real_photo upload required
- 3D brand world
- illustration/collage
- abstract editorial
- no-upload default redesign
- accurate preview/review copy
- legacy mapping

커밋:

```text
feat(onboarding): 출처 기반 이미지 방향 선택 재설계
```

### PR5 — AI generation and assignment enforcement

- no new photoreal AI route
- factual AI request rejected before provider call
- all AI output registered
- generated lineage
- provenance-aware pool
- no factual AI fill
- optional output classifier seam

커밋:

```text
feat(ai): AI 아트디렉션 전용 생성과 사실 슬롯 차단
```

### PR6 — renderer, fallback, publish audit

- text/typography fallback
- decorative AI separation
- server-resolved usage
- renderer defense
- static export
- publishing blockers
- stable error codes

커밋:

```text
feat(render-publish): provenance 강제와 정직한 미디어 폴백
```

### PR7 — migration and exhaustive tests

- canonical enum migration
- legacy URL handling
- unknown fail-closed
- current live/republish policy
- invariant tests
- integration tests
- regression tests

커밋:

```text
test(assets): asset provenance·사실 슬롯 불변식 회귀
```

---

## 18. 필수 테스트

### Server authority

- client origin 입력 무시/거부
- upload는 customer_upload로 서버 등록
- import는 customer_import로 서버 등록
- AI는 ai_generated로 서버 등록
- assetId 없는 신규 factual 요청 거부
- 공개 URL 복사로 소유권 우회 불가
- 다른 client assetId 거부
- 다른 site usage 거부
- src/registry URL mismatch 거부

### Factual eligibility

- factual slot에 ai_generated 0
- factual slot에 unknown 0
- factual slot에 curated/system 0
- generative derivative factual 승격 금지
- customer parent가 있어도 AI child factual 불가
- missing rights attestation 거부
- missing factual attestation 거부
- person consent 누락 거부

### Generation

- real_photo + verified upload → Gemini 호출 0
- real_photo + upload 없음 → UI/API 차단
- 신규 generation에서 photorealistic environment prompt 호출 0
- AI factual request는 provider 호출 전 422
- 3D/illustration/abstract만 AI 생성
- AI output asset registry 기록
- arbitrary edit prompt로 product/person/place 우회 불가

### Assignment

- typed pool이 AI를 menu/team/portfolio/cases/before-after에 배정하지 않음
- gallery variant에 따라 factual/decorative 판정
- upload 부족을 AI factual fill로 채우지 않음
- missing factual media는 text-only
- decorative AI는 별도 layer
- alt/caption이 실제 사업을 암시하지 않음

### Import

- 우리 storage 재업로드만으로 customer_upload 승격 불가
- originalSourceUrl 기록
- rights/factual attestation 전 factual 불가

### Before/after

- URL-only 거부
- AI asset 거부
- generative edit 거부
- owner/site mismatch 거부
- case mismatch 거부
- rights/same-case 누락 거부
- medical 차단
- verified beauty/remodeling 허용
- “실제 사례” label
- AI/Veo 호출 0

### Migration

- unknown → atmospheric 자동 강등 금지
- URL prefix 기반 신뢰 금지
- authoritative record만 복원
- legacy read는 깨지지 않음
- 신규 republish는 정책 위반 차단
- immutable legacy artifact 처리 로그

### Compatibility

- motion signature previews 유지
- hosted/static export parity
- existing no-motion sites 유지
- mock mode asset registry 지원
- upload 기존 `{url}` 소비 경로 migration compatibility
- existing tests regression 없음

---

## 19. 각 Phase 완료 게이트

각 Phase에서 먼저 focused test를 실행한 뒤 전체 게이트:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
git diff --check
```

모두 통과한 경우에만 해당 Phase 커밋.

커밋에는 해당 Phase에서 직접 수정한 파일만 포함한다.

테스트를 삭제·skip·완화해 통과시키지 않는다.

기존 실패가 있으면 이번 변경과 무관하다는 증거를 제시하고 중단·보고한다.

---

## 20. 완료 보고

최종 보고:

1. PR0 정찰 결과
2. 기존 motion provenance와 통합 방식
3. canonical AssetRecord/AssetUsage 계약
4. DB migration과 RLS
5. 서버 origin stamping 증거
6. AssetRef 전파 경로
7. factual slot registry
8. 이미지 방향 UI
9. photoreal AI 신규 경로 제거 증거
10. AI generation registration
11. typed asset assignment
12. renderer fallback
13. publish audit
14. before/after 통합
15. legacy migration 정책
16. Phase별 커밋
17. 테스트 수 변화
18. 전체 명령 결과
19. 법무 검토가 필요한 정책·카피
20. 남은 기술 부채

완료 기준은 “provenance 타입을 추가했다”가 아니다.

완료 기준:

- 모든 신규 production asset에 authoritative assetId가 있다.
- client가 provenance를 위조할 수 없다.
- AI는 factual 슬롯에 들어갈 수 없다.
- 업로드 없는 real_photo는 존재하지 않는다.
- 신규 AI photorealistic business scene 생성 경로가 없다.
- 고객 업로드의 generative derivative가 factual로 승격되지 않는다.
- missing factual media는 정직한 text/typography fallback을 사용한다.
- before/after 특수 게이트가 유지된다.
- legacy unknown이 조용히 신뢰되지 않는다.
- 저장·렌더·정적 export·발행 전체가 같은 정책을 강제한다.

주의:

- 이 시스템이 표시광고법 준수를 보장한다고 주장하지 마라.
- 고객-facing 확인 문구와 의료·전후 정책은 출시 전 법무 검토 대상으로 표시하라.
- 비전 분류기는 선택적 defense-in-depth다.
- 새로운 결제/과금 시스템은 만들지 마라.
- `docs/demo-sprint-profiles.md`를 수정하지 마라.
