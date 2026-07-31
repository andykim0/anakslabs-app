# 홈 구성 유형군 재정의 — 결정적 규칙 + 26곳 전수 재분류

작성일 2026-07-31 · 작성자 us-survey-aesthetic · 신규 사이트 방문 0 · 집계 전부 Python 카운트

## 결론 요약

기존 `A/B/C` 3군은 **재현 불가**였다(수기 판정 15곳 중 6곳 불일치). 원인을 규칙 탐색으로 특정한 결과:

- **A와 B는 단 하나의 지표로 완벽히 갈린다** — `trust`+`reviews` 토큰 합. 기존 A 7곳은 전부 ≤1, 기존 B 4곳은 전부 ≥2로 **겹침 0, 분리 정확도 11/11**.
- **C는 군이 아니라 잔여물이다.** 구성 코드의 어떤 조합으로도 표현되지 않는다(아래 3.2에서 입증).

따라서 **3군이 아니라 2군으로 확정**한다. C는 해체한다.

## 1. 규칙 정의 (결정적)

**입력**: 홈 구성 코드 1개. **출력**: `R` 또는 `S`. 같은 코드에 두 값이 나올 수 없다.

```
0) 정규화: 코드 끝의 other(푸터) 토큰이 있으면 1개 제거한다.
           (치과만 푸터를 블록으로 코딩했으므로 세그먼트 간 공정성을 위해 제거. 해당 4곳)
1) t = 코드 내 `trust` 토큰 수 + `reviews` 토큰 수
2) t >= 2  →  R (신뢰반복형)
   t <= 1  →  S (단일경로형)
```

- 괄호 안 설명(`other(블로그)` 등)은 **읽지 않는다.** 토큰 이름만 센다.
- 판정 불가 코드 없음 → **미분류 0곳 (0%)**.

**유형 뜻**
- **R (신뢰반복형)** — 후기·신뢰 블록을 페이지 전체에 2회 이상 분산 배치. 길게 설득하는 구조.
- **S (단일경로형)** — 신뢰 블록을 0~1회만 두고 한 번에 훑게 하는 구조.

## 2. 26곳 전수 재분류

| # | 사이트 | 진료과 | 블록 | `trust`+`reviews` | **유형** | 기존 판정 | 일치 |
|---:|---|---|---:|---:|:-:|:-:|:-:|
| 1 | thegleamery | 치과 | 15 | **3** | **R** | — | — |
| 2 | advancedperioatl | 치과 | 11 | **2** | **R** | — | — |
| 3 | docmac | 치과 | 7 | **2** | **R** | — | — |
| 4 | aventuradentalarts | 치과 | 9 | **1** | **S** | — | — |
| 5 | grandstreetdental | 치과 | 9 | **1** | **S** | — | — |
| 6 | zen.dentist | 치과 | 9 | **1** | **S** | — | — |
| 7 | statenislandoralsurgery | 치과 | 12 | **1** | **S** | — | — |
| 8 | villagedentaldtc | 치과 | 10 | **1** | **S** | — | — |
| 9 | fornidental | 치과 | 13 | **1** | **S** | — | — |
| 10 | dentologie | 치과 | 8 | **0** | **S** | — | — |
| 11 | thetoothco | 치과 | 7 | **0** | **S** | — | — |
| 12 | discmdgroup | 정형 | 10 | **3** | **R** | B | O |
| 13 | osmsgb | 정형 | 10 | **2** | **R** | C | C해체→R |
| 14 | seancallowaymd | 정형 | 5 | **1** | **S** | A | O |
| 15 | midorthoneuro | 정형 | 6 | **1** | **S** | A | O |
| 16 | goldenstateortho | 정형 | 9 | **1** | **S** | C | C해체→S |
| 17 | syracuseherniacenter | 정형 | 8 | **1** | **S** | A | O |
| 18 | modernorthopedics | 정형 | 9 | **0** | **S** | A | O |
| 19 | orthospinecenters | 정형 | 6 | **0** | **S** | A | O |
| 20 | maloneyshamievision | 에스테틱 | 18 | **5** | **R** | B | O |
| 21 | millercosmeticsurgery | 에스테틱 | 13 | **4** | **R** | B | O |
| 22 | carencampbellmd | 에스테틱 | 11 | **2** | **R** | B | O |
| 23 | drmadnani | 에스테틱 | 9 | **1** | **S** | C | C해체→S |
| 24 | benjamineye | 에스테틱 | 8 | **1** | **S** | C | C해체→S |
| 25 | parkcitydermatology | 에스테틱 | 7 | **0** | **S** | A | O |
| 26 | moderndermct | 에스테틱 | 6 | **1** | **S** | A | O |
### 구성 코드 전문 (푸터 정규화 후)

