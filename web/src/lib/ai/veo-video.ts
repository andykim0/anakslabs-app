/**
 * Veo 3.1 영상 생성 어댑터 — Gemini API long-running.
 *
 * 흐름:
 *  1) 시작: POST {base}/models/{model}:predictLongRunning  (x-goog-api-key)
 *           body { instances:[{prompt}], parameters:{ aspectRatio, durationSeconds } } → operation name
 *  2) 폴링: GET {base}/{operationName} → done:true 까지 (상한 타임아웃/폴 캡, 지수 백오프)
 *  3) 완성: response.generateVideoResponse.generatedSamples[0].video.uri 다운로드(x-goog-api-key)
 *           → Supabase Storage 업로드 → 공개 URL 반환.
 *  poster: v1 생략(첫 프레임 추출은 ffmpeg 등 무거운 의존이 필요 — 반환 타입상 optional).
 *
 * 원가: $0.15~0.40/초 — 8초 클립 약 1,700~4,500원 (SPEC 2장). 크레딧 3개 소모 근거.
 *
 * 에러 규약: 미설정/billing 미활성/쿼터/타임아웃/안전차단 모두 명확한 Error 를 던진다.
 * 편집 요청 플로우(app/api/edit-requests)가 이를 잡아 502 AI_GENERATION_FAILED + 크레딧
 * 자동 환불하므로, 실패 시 고객 과금은 발생하지 않는다.
 */
import 'server-only';
import { env } from '@/lib/env';
import { uploadAiVideo } from '@/lib/data/supabase/storage';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** 실행 시점 최신 id로 교체 가능 — VEO_MODEL env 오버라이드 */
const DEFAULT_MODEL = 'veo-3.1-generate-preview';

const POLL_INTERVAL_MS = 8_000; // 초기 폴 간격
const POLL_BACKOFF = 1.25; // 지수 백오프 배수
const POLL_INTERVAL_MAX_MS = 20_000;
const POLL_TOTAL_MAX_MS = 5 * 60_000; // 총 상한 5분
const POLL_MAX_COUNT = 40; // 폴 횟수 캡

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface VeoOperation {
  name?: string;
  done?: boolean;
  error?: { message?: string; code?: number; status?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
  };
}

/** billing/쿼터/권한 에러를 명확한 메시지로 변환 (edit-requests 502+환불 경로 보존) */
function veoError(stage: string, status: number, detail: string): Error {
  const d = detail.slice(0, 300);
  if (status === 403 || /billing|has not been used|PERMISSION_DENIED|SERVICE_DISABLED|not enabled/i.test(d)) {
    return new Error(
      `VEO_BILLING_REQUIRED: Veo 영상 생성은 결제(billing) 활성 Google Cloud 프로젝트가 필요합니다. ` +
        `(${stage}, HTTP ${status}) ${d}`,
    );
  }
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(d)) {
    return new Error(`VEO_QUOTA: Veo 쿼터를 초과했습니다. (${stage}, HTTP ${status}) ${d}`);
  }
  return new Error(`VEO_API_ERROR: ${stage} (HTTP ${status}) ${d}`);
}

export interface VeoInput {
  prompt: string;
  /** [motion 4단계] image-to-video 입력 — 주면 이 이미지가 첫 프레임(=poster). 별도 추출 불필요(ffmpeg 회피) */
  image?: { base64: string; mimeType: string };
  /** 모델 override (fast/표준). 미지정 시 VEO_MODEL env → DEFAULT_MODEL */
  model?: string;
}

/**
 * Veo 생성 → 원본 바이트(업로드 없음). SaaS 스토리지에 올리지 않는 소비처(예: 회사 브랜드 에셋)용.
 * 테넌트 경로는 generateVeoVideo(바이트 + Storage 업로드)를 쓴다.
 */
