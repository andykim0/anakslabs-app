/**
 * `server-only` 마커 모듈 타입 선언.
 * Next.js가 빌드 시 `next/dist/compiled/server-only`로 alias 하므로 런타임 동작은 보장되지만,
 * npm 패키지로 설치되어 있지 않아 tsc 해석용 ambient 선언이 필요하다.
 */
declare module 'server-only';
