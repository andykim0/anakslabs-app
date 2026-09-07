# 클론 사이트를 캔버스 에디터에 태울 수 있는가 (스파이크)

작성 기준: `main@b79f2ea`, 클론 스택은 미머지 브랜치 `feat/clone-w2-5a2`(`git show`로만 열람).

## 발주 전제의 정정 — 오늘은 "빈 캔버스"조차 일어나지 않는다

에디터는 `draftConfig ?? siteConfig ?? emptySiteConfig()`로 부팅한다
(`web/src/app/(dashboard)/dashboard/sites/[siteId]/editor/page.tsx:33-45`). 여기까지는 발주 내용대로다.
그러나 **클론에는 대응하는 `sites` 행이 아예 없다.** 캡처 바이트는 `clone_artifacts`(0065)와
`clone_resources.bytes`(0067)에 있고, 0066 코멘트가 그 이유를 못 박는다 —
"a clone is a captured third party's bytes, not a tenant site." 클론 생성 경로는
`lib/clone/repository.ts:189 createCloneArtifact()` 하나뿐이고 `sites`를 건드리지 않는다
(브랜치 전체에서 `from('sites')` 히트 0). 서빙도 Route Handler
`app/clone/[id]/[[...path]]/route.ts`가 저장된 바이트를 그대로 반환하며
`components/site-renderer/`를 import하지 않는다.

따라서 "클론이 빈 캔버스로 열린다"는 **아직 존재하지 않는 사고**다. 발생 조건은 하나뿐이다:
누군가 클론에 `sites` 행을 붙이는 순간. 그때 `site_config`/`draft_config`가 NULL이라
에디터는 `emptySiteConfig()`로 열린다.

발행이 그 빈 config를 덮어쓰는지도 확인했다. `emptySiteConfig()`는 `meta.locale`을 세팅하지
않고, `businessInfoRequiredForPublish`는 `locale !== 'en-US'`를 요구로 읽으므로 발행은
400 `BUSINESS_INFO_CONFIRM_REQUIRED` 또는 409 `BUSINESS_INFO_REQUIRED`에서 막힌다.
다만 이건 우연한 방어다 — 클론 시대의 config가 `locale:'en-US'`를 달면 게이트가 열린다.
그리고 데이터 손실은 애초에 오지 않는다: publish는
`sites.{site_config,status,domain,draft_expires_at,published_at}` 5개 컬럼만 쓰고
`clone_*`는 건드리지 않는다. **진짜 위험은 라우팅이다** — `domain` 할당과 `status='live'`가
그 호스트를 테넌트 렌더러로 보내 클론을 가린다.

## 오늘 mock 대시보드가 보여주는 것

`MOCK_MODE=1`로 시드 사이트(Summit Dental Studio, `dddddddd-…`)의 에디터를 열면
페이지 1(Home)·섹션 4(Hero/Services/About/Visit us, 요소 5/11/4/6)·인스펙터·"All changes saved"가
정상 렌더된다. 즉 오늘의 에디터는 **SiteConfig가 있는 사이트만** 안다.
증빙: `.../scratchpad/product/editor-mock.png`.

## 선택지

| # | 안 | 공수 | 리스크 |
|---|---|---|---|
| 1 | **가드**: 클론 출처 사이트를 감지해 에디터를 잠그고 운영자 편집요청 경로 안내 | S (1–2일) | 낮음. 단 감지 키가 **없다** — `sites`에 source/origin/FK 컬럼이 전무하므로 `clone_artifact_id` nullable 컬럼 1개 추가가 선행 필요 |
| 2 | **텍스트 노드 패치**: 캡처 바이트 위에서 문구 교체 | M–L | 중–높음. 리라이트 레이어는 **원칙적으로 re-serialize를 하지 않고**(`rewrite.ts:2-7`) 정규식만 쓴다. 임의 텍스트 교체 경로는 없고, 유일한 in-place 프리미티브 `retitleCloneShellBand`(`shell.ts:198`)는 authored 페이지용 셸에만 적용된다. 즉 "이미 지원한다"는 전제는 사실이 아니다 |
| 3 | **사실 에디터**(시간·전화·주소·수용보험) | M | 중. `nap.ts`가 이미 사실을 뽑지만 **요청마다 재계산이고 어디에도 저장되지 않는다**(`aeo.ts:750`). override 테이블·쓰기 경로가 없어 신설 필요. 수용보험은 클론 쪽에 데이터 자체가 없다(SiteConfig 전용: `ClinicInsuranceStrip`) |
| 4 | 캡처에서 SiteConfig 완전 추출 | XL | 비현실적. 좌표·테마·자산을 되짚어야 하고 실패가 조용하다 |

## 권고 — (1) 가드, 그 다음 (3)

편집 능력이 아니라 **파괴 가능성**이 지금의 문제다. 그리고 그 파괴는 아직 도달 불가능하므로,
비용은 가드 한 겹이면 충분하다. (2)는 전제가 틀렸으니 재견적 대상이고, (3)은 가드가 선 뒤
독립 제품 결정으로 다루면 된다.

### 수용 기준 (가드)

1. `sites.clone_artifact_id uuid null references clone_artifacts(id)` 추가 + 캡처 경로가 기록.
2. 에디터 페이지가 그 값이 있으면 캔버스를 **마운트하지 않고** 설명 화면을 렌더한다
   (빈 캔버스를 잠깐이라도 보여주지 않는다).
3. `PATCH /api/sites/[siteId]`와 `POST …/publish`가 클론 출처 사이트에 대해 409로 거절한다
   — UI 가드만으로는 부족하다(직접 호출 가능).
4. 위 3건을 고정하는 테스트, 그리고 **클론 아닌 사이트는 회귀 0**임을 보이는 테스트.
5. 안내 화면은 기존 운영자 큐로 보낸다. 단 `edit_requests.site_id`는 `sites(id)` NOT NULL FK
   (`0001_init.sql:93`)이므로, 큐 재사용에는 스키마 변경이 어차피 한 번 필요하다 — 이 사실을
   범위에 명시하고 시작한다.
