/**
 * 사이트 정지(suspended) 안내 — 사이트 운영 구독 결제 실패 시 노출.
 * 방문자에게는 정중한 휴식 안내, 소유자에게는 결제 확인 유도.
 */
import { ROOT_DOMAIN } from '@/lib/env';

export function SuspendedNotice({ siteName }: { siteName?: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 py-16 text-center">
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-xl"
      >
        ⏸
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-neutral-50">
        사이트가 잠시 쉬고 있어요
      </h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-neutral-400">
        {siteName ? `‘${siteName}’ 사이트는` : '이 사이트는'} 사이트 운영 구독 결제가 확인되지 않아
        일시 중지된 상태입니다. 사이트 관리자라면 Daboim 대시보드에서 결제 정보를 확인해
        주세요. 결제가 완료되면 사이트는 바로 다시 열립니다.
      </p>
      <a
        href={`https://${ROOT_DOMAIN}`}
        className="mt-8 inline-flex items-center justify-center rounded-full bg-neutral-50 px-6 py-3 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200"
      >
        대시보드에서 결제 확인하기
      </a>
      <p className="mt-16 text-xs text-neutral-600">
        Powered by <span className="font-semibold text-neutral-400">Daboim</span>
      </p>
    </main>
  );
}
