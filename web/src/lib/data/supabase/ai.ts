/**
 * Supabase(실키) 모드 AiService.
 *
 * 전략: "구조는 결정적, 언어/이미지는 생성" —
 *  - 3안 선택/테마: design-candidates.ts(디자인 지식 큐레이션 기반, mock과 동일한 결정적 절반).
 *    테마 hex 는 항상 buildThemeFromBrief 산출물 — LLM 이 색을 만들지 않는다.
 *  - 후보 텍스트: Claude 1회 호출로 3안의 label/description/heroImagePrompt 를 설문 맥락에 맞게
 *    다듬는다. 실패 시 브리프의 결정적 텍스트로 강등 — 온보딩이 죽지 않는다.
 *  - 카피: Claude (시스템 프롬프트에 디자인 원칙 결합, 실패 시 템플릿 기본 카피로 강등)
 *  - 이미지: Gemini(Nano Banana) → Supabase Storage 공개 URL (스타일 조각을 프롬프트에 반영)
 *  - 영상: Veo 3.1 스텁 — 명확한 에러 (편집 요청 라우트가 502 + 자동 환불 처리)
 */
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SectionType, SiteConfig } from '@/lib/types/site';
import { generateGeminiImage } from '@/lib/ai/gemini-image';
import { generateClaudeText, CLAUDE_COPYWRITER_SYSTEM } from '@/lib/ai/claude-text';
import { generateVeoVideo } from '@/lib/ai/veo-video';
import { DESIGN_PRINCIPLES_PROMPT } from '@/lib/ai/design-knowledge';
import type { AiService } from '../types';
import {
  buildCandidateBlueprints,
  matchBlueprintForCandidate,
  resolveSectionPlan,
  type CandidateBlueprint,
} from '../design-candidates';
import { buildSiteConfigFromSurvey, type SectionCopy } from '../site-templates';
import { uploadAiAsset } from './storage';

// ---------- 공통 유틸 ----------

/** Claude 응답에서 첫 JSON 객체를 추려 파싱 (실패 시 null — 호출부가 결정적 폴백) */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

async function generateImageUrl(prompt: string, prefix: string): Promise<string> {
  const image = await generateGeminiImage({ prompt });
  return uploadAiAsset({ base64: image.base64, mimeType: image.mimeType, prefix });
}

// ---------- 1차 가공: 후보 3안 텍스트 다듬기 (Claude 1회 호출) ----------

interface RefinedCandidateText {
  label?: string;
  description?: string;
  heroImagePrompt?: string;
}

/**
 * 결정적 3안(브리프)을 설문 맥락에 맞게 다듬는다 — 호출 1회로 3안 전부.
 * 출력: 안별 label(한국어 12자 내)/description(한국어 1~2문장)/heroImagePrompt(영어).
 * 어떤 실패든 빈 Map 반환 → 호출부가 브리프의 결정적 텍스트를 그대로 쓴다.
 */
