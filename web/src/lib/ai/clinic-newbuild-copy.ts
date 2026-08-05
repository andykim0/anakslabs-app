/**
 * 신규 제작(new-build) 카피 생성기 — Claude 구조화 호출.
 *
 * 근거는 운영자가 선언한 값(상호·진료과·선택 서비스 라벨)뿐이다. 모델은 서비스·보험·
 * 진료시간을 만들 수 없고(그 필드는 애초에 블록 조립 단계에서 선언값만 쓴다), 여기서
 * 만드는 것은 소개 문단·서비스 설명·FAQ 세 가지 산문뿐이다. 리스크/한계 문구는 모델이
 * 아니라 `CLINIC_NEWBUILD_RISK_DISCLOSURE` 고정 항목이 보장한다.
 *
 * 실패·거부·형식 위반은 전부 throw 한다 — 호출부(buildOperatorClinicNewbuildConfig)가
 * 사전 검증된 중립 템플릿 카피로 강등한다.
 */
import 'server-only';
import { generateClaudeToolInputs } from './claude-text';
import type {
  ClinicNewbuildCopy,
  ClinicNewbuildInput,
} from '@/lib/clinic-master/newbuild';
import type { ClinicServiceTaxonomyEntry } from '@/lib/clinic-master/service-taxonomy';
import { env } from '@/lib/env';
import { isMockMode } from '@/lib/env';

const SYSTEM = [
  'You write copy for a US dental practice website.',
  'Rules:',
  '(1) Use only the practice name, specialty, and service names given in the request.',
  '(2) Never invent services, prices, insurance plans, hours, addresses, staff, credentials, or statistics.',
  '(3) No superlatives, comparisons, guarantees, outcome promises, testimonials, or awards.',
  '(4) Never mention website or office features that were not given to you: no contact form,'
    + ' no chat, no patient portal, no email address, no online records, no parking or transit.',
  '(5) Restrained, specific sentences. No hype, emoji, or exclamation points.',
  '(6) Return the copy through the provided tool only.',
].join(' ');

const FAQ_COUNT = 3;

interface RawCopy {
  introduction: string;
  services: { id: string; detail: string }[];
  faqs: { question: string; answer: string }[];
}

/**
 * The product forbids a first-party contact form, and the practice has declared no email,
 * portal or chat. Copy that invents one of those channels is rejected outright rather than
 * silently published, and the caller falls back to the neutral template.
 */
const UNDECLARED_CHANNEL_RE =
  /\b(?:contact form|inquiry form|form on (?:this|our) (?:website|site|page)|patient portal|live chat|chat with|email us|send us an email|message us online|online records)\b/iu;

function assertNoUndeclaredChannel(text: string): string {
  if (UNDECLARED_CHANNEL_RE.test(text)) throw new Error('CLINIC_NEWBUILD_COPY_UNDECLARED_CHANNEL');
  return text;
}

function assertString(value: unknown, minimum: number): string {
  if (typeof value !== 'string' || value.trim().length < minimum) {
    throw new Error('CLINIC_NEWBUILD_COPY_MALFORMED');
  }
  return value.trim();
}

export async function generateClinicNewbuildCopy(context: {
  declared: ClinicNewbuildInput;
  services: readonly ClinicServiceTaxonomyEntry[];
  neutral: ClinicNewbuildCopy;
}): Promise<ClinicNewbuildCopy> {
  if (isMockMode() || !env.anthropicApiKey) {
    throw new Error('CLINIC_NEWBUILD_COPY_UNAVAILABLE');
  }
  const serviceIds = context.services.map((entry) => entry.id);
  const prompt = [
    `Practice name: ${context.declared.businessName.trim()}`,
    `Specialty: ${context.declared.specialty}`,
    'Services the practice has declared (use these names exactly, add nothing):',
    ...context.services.map((entry) => `- ${entry.id}: ${entry.label}`),
    '',
    'Write:',
    '- introduction: two sentences introducing the practice for the home page.',
    '- services: one entry per declared service id, two sentences describing what the'
      + ' visit involves. Do not promise an outcome.',
    `- faqs: exactly ${FAQ_COUNT} practical questions a new patient asks before a first`
      + ' visit, with answers. Do not cover risks or side effects; that is handled'
      + ' separately. Do not state hours, prices, insurance plans, or an address, and do not'
      + ' refer to a contact form, chat, patient portal, or email address.',
  ].join('\n');

  const inputs = await generateClaudeToolInputs({
    prompt,
    system: SYSTEM,
    maxTokens: 2000,
    timeoutMs: 60_000,
    maxRetries: 1,
    disableParallelToolUse: true,
    tool: {
      name: 'clinic_newbuild_copy',
      description: 'Return the home page copy for the declared dental practice.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['introduction', 'services', 'faqs'],
        properties: {
          introduction: { type: 'string' },
          services: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'detail'],
              properties: {
                id: { type: 'string', enum: serviceIds },
                detail: { type: 'string' },
              },
            },
          },
          faqs: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['question', 'answer'],
              properties: {
                question: { type: 'string' },
                answer: { type: 'string' },
              },
            },
          },
        },
      },
    },
  });

  const raw = inputs[0] as RawCopy | undefined;
  if (!raw) throw new Error('CLINIC_NEWBUILD_COPY_MALFORMED');

  const details = new Map<string, string>();
  for (const entry of raw.services ?? []) {
    if (!serviceIds.includes(entry?.id)) throw new Error('CLINIC_NEWBUILD_COPY_MALFORMED');
    details.set(entry.id, assertString(entry.detail, 40));
  }
  if (details.size !== serviceIds.length) throw new Error('CLINIC_NEWBUILD_COPY_MALFORMED');

  const faqs = (raw.faqs ?? []).map((item) => ({
    question: assertString(item?.question, 8),
    answer: assertString(item?.answer, 40),
  }));
  if (faqs.length !== FAQ_COUNT || faqs.some((item) => !/[?]\s*$/u.test(item.question))) {
    throw new Error('CLINIC_NEWBUILD_COPY_MALFORMED');
  }

  const copy = {
    introduction: assertString(raw.introduction, 40),
    serviceDetails: Object.fromEntries(details),
    faqs,
  };
  assertNoUndeclaredChannel([
    copy.introduction,
    ...Object.values(copy.serviceDetails),
    ...copy.faqs.flatMap((item) => [item.question, item.answer]),
  ].join('\n'));
  return copy;
}