| 사이트 | 유형 | 구성 코드 (푸터 정규화 후) |
|---|:-:|---|
| thegleamery | **R** | `hero→services→about→gallery→trust→other(장비)→services→other(진행 단계)→services→gallery→reviews→services→trust→insurance→faq` |
| advancedperioatl | **R** | `hero→about→about→services→trust→other(B2B)→reviews→booking→faq→location→other(의뢰 안내)` |
| docmac | **R** | `hero→about→services→trust→about→reviews→booking` |
| aventuradentalarts | **S** | `hero→about→services→other(선언형 인터스티셜)→other(장비·기술)→providers→reviews→other(선언형 인터스티셜)→booking` |
| grandstreetdental | **S** | `hero→about→gallery→beforeafter→reviews→services→other(의료진 페이지 유도)→gallery→booking` |
| zen.dentist | **S** | `hero→about→services→other(장비·기술)→gallery→other(편의 어메니티)→reviews→location→booking` |
| statenislandoralsurgery | **S** | `hero→booking→gallery→providers→services→services→gallery→services→other(미상)→reviews→faq→location` |
| villagedentaldtc | **S** | `hero→about→about→reviews→services→other(상시 혜택)→insurance→location→gallery→booking` |
| fornidental | **S** | `hero→services→booking→about→services→beforeafter→reviews→gallery→providers→insurance→faq→location→booking` |
| dentologie | **S** | `hero→services→other(미상)→insurance→location→other(미상)→services→faq` |
| thetoothco | **S** | `hero→about→booking→providers→gallery→gallery→services` |
| discmdgroup | **R** | `hero→about→other(케어 프로세스)→services→other(통증 부위 선택)→trust→reviews→other(콘텐츠·전자책 허브)→trust→booking` |
| osmsgb | **R** | `hero→trust→location→about→other(통증 부위 선택)→providers→reviews→other(커뮤니티 프로그램)→other(고용주 프로그램)→videos` |
| seancallowaymd | **S** | `hero→providers→services→booking→reviews` |
| midorthoneuro | **S** | `hero→other(제휴 앱 배너)→videos→services→reviews→location` |
| goldenstateortho | **S** | `hero→other(공지 밴드)→about→services→videos→reviews→other(환자 교육 센터)→location→booking` |
| syracuseherniacenter | **S** | `hero→reviews→providers→services→other(로봇수술 기술)→insurance→location→booking` |
| modernorthopedics | **S** | `hero→other(3분할 진입 카드)→about→other(장식 다크 밴드)→services→other(공백 다크 밴드)→providers→insurance→location` |
| orthospinecenters | **S** | `hero→other(4분할 진입 타일)→about→services→other(블로그)→location` |
| maloneyshamievision | **R** | `hero→trust→about→trust→services→providers→videos→reviews→about→faq→reviews→services→trust→about→services→other(비용 계산기)→insurance→booking` |
| millercosmeticsurgery | **R** | `hero→about→services→videos→about→providers→trust→reviews→trust→trust→other(소셜 피드)→other(블로그)→booking` |
| carencampbellmd | **R** | `hero→about→trust→services→providers→reviews→other(2차 히어로)→events→events→other(블로그)→videos` |
| drmadnani | **S** | `hero→providers→videos→about→trust→providers→gallery→about→booking` |
| benjamineye | **S** | `other(뉴스 티커)→hero→other(블로그)→about→reviews→videos→other(옵티컬 리테일)→booking` |
| parkcitydermatology | **S** | `hero→providers→about→services→events→insurance→about` |
| moderndermct | **S** | `hero→about→services→providers→reviews→booking` |
---

## 3. 재현성 검증

### 3.1 규칙 vs 기존 수기 판정

