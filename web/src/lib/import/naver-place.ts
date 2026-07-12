/**
 * [v4 #3b] 네이버 플레이스 어댑터 — 정직한 프로토콜.
 *
 * 실측(서버 fetch, iPhone UA): m.place.naver.com은 HTML(200, text/html)을 서빙하며 데이터가
 * `window.__APOLLO_STATE__`에 존재하나, **정규화 캐시가 아니라 arg-인코딩된 중첩 쿼리트리**
 * (예: `placeDetail({"input":{"id":"..."}})` 키)로 들어있어 상호·주소·메뉴를 안정적으로 뽑기
 * 어렵다(형태 기반 재귀 스캔으로도 미검출). 네이버 구조 변경에 취약한 스크레이퍼가 되므로,
 * **지어내지 않고** 링크 저장 + "소개글을 복사해 붙여넣어 주세요" 폴백으로 처리한다.
 * (인스타그램도 로그인 장벽·약관으로 동일 폴백.)
 *
 * 구조가 안정 API로 확인되면 이 파일에 파서 + 실응답 픽스처 테스트를 추가하는 것이 후속 과제.
 */
import type { ExtractResult } from './extract';

export interface AdapterOutcome {
  extracted?: ExtractResult;
  fallbackMessage?: string;
}

const NAVER_FALLBACK =
  '네이버 플레이스는 소개·메뉴를 자동으로 가져오기 어려워요. 플레이스의 소개글·메뉴를 복사해 다음 단계 원문 칸에 붙여넣어 주세요. (링크는 저장해 둘게요.)';

const INSTAGRAM_FALLBACK =
  '인스타그램은 자동으로 가져올 수 없어요. 프로필 소개나 대표 게시물 글을 복사해 다음 단계 원문 칸에 붙여넣어 주세요. (링크는 저장해 둘게요.)';

/** 네이버 플레이스 — 현재는 폴백만(견고한 파서 부재). 링크는 상위에서 저장. */
export function naverPlaceFallback(): AdapterOutcome {
  return { fallbackMessage: NAVER_FALLBACK };
}

/** 인스타그램 — 폴백만. */
export function instagramFallback(): AdapterOutcome {
  return { fallbackMessage: INSTAGRAM_FALLBACK };
}
