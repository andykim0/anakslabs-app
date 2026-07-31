# 스크롤 리빌 측정 명세

작성: kr-survey-02 · 근거: 세그먼트 02(11곳) + 세그먼트 01 대조(12곳) 실측, 하네스 `/private/tmp/kr-survey/.work-seg02/{reveal.py,revsum.py,measure_kr.py}`

**표기 규칙**: `검증됨` = 내 실측 데이터로 확인한 것 · `미검증` = 확인하지 않은 것. **미검증 항목은 추정으로 채우지 않았다.**

---

## 0. 먼저 — KO 데모 「리빌 미발화」 판정에 대하여

**내 트랩 3번은 당신들 케이스를 설명하지 못한다.** 두 개는 다른 현상이다. 이걸 먼저 분리해야 코드를 고칠지 말지가 정해진다.

| | 트랩 3번(내가 기록한 것) | KO 데모 드라이버가 본 것 |
|---|---|---|
| 읽은 대상 | `animation-duration` (CSS **animation**) | `.m-hide`/`.m-show` **클래스 개수** |
| 종료 후 값 | **0s 로 되돌아감** | 개수 0 |
| 원인 | 애니메이션 종료 후 계측 | **미상 — 아래 판별 필요** |

**`transition` 기반(= IntersectionObserver + 클래스 토글) 사이트에서는 `transition-duration`이 트리거 전에도, 후에도 계속 읽힌다. 되돌아가지 않는다.** `검증됨` — hooclinic 실측:

```
스크롤 전(트리거 전) 읽기 — 9개 요소에서 transition 선언이 그대로 읽힘
  td=0.8s  tf=cubic-bezier(0.16, 1, 0.3, 1)  opacity=0  transform=none
  td=1.0s  tf=cubic-bezier(0.16, 1, 0.3, 1)  opacity=0  transform=none
  td=1.2s  tf=cubic-bezier(0.16, 1, 0.3, 1)  opacity=0  transform=matrix(1,0,0,1,-630,0)
스크롤 후 → opacity 0 → 1 (transform 은 유지되는 것도 있음)
```

→ **당신들 드라이버가 `0`을 본 것은 「끝난 뒤에 재서」가 아닐 가능성이 크다.** 클래스 개수는 라이브러리가 끝나고 제거하면 0이 되지만, **「로드 직후」에도 0이었다는 게 핵심이다.** 초기 은닉 상태(`.m-hide`)가 애초에 안 붙었다는 뜻일 수 있고, 그러면 진짜 결함이다.

**수정 여부를 가르는 단 하나의 판별 테스트 → §4-C.** 재측정 없이 이 명세만으로 실행 가능하다.

---

## ① 언제 재는가 `검증됨`

리빌은 **세 시점**을 각각 따로 재야 한다. 한 시점만 재면 반드시 틀린다.

| 시점 | 무엇을 위한 것 | 내 하네스 구현 |
|---|---|---|
| **PRE** — 로드 완료 후, **스크롤 0에서** | 초기 은닉 상태가 실제로 적용됐는가 | `networkidle` 대기 → 추가 2,500ms → 폴드 아래 요소 태깅 후 계측 |
| **LIVE** — 트리거 직후 애니메이션 **진행 중** | 지속 ms · 이징 (종료 후 사라지는 값) | 스크롤 **300px 단위** 이동 → 각 스텝마다 **60ms 간격 4회 폴링**(스텝당 240ms) |
| **POST** — 전체 스크롤 완료 후 | 발화 여부 판정 | 전체 스크롤 후 900ms 대기 후 계측 |

- **스크롤 간격 300px**: 뷰포트(900px)보다 훨씬 작게 잡아야 한다. 뷰포트 단위로 뛰면 한 스텝에 여러 요소가 동시 트리거되고, 그중 일부는 다음 폴링 전에 끝난다.
- **폴링 60ms × 4**: 지속 시간이 가장 짧게 관측된 사례가 **280~500ms** 대였다. 60ms 간격이면 500ms 애니메이션을 최소 8회 샘플링한다. `미검증` — 이보다 짧은 애니메이션(<120ms)에서 이 간격이 충분한지는 확인하지 않았다.
- **rAF 기반인가**: **아니다.** `setTimeout` 폴링이다. `requestAnimationFrame` 기반 샘플링은 `미검증`.
- 샘플 병합 규칙: 같은 요소에 대해 **첫 샘플을 채택하되, 기존 값의 `animation-duration`이 `0s`이고 새 샘플이 `0s`가 아니면 덮어쓴다.** 종료 후 샘플이 진행 중 샘플을 덮지 않게 하려는 것.

---

## ② 무엇을 읽는가 · ③ 종료 후 되돌아가는 속성 `검증됨`

**결정적 실측 1건** — iniqueps(WOW.js + animate.css), 동일 요소를 세 시점에서:

