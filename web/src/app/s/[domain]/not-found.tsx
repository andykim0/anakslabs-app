/**
 * 테넌트 호스트 404 — 미발행/미등록 도메인, 존재하지 않는 하위 경로.
 * Anaks Labs 브랜딩을 담은 자체 404 (앱 chrome 없음).
 * 색은 마케팅 아이덴티티(--bg #F6F7F9 · --ink #141A3A · --blue #2D63F0)를 따른다.
 */
import { ROOT_DOMAIN } from '@/lib/env';
import { PUBLIC_BRAND_NAMES } from '@/lib/brand/public-names';

export default function SiteNotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#F6F7F9] px-6 py-16 text-center">
      <p className="text-xs font-semibold tracking-[0.35em] text-[#6A7286]">404</p>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-[#141A3A]">
        This site is not available
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-[#545C70]">
        The address may be incorrect, or the site may not be published yet. Check the address and try again.
      </p>
      <a
        href={`https://${ROOT_DOMAIN}`}
        className="mt-8 inline-flex items-center justify-center rounded-full border border-[#D9DAE0] bg-white px-6 py-3 text-sm font-medium text-[#232C52] transition hover:border-[#2D63F0] hover:text-[#2D63F0]"
      >
        Go to {PUBLIC_BRAND_NAMES.brand}
      </a>
      <p className="mt-16 text-xs text-[#6A7286]">
        Need a website?{' '}
        <span className="font-semibold text-[#232C52]">{PUBLIC_BRAND_NAMES.brand}</span> builds and runs it for you.
      </p>
    </main>
  );
}
