/**
 * [SS2] 고객이 제공하거나 직접 고른 사실만 3~4막으로 접는 결정적 서사 아크.
 * 생성된 섹션 카피·후기·수치·LLM 출력은 읽지 않는다. 구분자와 순서만 더하고 문장을 창작하지 않는다.
 */
import type { SurveyInput } from '@/lib/types/domain';
import type { ScrollytellingAct } from '@/lib/types/site';
import { SITE_GOALS } from '@/lib/onboarding/site-goal';
import { toneText } from '@/lib/onboarding/tone';

const HEADER_RE = /\[[^\]]+\]/;
const INTRO_BLOCK_RE = /\[\s*(?:소개|스토리)[^\]]*\]([\s\S]*?)(?:\n\[|$)/;
const STAT_RE = /\d[\d,.]*\s*(?:%|년|건|명|회|개|억|만|천)?/;

/** 소개/스토리 블록 또는 머리말 없는 자유 원문의 첫 줄. 반환값은 입력의 정확한 substring이다. */
export function groundedIntro(providedContent: string | undefined, maxLength = 240): string | undefined {
  const raw = providedContent?.trim();
  if (!raw) return undefined;
  const block = INTRO_BLOCK_RE.exec(raw)?.[1]?.trim();
  if (!block && HEADER_RE.test(raw)) return undefined;
  const source = block || raw;
  const line = source
    .split('\n')
    .map((value) => value.trim())
    .find((value) => Boolean(value) && !HEADER_RE.test(value));
  return line ? line.slice(0, maxLength) : undefined;
}

function exactParts(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function distributeBands(acts: Omit<ScrollytellingAct, 'band'>[]): ScrollytellingAct[] {
  const count = acts.length;
  return acts.map((act, index) => ({
    ...act,
    band: [index / count, index === count - 1 ? 1 : (index + 1) / count],
  }));
}

/**
 * 4막: 분위기(tagline/tone) → 정체성(소개/business/industry) → 증거(highlights) → 초대(siteGoal).
 * 증거 또는 목표 하나가 없으면 3막, 둘 다 없으면 근거 부족으로 빈 배열(일반 hero 유지).
 */
export function buildNarrativeArc(survey: SurveyInput): ScrollytellingAct[] {
  const mood = toneText(survey.tone).trim();
  const tagline = survey.tagline?.trim();
  const atmosphere = exactParts([tagline, mood]);
  const identity = exactParts([groundedIntro(survey.providedContent), survey.businessName, survey.industry]);
  if (atmosphere.length === 0 || identity.length === 0) return [];

  const acts: Omit<ScrollytellingAct, 'band'>[] = [
    {
      heading: tagline || mood,
      body: atmosphere.filter((part) => part !== (tagline || mood)).join(' · ') || atmosphere[0],
      kind: 'text',
    },
    {
      heading: survey.businessName.trim(),
      body: identity.filter((part) => part !== survey.businessName.trim()).join(' · ') || identity[0],
      kind: 'text',
    },
  ];

  const highlights = exactParts(survey.highlights ?? []);
  if (highlights.length > 0) {
    const stat = highlights.find((highlight) => STAT_RE.test(highlight));
    const heading = stat ?? highlights[0];
    acts.push({
      heading,
      body: highlights.filter((highlight) => highlight !== heading).join(' · ') || heading,
      kind: stat ? 'stat' : 'text',
    });
  }

  if (survey.siteGoal) {
    const goal = SITE_GOALS[survey.siteGoal];
    acts.push({ heading: goal.label, body: goal.ctaLabel, kind: 'text' });
  }

  return acts.length >= 3 ? distributeBands(acts.slice(0, 5)) : [];
}