async function refineCandidateTexts(
  survey: SurveyInput,
  blueprints: CandidateBlueprint[],
): Promise<Map<string, RefinedCandidateText>> {
  const refined = new Map<string, RefinedCandidateText>();

  const briefLines = blueprints
    .map(
      (bp, i) =>
        `${i + 1}. id: "${bp.id}" / 방향: ${bp.brief.style.name} / ` +
        `팔레트: ${bp.brief.palette.name}(${bp.brief.palette.dark ? '다크' : '라이트'}) / ` +
        `타이포: ${bp.brief.fonts.name} / 스타일 조각(영어): "${bp.heroImageFragment}"`,
    )
    .join('\n');

  const prompt =
    `다음 설문과 디자인 후보 ${blueprints.length}안을 검토하고, 각 안의 label/description/heroImagePrompt 를 이 가게에 맞게 다듬어줘.\n\n` +
    `[설문]\n상호: ${survey.businessName}\n${survey.tagline ? `태그라인: ${survey.tagline}\n` : ''}` +
    `업종: ${survey.industry}\n목적: ${survey.purpose}\n톤: ${survey.tone}\n선호 컬러: ${survey.colorPreference}\n` +
    `컨셉: ${survey.conceptMode === 'fictional' ? '가상 컨셉(그럴듯하게 창작 허용)' : '실제 매장 정보 기반'}\n` +
    `추가 요청: ${survey.extraNotes ?? '없음'}\n\n` +
    `[디자인 후보]\n${briefLines}\n\n` +
    `[규칙]\n` +
    `- 세 안은 고객이 고를 서로 다른 '유효한 해석'이다. 어떤 안도 깎아내리거나 다른 안과 비교하지 마라 — ` +
    `각 안을 그 안의 관점에서 가장 매력적으로 팔아라.\n` +
    `- label: 한국어 12자 이내의 긍정적 후보명. 이 가게의 언어에서 출발하고 형용사 나열 금지.\n` +
    `- description: 한국어 1~2문장. 이 방향이 이 가게를 어떻게 돋보이게 하는지 구체적으로(부정어·비교 금지).\n` +
    `- heroImagePrompt: 영어 한 단락. 이 가게의 구체적 장면 묘사로 시작하고, 해당 안의 스타일 조각(영어)을 그대로 포함. ` +
    `"no text, no words, no logos, no watermark" 와 "16:10" 포함.\n` +
    `- 아래 형태의 JSON 객체 하나만 출력 (id 는 입력 그대로):\n` +
    `{"candidates":[{"id":"...","label":"...","description":"...","heroImagePrompt":"..."}]}`;

  try {
    const raw = await generateClaudeText({
      prompt,
      system: `${DESIGN_PRINCIPLES_PROMPT}\n\n너는 위 원칙을 따르는 디자인 스튜디오의 리드다. 반드시 요청된 JSON 하나만 출력한다 — 설명·마크다운·코드펜스 금지.`,
      maxTokens: 2000,
    });
    const parsed = parseJsonObject(raw);
    const list =
      parsed && Array.isArray(parsed.candidates) ? (parsed.candidates as unknown[]) : [];
    list.forEach((item, i) => {
      if (typeof item !== 'object' || item === null) return;
      const record = item as Record<string, unknown>;
      // id 가 안 맞으면 순서로 매칭 (Claude 가 id 를 변형했을 때 대비)
      const rawId = cleanString(record.id, 100);
      const id =
        rawId && blueprints.some((bp) => bp.id === rawId) ? rawId : blueprints[i]?.id;
      if (!id) return;
      refined.set(id, {
        label: cleanString(record.label, 24)?.replace(/\n/g, ' '),
        description: cleanString(record.description, 300),
        heroImagePrompt: cleanString(record.heroImagePrompt, 900),
      });
    });
  } catch (err) {
    console.warn('[ai] Claude 후보 텍스트 다듬기 실패 — 결정적 브리프 텍스트 사용:', err);
  }
  return refined;
}

/**
 * Claude 가 돌려준 히어로 프롬프트 검증/보정.
 * 너무 짧으면 결정적 프롬프트로 강등, 스타일 조각·no-text 지시가 빠졌으면 덧붙인다.
 */
function finalizeHeroPrompt(refined: string | undefined, bp: CandidateBlueprint): string {
  if (!refined || refined.length < 40) return bp.heroImagePrompt;
  let prompt = refined;
  const fragmentAnchor = bp.heroImageFragment.split(',')[0].trim().toLowerCase();
  if (fragmentAnchor && !prompt.toLowerCase().includes(fragmentAnchor)) {
    prompt = `${prompt.trim()} Style: ${bp.heroImageFragment}.`;
  }
  if (!/no text|no words/i.test(prompt)) {
    prompt = `${prompt.trim()} No text, no words, no logos, no watermark.`;
  }
  return prompt;
}

// ---------- 2차 가공: 섹션 카피 ----------

/**
 * Claude 에 섹션 카피를 JSON 으로 요청 → 실패 시 undefined (템플릿 기본 카피 사용).
 * 시스템 프롬프트: 카피라이터 규칙 + 디자인 원칙(절제 카피·관점) 결합.
 * 선택된 디자인 방향의 무드를 프롬프트로 전달해 카피 결이 비주얼과 어긋나지 않게 한다.
 */
