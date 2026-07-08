/**
 * 테넌트 호스트 404 — 미발행/미등록 도메인, 존재하지 않는 하위 경로.
 * 아낙스랩스 브랜딩을 담은 자체 404 (앱 chrome 없음).
 */
import { ROOT_DOMAIN } from '@/lib/env';

export default function SiteNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-neutral-950 px-6 py-16 text-center">
      <p className="text-xs font-semibold tracking-[0.35em] text-neutral-500">404</p>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-neutral-50">
        사이트를 찾을 수 없습니다
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-neutral-400">
        주소가 잘못되었거나 아직 발행되지 않은 사이트예요. 입력하신 주소를 다시 한번 확인해
        주세요.
      </p>
      <a
        href={`https://${ROOT_DOMAIN}`}
        className="mt-8 inline-flex items-center justify-center rounded-full border border-neutral-700 px-6 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900"
      >
        아낙스랩스 홈으로
      </a>
      <p className="mt-16 text-xs text-neutral-600">
        나만의 웹사이트가 필요하신가요?{' '}
        <span className="font-semibold text-neutral-400">아낙스랩스</span>가 만들어 드립니다
      </p>
    </main>
  );
}
