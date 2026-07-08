/**
 * Supabase(실키) 모드 AiService.
 *
 * 전략: "레이아웃은 결정적, 카피/이미지는 생성" —
 *  - 레이아웃/테마: design-candidates.ts + site-templates.ts (mock과 동일한 결정적 절반)
 *  - 카피: GLM (실패 시 템플릿 기본 카피로 강등 — 온보딩이 죽지 않게)
 *  - 이미지: Gemini(Nano Banana) → Supabase Storage 공개 URL
 *  - 영상: Veo 3.1 스텁 — 명확한 에러 (편집 요청 라우트가 502 + 자동 환불 처리)
 */
import type { DesignCandidate, SurveyInput } from '@/lib/types/domain';
import type { SiteConfig } from '@/lib/types/site';
import { generateGeminiImage } from '@/lib/ai/gemini-image';
import { generateGlmText, GLM_COPYWRITER_SYSTEM } from '@/lib/ai/glm-text';
import { generateVeoVideo } from '@/lib/ai/veo-video';
import type { AiService } from '../types';
import { buildCandidateBlueprints } from '../design-candidates';
import { buildSiteConfigFromSurvey, type SectionCopy } from '../site-templates';
import { uploadAiAsset } from './storage';

/** GLM에 섹션 카피를 JSON으로 요청 → 실패 시 undefined (템플릿 기본 카피 사용) */
async function generateSectionCopy(survey: SurveyInput): Promise<SectionCopy | undefined> {
  const prompt =
    `다음 사업장의 웹사이트 섹션 카피를 JSON으로 작성해줘.\n` +
    `상호: ${survey.businessName}\n업종: ${survey.industry}\n목적: ${survey.purpose}\n` +
    `톤: ${survey.tone}\n추가 요청: ${survey.extraNotes ?? '없음'}\n\n` +
    `반드시 아래 키만 가진 JSON 객체 하나만 출력:\n` +
    `{"heroKicker": "한 줄 킥커(15자 이내)", "heroTitle": "두 행 헤드라인(행 구분은 \\n)", ` +
    `"heroSub": "부제 한두 문장", "aboutTitle": "소개 제목", "aboutBody": "소개 본문 2~3행(행 구분 \\n)", ` +
    `"ctaTitle": "마무리 초대 문구"}`;

  try {
    const raw = await generateGlmText({ prompt, system: GLM_COPYWRITER_SYSTEM, temperature: 0.6 });
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return undefined;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;

    const pick = (key: string): string | undefined =>
      typeof parsed[key] === 'string' && (parsed[key] as string).trim().length > 0
        ? (parsed[key] as string).trim()
        : undefined;

    return {
      heroKicker: pick('heroKicker'),
      heroTitle: pick('heroTitle'),
      heroSub: pick('heroSub'),
      aboutTitle: pick('aboutTitle'),
      aboutBody: pick('aboutBody'),
      ctaTitle: pick('ctaTitle'),
    };
  } catch (err) {
    console.warn('[ai] GLM 섹션 카피 생성 실패 — 템플릿 기본 카피 사용:', err);
    return undefined;
  }
}

async function generateImageUrl(prompt: string, prefix: string): Promise<string> {
  const image = await generateGeminiImage({ prompt });
  return uploadAiAsset({ base64: image.base64, mimeType: image.mimeType, prefix });
}

export class SupabaseAiService implements AiService {
  async generateCandidates(survey: SurveyInput): Promise<DesignCandidate[]> {
    const blueprints = buildCandidateBlueprints(survey);
    return Promise.all(
      blueprints.map(async (bp) => {
        let heroImageUrl = bp.mockHeroUrl; // 생성 실패 시 스타일 프리뷰 자산으로 강등
        try {
          heroImageUrl = await generateImageUrl(bp.heroImagePrompt, 'candidates');
        } catch (err) {
          console.warn(`[ai] 후보(${bp.id}) 히어로 이미지 생성 실패 — 프리뷰 자산 사용:`, err);
        }
        return {
          id: bp.id,
          label: bp.label,
          style: bp.style,
          heroImageUrl,
          theme: bp.theme,
          description: bp.description,
        };
      }),
    );
  }

  async generateSiteConfig(survey: SurveyInput, candidate: DesignCandidate): Promise<SiteConfig> {
    const copy = await generateSectionCopy(survey);

    // 섹션용 보조 이미지 2장 — 실패분은 제외하고 히어로로 대체
    const stylePrompt =
      candidate.style === '3d_render'
        ? 'soft 3D clay render, warm studio lighting'
        : 'editorial photography, natural lighting';
    const poolPrompts = [
      `Interior/workspace detail image for ${survey.businessName} (${survey.industry}). ${stylePrompt}, ${survey.tone} mood, no text. 4:3.`,
      `Signature product/service closeup for ${survey.businessName} (${survey.industry}). ${stylePrompt}, ${survey.tone} mood, no text. 4:3.`,
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

    return buildSiteConfigFromSurvey(survey, candidate, {
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
    return generateGlmText({ prompt: parts.join('\n\n') });
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
}