async function generateSectionCopy(
  survey: SurveyInput,
  blueprint: CandidateBlueprint,
): Promise<SectionCopy | undefined> {
  const style = blueprint.brief.style;
  const provided = survey.contentMode === 'provided' && survey.providedContent?.trim();
  const prompt =
    `다음 사업장의 웹사이트 섹션 카피를 JSON으로 작성해줘.\n` +
    `상호: ${survey.businessName}\n${survey.tagline ? `태그라인: ${survey.tagline}\n` : ''}` +
    `업종: ${survey.industry}\n목적: ${survey.purpose}\n톤: ${survey.tone}\n추가 요청: ${survey.extraNotes ?? '없음'}\n` +
    `컨셉: ${survey.conceptMode === 'fictional' ? '가상 컨셉(그럴듯하게 창작 허용)' : '실제 매장 정보 기반'}\n` +
    (provided
      ? `\n[고객 제공 원문 — 창작 금지, 아래 내용을 다듬어서만 사용하고 없는 사실을 지어내지 마라]\n${survey.providedContent!.trim().slice(0, 3000)}\n\n`
      : '') +
    `선택된 디자인 방향: ${style.name} (무드: ${[...style.paletteMood, ...style.fontMood].join(', ')})\n` +
    `카피의 결이 이 디자인 방향과 어긋나지 않게 써줘.\n\n` +
    `반드시 아래 키만 가진 JSON 객체 하나만 출력:\n` +
    `{"heroKicker": "한 줄 킥커(15자 이내)", "heroTitle": "두 행 헤드라인(행 구분은 \\n)", ` +
    `"heroSub": "부제 한두 문장", "aboutTitle": "소개 제목", "aboutBody": "소개 본문 2~3행(행 구분 \\n)", ` +
    `"ctaTitle": "마무리 초대 문구"}`;

  try {
    const raw = await generateClaudeText({
      prompt,
      system: `${CLAUDE_COPYWRITER_SYSTEM}\n\n${DESIGN_PRINCIPLES_PROMPT}`,
    });
    const parsed = parseJsonObject(raw);
    if (!parsed) return undefined;

    const pick = (key: string): string | undefined => cleanString(parsed[key], 500);

    return {
      heroKicker: pick('heroKicker'),
      heroTitle: pick('heroTitle'),
      heroSub: pick('heroSub'),
      aboutTitle: pick('aboutTitle'),
      aboutBody: pick('aboutBody'),
      ctaTitle: pick('ctaTitle'),
    };
  } catch (err) {
    console.warn('[ai] Claude 섹션 카피 생성 실패 — 템플릿 기본 카피 사용:', err);
    return undefined;
  }
}

// ---------- AiService ----------

export class SupabaseAiService implements AiService {
  async generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
    const blueprints = buildCandidateBlueprints(survey);
    // Claude 1회 호출로 3안 텍스트를 다듬는다 (실패 시 빈 Map → 결정적 텍스트)
    const refined = await refineCandidateTexts(survey, blueprints);