export async function generateVeoVideoBytes(input: VeoInput): Promise<{ bytes: Buffer; mimeType: string }> {
  const key = env.geminiApiKey;
  if (!key) {
    throw new Error(
      'VEO_NOT_CONFIGURED: Veo 영상 생성에는 GEMINI_API_KEY(+billing 활성)가 필요합니다. ' +
        'mock 데모는 NEXT_PUBLIC_MOCK_MODE=1 을 사용하세요.',
    );
  }
  const model = input.model || process.env.VEO_MODEL || DEFAULT_MODEL;
  const durationSeconds = Number(process.env.VEO_DURATION_SECONDS) || 8;
  const authHeaders = { 'x-goog-api-key': key } as const;

  // 1) 생성 시작 (image 있으면 image-to-video)
  const instance: Record<string, unknown> = { prompt: input.prompt };
  if (input.image) {
    instance.image = { bytesBase64Encoded: input.image.base64, mimeType: input.image.mimeType };
  }
  const startRes = await fetch(`${GEMINI_API_BASE}/models/${model}:predictLongRunning`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      instances: [instance],
      parameters: { aspectRatio: '16:9', durationSeconds },
    }),
    cache: 'no-store',
  });
  if (!startRes.ok) {
    throw veoError('생성 시작', startRes.status, await startRes.text().catch(() => ''));
  }
  const opName = ((await startRes.json()) as { name?: string }).name;
  if (!opName) throw new Error('VEO_START_FAILED: operation name 이 응답에 없습니다.');

  // 2) 폴링 (done:true 까지, 상한/백오프)
  const started = Date.now();
  let interval = POLL_INTERVAL_MS;
  let op: VeoOperation | null = null;
  for (let polls = 0; polls < POLL_MAX_COUNT; polls++) {
    if (Date.now() - started > POLL_TOTAL_MAX_MS) break;
    await sleep(interval);
    interval = Math.min(Math.round(interval * POLL_BACKOFF), POLL_INTERVAL_MAX_MS);
    const pollRes = await fetch(`${GEMINI_API_BASE}/${opName}`, { headers: authHeaders, cache: 'no-store' });
    if (!pollRes.ok) {
      throw veoError('폴링', pollRes.status, await pollRes.text().catch(() => ''));
    }
    op = (await pollRes.json()) as VeoOperation;
    if (op.done) break;
  }
  if (!op?.done) {
    throw new Error(
      `VEO_TIMEOUT: 영상 생성이 상한(${Math.round(POLL_TOTAL_MAX_MS / 60000)}분 / ${POLL_MAX_COUNT}폴) 내 완료되지 않았습니다.`,
    );
  }
  if (op.error) {
    throw new Error(`VEO_GENERATION_ERROR: ${op.error.message ?? JSON.stringify(op.error).slice(0, 200)}`);
  }

  const gvr = op.response?.generateVideoResponse;
  const uri = gvr?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reason = gvr?.raiMediaFilteredReasons?.join('; ');
    throw new Error(
      `VEO_NO_OUTPUT: 응답에 영상 uri가 없습니다${reason ? ` (안전필터: ${reason})` : ' (안전필터 차단 가능)'}.`,
    );
  }

  // 3) 다운로드 → Supabase Storage 업로드
  const dlRes = await fetch(uri, { headers: authHeaders, cache: 'no-store' });
  if (!dlRes.ok) {
    throw veoError('영상 다운로드', dlRes.status, await dlRes.text().catch(() => ''));
  }
  const ct = dlRes.headers.get('content-type') || 'video/mp4';
  const mimeType = ct.includes('video') ? ct : 'video/mp4';
  const bytes = Buffer.from(await dlRes.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error('VEO_EMPTY_DOWNLOAD: 다운로드된 영상이 비어 있습니다.');
  return { bytes, mimeType };
}

/** 테넌트 경로: Veo 생성 → Supabase Storage 업로드 → 공개 URL. */
export async function generateVeoVideo(input: VeoInput): Promise<{ url: string; poster?: string }> {
  const { bytes, mimeType } = await generateVeoVideoBytes(input);
  const url = await uploadAiVideo({ bytes, mimeType, prefix: 'videos' });
  return { url }; // poster 는 파이프라인이 입력 이미지로 세팅 (ffmpeg 미도입)
}