기존 판정이 있는 곳은 **15곳**(정형 8 + 에스테틱 7). 치과 11곳은 원 리포트에 유형군이 없어 대조 불가.

| 기존 판정 | 곳수 | `trust`+`reviews` 값 | 규칙 결과 | 일치 |
|---|---:|---|---|---|
| **A** | 7 | `0,0,0,1,1,1,1` — 전부 ≤1 | 전부 **S** | **7/7 (100%)** |
| **B** | 4 | `2,3,4,5` — 전부 ≥2 | 전부 **R** | **4/4 (100%)** |
| C | 4 | `1,1,1,2` | S 3 · R 1 | 해체 (아래) |

**A와 B는 겹치는 값이 하나도 없다.** A 최대값 1 < B 최소값 2로 임계가 데이터에 자연히 존재한다. 임계를 내가 고른 게 아니라 분포가 비워둔 자리다.

C 4곳을 제외하면 **일치율 11/11 = 100%**다. 앞서 보고한 40% 불일치는 전부 C에서 나온 것이었다.

### 3.2 C군이 왜 규칙으로 표현되지 않는가 — 개별 판정

| 사이트 | 기존 | `t+r` | `other` 비율 | `other()` 라벨 | 판정 |
|---|:-:|---:|---:|---|---|
| benjamineye | C | 1 | 38% | 뉴스 티커 · 블로그 · 옵티컬 리테일 | 비율로는 잡히나 |
| osmsgb | C | 2 | 30% | 통증 부위 선택 · 커뮤니티 · 고용주 프로그램 | `t+r=2`라 R과 충돌 |
| goldenstateortho | C | 1 | 22% | 공지 밴드 · 환자 교육 센터 | 비율 미달 |
| **drmadnani** | C | 1 | **0%** | **없음** (`gallery` 1개) | **`other` 자체가 0** |

**규칙이 틀린 게 아니라 수기 판정이 틀렸다.** 근거:

- C의 내 원래 정의는 "홈이 하위 콘텐츠(갤러리·블로그·리테일·프로그램)로 보내는 관문"이었다. 이건 **`other()` 괄호 안 라벨의 의미**를 읽어야 성립한다.
- drmadnani는 `other`가 **0개**인데도 C로 판정했다. 근거는 `gallery` 토큰 1개를 "갤러리로 보내는 관문"으로 해석한 것이다. **같은 성질을 어떤 곳은 `other`로, 어떤 곳은 `gallery`로 세고 있었다** — 정의가 애초에 일관적이지 않았다.
- 즉 C는 구성 코드가 담지 않는 **의미 정보(라벨 텍스트)에 의존**한다. 어휘 15종에 `content`/`blog` 같은 토큰이 새로 생기지 않는 한 코드에서 도출될 수 없다.

**조치**: C를 해체하고 4곳을 규칙대로 재배치한다 — osmsgb → R, benjamineye·goldenstateortho·drmadnani → S.

> C를 되살리려면 **규칙이 아니라 어휘를 고쳐야 한다.** 현재 `other()` 43회(22/26곳)가 최다 토큰인 상황이라, 콘텐츠 성격 블록을 담을 토큰 신설은 별도 검토 대상이다. 다만 이번 과제 범위 밖이므로 제안만 남긴다.

### 3.3 미분류

**0곳 (0%)**. 26개 코드 전부 결정적으로 분류됐다.

---

## 4. 군 수 — 3군이 아니라 2군

지시하신 대로 3군에 억지로 맞추지 않고 데이터가 가리키는 대로 보고한다.

### 4.1 분포

| 유형 | 전체 26 | 치과 11 | 정형 8 | 에스테틱 7 |
|---|---:|---:|---:|---:|
| **R 신뢰반복형** | **8 (31%)** | 3 | 2 | 3 |
| **S 단일경로형** | **18 (69%)** | 8 | 6 | 4 |

세 진료과 모두 S가 다수다. 진료과별 R 비율은 27% / 25% / 43%로, **유형은 진료과에 크게 종속되지 않는다** — 진료과와 독립된 축으로 쓸 수 있다는 뜻이다.

### 4.2 3군을 유지할 수 없는 이유 (수치)

