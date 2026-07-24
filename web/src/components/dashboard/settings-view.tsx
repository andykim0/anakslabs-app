'use client';

/**
 * 설정 페이지 (/dashboard/settings) —
 * 프로필(이름/이메일/로그인 수단) · 사이트 운영 구독 + AI 영상 홈페이지 문의 CTA · 로그아웃.
 */
import { useState } from 'react';
import { ArrowUpRight, LogOut, Mail, Sparkles, User } from 'lucide-react';
import type { AuthProvider, Tier } from '@/lib/types/domain';
import {
  PRICING,
  SUBSCRIPTION_BENEFIT_COPY,
  SUBSCRIPTION_VALUE_COPY,
} from '@/lib/pricing';
import { logout } from './api';
import { Button, Card, formatDate, PageHeader } from './ui';

const AUTH_PROVIDER_LABELS: Record<AuthProvider, string> = {
  kakao: '카카오 로그인',
  google: 'Google 로그인',
  email: '이메일 로그인',
};

function ProviderMark({ provider }: { provider: AuthProvider }) {
  if (provider === 'kakao') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FEE500] text-[13px] font-black text-[#191919]">
        K
      </span>
    );
  }
  if (provider === 'google') {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-300 bg-white text-[13px] font-bold text-[#4285F4]">
        G
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
      <Mail className="h-4 w-4" />
    </span>
  );
}

export function SettingsView({
  name,
  email,
  authProvider,
  tier,
  createdAt,
}: {
  name: string;
  email: string;
  authProvider: AuthProvider;
  tier: Tier;
  createdAt: string;
}) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // 세션이 이미 없어도 로그인 화면으로 이동
    }
    window.location.href = '/login';
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="설정" description="계정 정보와 이용 구성을 관리하세요." />

      {/* 프로필 */}
      <Card>
        <h2 className="text-sm font-semibold text-neutral-200">프로필</h2>
        <dl className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
              <User className="h-4 w-4" />
            </span>
            <div>
              <dt className="text-[11px] text-neutral-500">이름</dt>
              <dd className="text-sm text-neutral-100">{name}</dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-neutral-400">
              <Mail className="h-4 w-4" />
            </span>
            <div>
              <dt className="text-[11px] text-neutral-500">이메일</dt>
              <dd className="text-sm text-neutral-100">{email}</dd>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ProviderMark provider={authProvider} />
            <div>
              <dt className="text-[11px] text-neutral-500">로그인 수단</dt>
              <dd className="text-sm text-neutral-100">{AUTH_PROVIDER_LABELS[authProvider]}</dd>
            </div>
          </div>
        </dl>
        <p className="mt-4 border-t border-neutral-800 pt-3 text-[11px] text-neutral-600">
          가입일 {formatDate(createdAt)} · 프로필 변경이 필요하면 hello@anakslabs.com 으로 문의해 주세요.
        </p>
      </Card>

      {/* 이용 구성 */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
              이용 구성
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              {tier === 'premium'
                ? 'AI 영상 홈페이지가 적용되어 실제 영상 히어로와 시네마틱 모션을 이용 중입니다.'
                : '기본 모션은 무료로 포함됩니다. AI 영상 홈페이지는 실제 영상 히어로를 추가하는 1회 애드온입니다.'}
            </p>
          </div>
          {tier === 'basic' ? (
            <a
              href={`mailto:hello@anakslabs.com?subject=${encodeURIComponent('[다보임] AI 영상 홈페이지 문의')}&body=${encodeURIComponent(`안녕하세요, 다보임 AI 영상 홈페이지를 문의드립니다.\n\n계정: ${email}`)}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#c8a96a] px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#d9bc82]"
            >
              <Sparkles className="h-4 w-4" />
              AI 영상 홈페이지 문의
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
        {tier === 'basic' ? (
          <ul className="mt-4 space-y-1.5 rounded-lg bg-neutral-800/40 px-4 py-3 text-xs leading-5 text-neutral-400">
            <li>· 기본 스크롤 모션 포함 · 추가 비용 없음</li>
            <li>· AI 영상 히어로 +{PRICING.videoHeroAddon.toLocaleString()}원 (1회)</li>
            <li>· 사이트 운영 구독 월 {PRICING.subscription.amountKrw.toLocaleString()}원 (사이트 1개)</li>
            <li>· {SUBSCRIPTION_BENEFIT_COPY.report} · {SUBSCRIPTION_BENEFIT_COPY.credits}</li>
            <li>· {SUBSCRIPTION_BENEFIT_COPY.selfEdit}</li>
          </ul>
        ) : null}
        <p className="mt-3 text-[11px] leading-5 text-blue-300/80">{SUBSCRIPTION_VALUE_COPY}</p>
      </Card>

      {/* 세션 */}
      <Card className="mt-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">로그아웃</h2>
          <p className="mt-1 text-xs text-neutral-500">이 기기에서 세션을 종료합니다.</p>
        </div>
        <Button variant="danger" onClick={handleLogout} loading={loggingOut}>
          <LogOut className="h-4 w-4" />
          로그아웃
        </Button>
      </Card>
    </div>
  );
}
