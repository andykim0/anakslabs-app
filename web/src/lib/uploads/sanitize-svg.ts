/**
 * [§7] SVG 저장형 XSS 방어 — 업로드 SVG에서 실행 가능 요소를 제거한다.
 *
 * 로고는 렌더러에서 <img src>로 쓰여 스크립트가 실행되지 않지만, 공개 버킷의 직접 URL로
 * 최상위 문서로 열릴 수 있으므로 저장 전에 sanitize한다. (완전 파서는 아니며, 주요 벡터 차단)
 */

/** 스크립트/이벤트핸들러/외부참조/위험 스킴 제거 */
export function sanitizeSvg(svg: string): string {
  let out = svg;

  // <script>…</script> 및 자기닫힘 script 제거
  out = out.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<script[^>]*\/?>/gi, '');
  // <foreignObject>(임의 HTML 삽입 벡터) 제거
  out = out.replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '');
  out = out.replace(/<foreignObject[^>]*\/?>/gi, '');
  // 이벤트 핸들러 속성(onload, onclick 등) 제거
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // href/xlink:href 등의 javascript:/data:text/html 스킴 제거
  out = out.replace(
    /((?:xlink:)?href)\s*=\s*("|')\s*(?:javascript:|data:text\/html)[^"']*\2/gi,
    '$1=$2#$2',
  );
  // <a> 태그 내 위험 스킴(위 처리 후에도 남은 경우) — javascript: 전역 제거
  out = out.replace(/javascript:/gi, '');

  return out;
}