```
PRE  (트리거 전)  visibility=hidden   opacity=1     animation-name=none      animation-duration=0s   transform=none
LIVE (진행 중)    visibility=(미수집) opacity=0.06  animation-name=fadeInUp  animation-duration=1s    transform=matrix(1,0,0,1,0,93.94)
POST (종료 후)    visibility=visible  opacity=1     animation-name=fadeInUp  animation-duration=0s    transform=none
```

### 속성별 생존/소멸 표

| 속성 | 트리거 전 | 진행 중 | 종료 후 | 판정 |
|---|---|---|---|---|
| `animation-duration` | `0s` | **`1s`** | **`0s`** | ⚠ **되돌아감. LIVE 에서만 읽힌다** |
| `animation-name` | `none` | `fadeInUp` | `fadeInUp` | 종료 후 **생존**. 단 **트리거 전에는 `none`** |
| `transform` | `none` | `matrix(…)` | `none` | ⚠ **되돌아감**(animation 기반일 때) |
| `opacity` | `1` | `0.06` | `1` | ⚠ **되돌아감** |
| `visibility` | `hidden` | — | `visible` | ✅ **생존. animation 기반의 가장 안정적인 판정 신호** |
| `transition-duration` | `0.8s` | `0.8s` | `0.8s` | ✅ **생존**(transition 기반. 정적 CSS 선언이라 안 사라짐) |
| `transition-timing-function` | `cubic-bezier(…)` | 〃 | 〃 | ✅ **생존** |

**③ 종료 후 0/초기값을 반환하는 속성 목록 (핵심)**
1. **`animation-duration` → `0s`** ← 당신들이 이미 밟은 것
2. `animation-delay` → `0s` (`미검증` — 개별 확인 안 함, `animation-duration`과 같은 선언 블록에서 왔으므로 함께 사라졌을 가능성)
3. `transform` → `none` (animation 기반)
4. `opacity` → 초기값(대개 `1`)

**되돌아가지 않는 것**: `visibility`, `transition-duration`, `transition-timing-function`, `animation-name`.

**메커니즘은 `미검증`.** 종료 후 `animation-name`은 남는데 `animation-duration`만 0s가 된 것으로 보아 지속 시간을 담은 클래스만 제거된 것으로 보이나, **DOM 클래스 변화를 직접 관측하지 않았다.**

**`getAnimations()` / `document.getAnimations()` 는 `미검증`.** 내 하네스는 사용하지 않았다. 종료 후 생존 여부를 확인하지 않았으므로 판단 근거로 쓰지 말 것.

**태깅이 전제다** `검증됨`: PRE 단계에서 후보 요소에 `data-rv` 속성을 부여해 두고, LIVE·POST에서 **같은 요소를 다시 조회**한다. 셀렉터로 매번 새로 찾으면 클래스가 바뀐 뒤에는 못 찾는다.

---

## ④ 판정 조건

### A. 「발화했다」 `검증됨`
PRE와 POST를 같은 요소에서 비교해 **하나 이상** 참이면 발화:
```
visibility:  hidden → visible
opacity:     POST − PRE > 0.3
transform:   PRE ≠ POST (문자열 비교)
```
내 하네스는 이 셋의 OR로 판정했다.

### B. 「정의만 있고 발화 안 함」 `검증됨`
```
PRE 에서 초기 은닉 상태가 관측됨   (visibility:hidden 이거나 opacity<0.15 이거나 transform≠none)
        AND
POST 에서 A의 세 조건이 모두 거짓
```
**PRE의 은닉 상태 확인이 필수다.** 이게 없으면 「원래 안 숨겨져 있던 요소」와 「숨겨졌는데 안 풀린 요소」를 구분할 수 없다.

내 표본 실측: misoro·kseye·rebornps는 **PRE 후보 자체가 0개** → 「정의 없음」이지 「미발화」가 아니다. ppeum은 **PRE 후보 7개인데 POST 변화 0** → 이게 진짜 **「정의는 있는데 미발화」**다. 두 상태를 반드시 구분해서 세라.

### C. ★ KO 데모 판별 테스트 — 이거 하나면 수정 여부가 갈린다
당신들 케이스(IntersectionObserver + 클래스 토글)에는 **클래스 개수를 세지 마라.** 대신:

```
1) 로드 후 스크롤 0 상태에서, 폴드 아래(rect.top >= innerHeight) 요소를 전부 훑어
   computed 값을 읽는다:  opacity · transform · transitionDuration · transitionProperty
2) 판정:
   opacity==0 또는 transform!=none 인 요소가 있다  → 초기 은닉 상태는 적용됨
                                                    → 결함은 "안 풀리는 것". POST 재확인 후 수정 대상
   전부 opacity==1 이고 transform==none 이다        → 초기 은닉 상태가 아예 안 붙음
                                                    → .m-hide 미적용 = 진짜 결함 (또는 클래스명 불일치)
   transitionDuration 이 280ms 로 읽힌다            → transition 선언은 살아 있음
                                                    → 선언 유무는 결함 원인이 아님
```
**`transition-duration`은 트리거 전에도 읽히므로**(위 hooclinic 실측), 이 값이 280ms로 나오면 「CSS 정의는 있다」가 실측으로 확정된다. 그 상태에서 opacity가 전부 1이면 **은닉 클래스가 안 붙은 것**이고, 이건 측정 오류가 아니라 결함이다.