- 3군 규칙을 격자 탐색(임계 24조합)한 최댓값이 **12/15 (80%)**였고, 그 최적해에서도 불일치 3건이 **전부 C**였다.
- 반면 2군은 대조 가능한 11곳에서 **11/11 (100%)**.
- C 4곳의 특징값이 `t+r` 1~2, `other` 0~38%로 **다른 두 군의 범위와 완전히 겹친다.** 별도 군으로 떼어낼 구조적 근거가 없다.

### 4.3 4군 가능성도 검토했다 — 기각

2차 축으로 **길이**(블록 수 ≥10 장문 / <10 단문)를 걸어 2×2를 만들어봤다.

| 셀 | 곳수 | 판정 |
|---|---:|---|
| R · 장문 | 7 | |
| R · 단문 | **1** | **n<3 봉인** |
| S · 단문 | 15 | |
| S · 장문 | 3 | |

**길이는 신뢰반복과 강하게 상관돼 독립 축이 아니다** — R의 88%(7/8)가 장문, S의 83%(15/18)가 단문이다. `R·단문` 칸이 1곳뿐이라 n<3 봉인 대상이고, 4군은 성립하지 않는다.

닫는 블록도 후보로 봤으나 `booking` 13 · `location` 5 · 나머지 8종에 1~2곳씩 흩어져 군을 만들지 못한다.

**결론: 2군이 데이터가 지지하는 최대 해상도다.**

---

## 5. 엔진 반영 권고

### 5.1 쓸 수 있게 된 것

유형군은 이제 **결정적·재현 가능**하므로 축으로 쓸 수 있다. 단 **2값 축**이다.

### 5.2 데모 4~5안이 목표라면 유형군만으로는 부족하다

유형군이 2값이므로 후보안은 2개까지만 나온다. 나머지 변주는 **이미 검증된 다른 축**에서 가져와야 한다.

| 축 | 값 | 검증 상태 |
|---|---|---|
| **유형군** | R / S | **결정적, 11/11 재현** (이 문서) |
| **진료과** | `gallery`·`beforeafter` 유무 | 검증됨 — 치과 전용(gallery 7/11 vs 정형 0/8) |
| **규모** | `location` 유무 | 검증됨 — 네트워크 8/10 vs 단일원장 2/6, 두 세그먼트 재현 |

이 3축 조합(2×2×2)이면 후보안 4~5개를 **전부 검증된 근거 위에서** 만들 수 있다. 유형군 하나를 3~4값으로 쪼개려 하는 것보다 이 조합이 안전하다.

### 5.3 여전히 넣으면 안 되는 것

- **기존 A/B/C 라벨** — 폐기한다. 특히 C는 정의 자체가 비일관적이었다.
- **치과 11곳의 "기존 판정"** — 애초에 없었다. 이 문서의 R/S는 규칙 적용값이지 수기 판정이 아니다.
- 2×2 중 **`R·단문` 셀(1곳)** — n<3 봉인.

### 5.4 한계

- 규칙은 **`trust`/`reviews` 토큰 부여가 세그먼트 간 일관적이라는 전제** 위에 선다. 이 두 토큰은 `videos`·`events`와 달리 세 리포트가 같은 기준(후기·인증·언론·수상 블록)으로 부여했음을 코드와 원문 대조로 확인했으나, 부여 시점의 판단은 여전히 사람 몫이다.
- 푸터 정규화로 치과 4곳의 블록 수가 1씩 줄었다. 이는 **길이 축에만 영향**을 주고 `t+r` 값에는 영향이 없어 유형 판정은 바뀌지 않는다.
- n=26, 그중 R은 8곳뿐이다. R 내부를 더 쪼개는 것은 표본상 불가능하다.

---

## 6. 입력 신뢰성 검증 (KR 괴리 보고 후 추가)

KR 19곳에서 **토큰 부여와 실측 보유의 괴리**(`reviews` 토큰 3/19 vs 실측 13/19, +10)가 보고돼, R/S 규칙의 입력이 US에서도 같은 문제를 갖는지 검증했다.

### 6.1 US 26곳 토큰 vs 실측 괴리

| 항목 | 토큰 보유 | 실측 보유 | 괴리 | 판정 |
|---|---:|---:|---:|---|
| **`reviews`+`trust`** (R/S 입력) | 21/26 | 22/26 | **+1** | **일관** |
| `booking` | 18/26 | 26/26 | **+8** | 큰 괴리 |
| `videos` | 8/26 | 15/26 | **+7** | 큰 괴리 (정의 차이, 기지) |

