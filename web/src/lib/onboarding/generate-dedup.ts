/**
 * [온보딩 생성 중복 발화 가드 — 모듈 레벨] 순수(React·server-only 없음, 단위 테스트 가능).
 *
 * 컴포넌트 ref는 StrictMode 재마운트에 리셋되지만 모듈 스코프는 유지된다. 같은 intent의 동시 발화는
 * 진행 중 프로미스를 공유해 실제 요청을 1회로 합치고(라이브 마운트도 결과를 받아 무한 스피너 없음),
 * intent별 안정 idempotencyKey를 서버로 보내 2번째 요청이 새 사이트를 만들지 않게 한다(서버가 dedup).
 * 스코프: 페이지 로드(≈세션) — 재로드 시 초기화.
 */

const inflight = new Map<string, Promise<unknown>>();
const idemKeys = new Map<string, string>();

/** intent별 안정 idempotencyKey (같은 intent면 재마운트에도 동일). */
export function genIdemKey(intent: string): string {
  let k = idemKeys.get(intent);
  if (!k) {
    k = `gen-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    idemKeys.set(intent, k);
  }
  return k;
}

/** 같은 intent가 진행 중이면 그 프로미스를 공유(실제 실행 1회). 세틀 후엔 재실행 허용. */
export function sharedGenerate<T>(intent: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(intent) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run();
  inflight.set(intent, p);
  // 세틀 시 해제(성공/실패 모두). then(cleanup, cleanup)로 p의 rejection을 여기서도 처리 →
  // 내부 정리 체인이 unhandledRejection을 일으키지 않는다(호출부는 원본 p로 여전히 reject 수신).
  const cleanup = () => {
    if (inflight.get(intent) === p) inflight.delete(intent);
  };
  p.then(cleanup, cleanup);
  return p;
}

/** 테스트/리셋용 — 모듈 캐시 비움 */
export function __resetGenerateDedup(): void {
  inflight.clear();
  idemKeys.clear();
}