**주의**: 「로드 직후 0」이라는 당신들 관측은 위 2번의 두 번째 갈래를 시사하지만, **당신들이 읽은 게 클래스 개수라서 확정할 수 없다.** computed opacity/transform으로 다시 읽어야 판정된다.

---

## ⑤ IntersectionObserver + 클래스 토글 방식 적용 시 주의점

| # | 주의점 | 근거 |
|---|---|---|
| 1 | **클래스 개수를 발화 지표로 쓰지 마라.** 라이브러리가 종료 후 클래스를 제거하면 0이 된다. computed `opacity`/`transform` 상태 변화로 판정하라 | `검증됨`(속성 생존표) |
| 2 | **`transition-duration`·`timing-function`은 트리거 전에 읽어라.** 정적 선언이라 항상 읽히고, LIVE 폴링이 필요 없다 | `검증됨`(hooclinic 9개 요소) |
| 3 | **`animation-*` 기반이라면 LIVE 폴링이 필수다.** 지속 ms는 진행 중에만 존재한다 | `검증됨`(iniqueps) |
| 4 | **PRE 계측은 스크롤 0에서 해야 한다.** 한 번이라도 스크롤하면 IO가 발화해 초기 상태가 사라진다. 내 하네스가 초기에 이걸 틀려서 섹션 절반을 놓쳤다(iniqueps 6개→10개) | `검증됨` |
| 5 | **폴드 아래 요소만 후보로 잡아라.** 폴드 위 요소는 로드 시점에 이미 IO가 발화해 PRE 상태를 관측할 수 없다 | `검증됨` |
| 6 | **IO `threshold`/`rootMargin`이 크면 300px 스텝으로도 놓칠 수 있다.** 트리거 지점이 뷰포트 밖일 수 있다 | `미검증` — IO 설정값과 스크롤 스텝의 상호작용은 확인하지 않았다 |
| 7 | **`prefers-reduced-motion`은 이미 확인했다고 했으니 배제.** 단 헤드리스 브라우저 기본값이 실제 사용자와 다를 수 있다 | `미검증` |
| 8 | **가상 스크롤·`scroll-behavior:smooth`** 환경에서 폴링 타이밍이 어긋나는지 | `미검증` |
| 9 | **shadow DOM / iframe 내부 요소**는 `document.querySelectorAll`로 안 잡힌다. 클래스 개수 0의 또 다른 원인 | `미검증` — 내 표본에 해당 사례 없음 |

---

## 관측된 리빌 파라미터 실측치 (참고) `검증됨`

지속 시간이 실제로 계측된 사례만. **1초 안팎이 사실상 표준**이다.

| 방식 | 이동 | 지속 | 이징 |
|---|---|---|---|
| WOW.js + animate.css (iniqueps) | translateY/X **100%** | **1000ms** | `ease` (지연 0~650ms 스태거) |
| WOW.js 커스텀 키프레임 (faceps) | translateY **100%** | **1200ms** | `ease` (지연 700/1100/1500ms) |
| transition 기반 (champodonamu) | **50 / 81 / 150 / 225px**, X 576px | **500 / 800 / 1000ms** | `ease-out` · `ease-in-out` · `ease` |
| transition 기반 (hooclinic) | **80px**, X 247/255/630px | **800 / 1000 / 1200ms** | **`cubic-bezier(0.16, 1, 0.3, 1)`** (easeOutExpo) |
| GSAP ScrollTrigger (cnuclinic) | 100px, X 1200/2021px | **미검증** | **미검증** — GSAP이 인라인 스타일을 직접 보간해 computed 폴링으로 안 잡힘 |

**GSAP 계열은 이 명세의 폴링 방식으로 지속·이징을 얻지 못한다** `검증됨`(못 얻었다는 사실이). 대안은 `미검증`.

---

## 재현 코드

- `/private/tmp/kr-survey/.work-seg02/reveal.py` — PRE 태깅 → 300px 스텝 + 60ms×4 폴링 → POST + 키프레임 translate 추출
- `/private/tmp/kr-survey/.work-seg02/revsum.py` — 발화 판정(§4-A) 및 파라미터 집계
- `/private/tmp/kr-survey/.work-seg02/measure_kr.py` — 셀렉터 무관 범용 후보 탐지(`opacity<0.15 || transform≠none`), 라이브러리 이름을 모를 때 사용

**§4-C 판별 테스트는 위 코드 없이도 브라우저 콘솔에서 바로 실행 가능하다** — 폴드 아래 요소의 computed `opacity`/`transform`/`transitionDuration`을 스크롤 0에서 한 번 읽으면 된다.