세그먼트별 `reviews`+`trust` 괴리: **치과 +0 · 정형 +0 · 에스테틱 +1**.

**R/S의 입력만은 US에서 일관적이다.** KR의 +10과 달리 US는 +1이며, 그 1건도 특정 가능하다 — parkcitydermatology(구글 리뷰 팝업 + 지역 매거진 수상 문구가 독립 섹션이 아님). 반면 `booking`은 US에서도 +8로 KR과 같은 패턴이다(예약이 섹션이 아니라 상단·하단 고정 CTA로 존재).

즉 **괴리는 항목별로 다르다.** KR 보고의 `booking` +11은 US에서도 재현되지만(+8), `reviews` +10은 US에서 재현되지 않는다(+1).

### 6.2 데이터 오류 1건 발견·수정

이 검증 과정에서 **내 전사 오류 1건**이 드러났다. 원 리포트 26곳의 구성 코드를 프로그램으로 대조한 결과:

| 사이트 | 원 리포트 (정) | 교차표에 옮긴 값 (오) |
|---|---|---|
| moderndermct.com | `hero→about→services→providers→reviews→booking` | `hero→other→about→services→other→location` |

`us-crosstab.md`를 조립하며 **orthospinecenters의 코드를 잘못 복사**했다. 나머지 25곳은 원본과 완전 일치했다(대조 26/26 수행, 불일치 1건).

**영향과 수정**:
- `moderndermct`의 `t`: 0 → **1**. `t≤1`이므로 **유형은 S로 불변**
- 기존 A 7곳 t값: `0,0,0,0,1,1,1` → `0,0,0,1,1,1,1`. **여전히 전부 ≤1이므로 A/B 분리 11/11 유지**
- R/S 분포 **R 8 / S 18 불변**
- 어휘 빈도 수정: `other` 43→41 · `reviews` 20→21 · `booking` 18→19 · `providers` 14→15 · **`location` 13→12**
- **에스테틱 `location`이 1회(1/7) → 0회(0/7)로 정정.** 이는 축3(규모=`location`)의 방향을 약화시키지 않고 오히려 **강화**한다 — 규모가 전원 미확인인 에스테틱이 `location`을 하나도 쓰지 않았다는 뜻이다
- `us-crosstab.md` · `variant-axes.md` 해당 수치 전부 갱신 완료

### 6.3 규칙 생존 여부와 의미 재정의

**US 기준으로 R/S는 생존한다.** 다만 리드 지시대로 **규칙이 실제로 재는 것**을 좁혀 정의한다.

> **R/S가 재는 것은 "신뢰 자료의 보유량"이 아니라 "신뢰 블록을 독립 섹션으로 몇 번 반복 배치했는가"다.**
> `t≤1 → S`는 "후기가 없다"가 아니라 **"후기를 독립 섹션으로 2회 이상 두지 않았다"**를 뜻한다. 실제로 US 26곳 중 후기 실측 보유는 22곳인데 `t≥2`는 8곳뿐이다 — 대부분이 후기를 갖고 있으면서 한 번만 쓴다.

이 좁힌 정의 아래에서는 플로팅 위젯·캐러셀·SNS 그리드로만 존재하는 후기가 토큰에 안 잡히는 것이 **오류가 아니라 정의대로의 동작**이다.

### 6.4 KR 적용 가능성 — 현재 불가

- KR은 `reviews` 토큰이 실측의 23%만 잡는다(3/19 vs 13/19). **US(+1)와 코딩 양상이 근본적으로 다르다.**
- 원인이 ① KR 사이트가 실제로 후기를 독립 섹션으로 안 두는 구조인지 ② KR 코딩이 US보다 엄격했는지 **구분되지 않았다.**
- ①이면 R/S는 KR에서도 유효하고 KR이 S로 쏠린다는 뜻이며, ②면 R/S 입력이 KR에서 손상된 것이다.
- **판정 불가 → R/S는 현재 `US 전용`이다.** KR 적용은 KR 19곳의 `reviews` 토큰 부여 기준을 US와 맞춰 재코딩한 뒤에 재검증해야 한다.