    return Promise.all(
      blueprints.map(async (bp) => {
        const text = refined.get(bp.id);
        const heroPrompt = finalizeHeroPrompt(text?.heroImagePrompt, bp);
        let heroImageUrl = bp.mockHeroUrl; // 생성 실패 시 스타일 프리뷰 자산으로 강등
        try {
          heroImageUrl = await generateImageUrl(heroPrompt, 'candidates');
        } catch (err) {
          console.warn(`[ai] 후보(${bp.id}) 히어로 이미지 생성 실패 — 프리뷰 자산 사용:`, err);
        }
        return {
          id: bp.id,
          label: text?.label ?? bp.label,
          style: bp.style,
          heroImageUrl,
          // 테마는 항상 결정적(buildThemeFromBrief 산출) — LLM 이 hex 를 만들지 않는다
          theme: bp.theme,
          description: text?.description ?? bp.description,
        };
      }),
    );
  }

  async generateSiteConfig(survey: SurveyInput, candidate: DesignCandidate): Promise<SiteConfig> {
    // 선택된 후보의 브리프를 설문으로 재도출 (결정적 — 계약 타입 확장 없이 스타일 조각 복원)
    const blueprint = matchBlueprintForCandidate(survey, candidate);
    const copy = await generateSectionCopy(survey, blueprint);

    // 섹션용 보조 이미지 2장 — 선택된 스타일의 섹션 조각 반영, 실패분은 제외하고 히어로로 대체
    const fragment = blueprint.sectionImageFragment;
    const poolPrompts = [
      `Interior/workspace detail image for ${survey.businessName} (${survey.industry}). ${fragment}, ${survey.tone} mood, no text. 4:3.`,
      `Signature product/service closeup for ${survey.businessName} (${survey.industry}). ${fragment}, ${survey.tone} mood, no text. 4:3.`,
    ];
    const generated = await Promise.all(
      poolPrompts.map(async (prompt) => {
        try {
          return await generateImageUrl(prompt, 'sections');
        } catch (err) {
          console.warn('[ai] 섹션 이미지 생성 실패 — 히어로 이미지로 대체:', err);
          return null;
        }
      }),
    );
    const imagePool = generated.filter((url): url is string => url !== null);
    if (imagePool.length === 0) imagePool.push(candidate.heroImageUrl);

    // 섹션 구성이 비어 있거나 온보딩 기본값이면 브리프의 랜딩 패턴으로 보강 (기존 항목 재사용)
    const resolvedTypes = resolveSectionPlan(survey, blueprint);
    const effectiveSurvey: SurveyInput = {
      ...survey,
      sectionPlan: resolvedTypes.map(
        (type) =>
          survey.sectionPlan.find((item) => item.type === type) ?? {
            type,
            name: type,
            brief: '',
            source: 'ai' as const,
          },
      ),
    };

    return buildSiteConfigFromSurvey(effectiveSurvey, candidate, {
      heroImageUrl: candidate.heroImageUrl,
      imagePool,
      copy,
    });
  }

  async generateText(input: { prompt: string; currentText?: string; tone?: string }): Promise<string> {
    const parts = [
      input.tone ? `톤: ${input.tone}` : null,
      input.currentText ? `현재 문구:\n${input.currentText}` : null,
      `요청: ${input.prompt}`,
      '결과 문구만 출력해줘.',
    ].filter(Boolean);
    return generateClaudeText({ prompt: parts.join('\n\n') });
  }

  async generateImage(input: { prompt: string }): Promise<{ url: string }> {
    const url = await generateImageUrl(
      `${input.prompt}. High-quality editorial style for a business website, no text, no watermark.`,
      'edits',
    );
    return { url };
  }

  async generateVideo(input: { prompt: string }): Promise<{ url: string; poster?: string }> {
    // 미연동 — 명확한 에러를 던지면 편집 요청 라우트가 502 + 크레딧 자동 환불로 처리
    return generateVeoVideo(input);
  }

  async suggestCustomSection(input: {
    name: string;
    description?: string;
    survey: SurveyInput;
  }): Promise<{ mappedType: SectionType; name: string; copySeed: string }> {
    // [Phase 2] Claude 호출로 대체 예정 — 현재는 결정적 키워드 매핑 폴백 (mock과 동일 규칙)
    const mappedType = mapCustomSectionType(`${input.name} ${input.description ?? ''}`);
    return {
      mappedType,
      name: input.name,
      copySeed: input.description?.trim() || input.name,
    };
  }
}

/** [v3 Phase 2] 커스텀 섹션 이름/설명 → known SectionType 결정적 매핑 (mock·실모드 공용 규칙) */
function mapCustomSectionType(text: string): SectionType {
  if (/후기|리뷰/.test(text)) return 'testimonials';
  if (/지도|위치|오시는/.test(text)) return 'contact';
  if (/가격|요금/.test(text)) return 'pricing';
  if (/팀|직원|강사/.test(text)) return 'team';
  if (/실적|사례|프로젝트/.test(text)) return 'cases';
  if (/질문|안내/.test(text)) return 'faq';
  return 'custom';
}
