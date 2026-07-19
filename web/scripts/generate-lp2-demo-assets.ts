/**
 * LP2 F8 — two fictional marketing demo assets, with a hard paid-call ceiling.
 *
 * This is intentionally not the onboarding orchestration: onboarding may generate three
 * image candidates and section fills. Here each explicit invocation is limited to exactly
 * one Gemini image call and one Veo Fast image-to-video call, with no provider retry.
 * A receipt is written before every paid call, so a failed/ambiguous attempt cannot be
 * silently repeated.
 *
 * Dry run:
 *   tsx --tsconfig scripts/tsconfig.json scripts/generate-lp2-demo-assets.ts --demo=woldam
 * Paid run (estimated $0.999 per demo):
 *   tsx --tsconfig scripts/tsconfig.json scripts/generate-lp2-demo-assets.ts \
 *     --demo=woldam --execute-paid --ack-cost-usd=0.999
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { generateGeminiImage } from '@/lib/ai/gemini-image';
import { generateVeoVideoBytes } from '@/lib/ai/veo-video';
import { buildMotionPrompt, FAST_MODEL } from '@/lib/ai/video-pipeline-core';
import { buildCandidateBlueprints } from '@/lib/data/design-candidates';
import { pagePlanFromTemplate, planFromTemplate, resolveTemplate } from '@/lib/data/site-blueprints';
import type { SurveyInput } from '@/lib/types/domain';
import { VIDEO_HARD_MAX_BYTES, VIDEO_TARGET_BYTES } from '@/lib/motion/asset-limits';

const ROOT = process.cwd();
const RECEIPT_DIR = join(ROOT, 'scripts/out/lp2-demo-receipts');
const PUBLIC_DIR = join(ROOT, 'public/cases/demos');

const IMAGE_UNIT_USD = 0.039;
const VIDEO_UNIT_USD = 0.96;
const EXPECTED_PER_DEMO_USD = IMAGE_UNIT_USD + VIDEO_UNIT_USD;
const BATCH_HARD_CAP_USD = 5;
const PROFILE_VERSION = 1;

type DemoId = 'woldam' | 'yeobaek-workshop';

interface DemoProfile {
  id: DemoId;
  candidateId: 'cand-dark-luxury' | 'cand-warm-cozy';
  survey: SurveyInput;
}

const WOLDAM_TEMPLATE = resolveTemplate('local_store', '파인다이닝');
const YEOBAEK_TEMPLATE = resolveTemplate('company_brand', '수공예 조명 브랜드');

const PROFILES: Record<DemoId, DemoProfile> = {
  woldam: {
    id: 'woldam',
    candidateId: 'cand-dark-luxury',
    survey: {
      purposeId: 'local_store',
      purpose: '가상 데모 · 파인다이닝 브랜드 소개',
      businessName: '월담',
      industry: '파인다이닝',
      region: '',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(WOLDAM_TEMPLATE),
      pagePlan: pagePlanFromTemplate(WOLDAM_TEMPLATE),
      templateId: WOLDAM_TEMPLATE.id,
      siteGoal: 'reserve',
      tagline: '계절의 결을 천천히 차립니다',
      tone: ['우아한', '차분한'],
      colorPreference: '#6B2737',
      secondaryColor: '#C39A5A',
      imageStyle: 'illustration',
      imageDirectionId: 'abstract_editorial',
      heroImageChoice: 'ai-1',
      videoAddon: true,
      conceptMode: 'fictional',
      mode: 'fresh',
      providedContent:
        '[소개]\n월담은 계절의 온도와 여백을 한 상의 흐름으로 풀어낸 가상 파인다이닝 브랜드입니다.\n' +
        '[안내]\n본 사이트는 다보임의 시네마틱 기능을 보여주기 위한 가상 데모입니다.',
      highlights: [
        '한 계절을 네 장면으로 보여주는 가상 코스',
        '빛과 여백을 중심으로 설계한 가상 브랜드 콘셉트',
        '이 사이트의 상호·메뉴·운영 정보는 모두 데모용',
      ],
    },
  },
  'yeobaek-workshop': {
    id: 'yeobaek-workshop',
    candidateId: 'cand-warm-cozy',
    survey: {
      purposeId: 'company_brand',
      purpose: '가상 데모 · 수공예 브랜드 소개',
      businessName: '여백공작소',
      industry: '수공예 조명 브랜드',
      region: '',
      referenceImageUrls: [],
      sectionPlan: planFromTemplate(YEOBAEK_TEMPLATE),
      pagePlan: pagePlanFromTemplate(YEOBAEK_TEMPLATE),
      templateId: YEOBAEK_TEMPLATE.id,
      siteGoal: 'trust',
      tagline: '손의 시간으로 빛을 만듭니다',
      tone: ['따뜻한', '미니멀'],
      colorPreference: '#B8613B',
      secondaryColor: '#2F6F68',
      imageStyle: 'illustration',
      imageDirectionId: 'illustration_collage',
      heroImageChoice: 'ai-1',
      videoAddon: true,
      conceptMode: 'fictional',
      mode: 'fresh',
      providedContent:
        '[소개]\n여백공작소는 종이의 결, 빛의 번짐, 손의 리듬을 탐구하는 가상 수공예 브랜드입니다.\n' +
        '[안내]\n본 사이트는 다보임의 시네마틱 기능을 보여주기 위한 가상 데모입니다.',
      highlights: [
        '종이의 결에서 출발한 가상 브랜드 콘셉트',
        '한 장의 추상 콜라주만 사용하는 데모',
        '제품·실적·고객 정보는 만들어 내지 않음',
      ],
    },
  },
};

interface PaidReceipt {
  profileVersion: number;
  demoId: DemoId;
  image: { attemptedAt?: string; status: 'not-attempted' | 'started' | 'succeeded' | 'failed'; bytes?: number };
  video: { attemptedAt?: string; status: 'not-attempted' | 'started' | 'succeeded' | 'failed'; bytes?: number };
  estimatedChargedUsd: number;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function profileOf(value: string | undefined): DemoProfile {
  if (value === 'woldam' || value === 'yeobaek-workshop') return PROFILES[value];
  throw new Error('DEMO_ID_REQUIRED: --demo=woldam 또는 --demo=yeobaek-workshop 중 하나를 지정하세요.');
}

function receiptPath(profile: DemoProfile): string {
  return join(RECEIPT_DIR, `${profile.id}-v${PROFILE_VERSION}.json`);
}

function readReceipt(profile: DemoProfile): PaidReceipt {
  const path = receiptPath(profile);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as PaidReceipt;
  return {
    profileVersion: PROFILE_VERSION,
    demoId: profile.id,
    image: { status: 'not-attempted' },
    video: { status: 'not-attempted' },
    estimatedChargedUsd: 0,
  };
}

function writeReceipt(profile: DemoProfile, receipt: PaidReceipt): void {
  mkdirSync(RECEIPT_DIR, { recursive: true });
  writeFileSync(receiptPath(profile), `${JSON.stringify(receipt, null, 2)}\n`);
}

function beginPaidCall(profile: DemoProfile, kind: 'image' | 'video', unitUsd: number): PaidReceipt {
  mkdirSync(RECEIPT_DIR, { recursive: true });
  const lockPath = `${receiptPath(profile)}.${kind}.lock`;
  let lock: number;
  try {
    lock = openSync(lockPath, 'wx');
  } catch {
    throw new Error(`PAID_ATTEMPT_IN_PROGRESS: ${profile.id} ${kind} 유료 호출 잠금이 이미 존재합니다.`);
  }
  try {
    const receipt = readReceipt(profile);
    if (receipt[kind].status !== 'not-attempted') {
      throw new Error(
        `PAID_ATTEMPT_ALREADY_CONSUMED: ${profile.id} ${kind}는 이미 ${receipt[kind].status} 상태입니다. ` +
        '재시도는 새로 승인된 profile version에서만 가능합니다.',
      );
    }
    const next: PaidReceipt = {
      ...receipt,
      [kind]: { status: 'started', attemptedAt: new Date().toISOString() },
      estimatedChargedUsd: Number((receipt.estimatedChargedUsd + unitUsd).toFixed(3)),
    };
    writeReceipt(profile, next);
    return next;
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

function finishPaidCall(
  profile: DemoProfile,
  receipt: PaidReceipt,
  kind: 'image' | 'video',
  status: 'succeeded' | 'failed',
  bytes?: number,
): PaidReceipt {
  const next: PaidReceipt = {
    ...receipt,
    [kind]: { ...receipt[kind], status, ...(bytes === undefined ? {} : { bytes }) },
  };
  writeReceipt(profile, next);
  return next;
}

function runFfmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

function rawExtension(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  if (mimeType.includes('jpeg')) return '.jpg';
  if (mimeType.includes('webm')) return '.webm';
  return '.mp4';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main(): Promise<void> {
  const profile = profileOf(arg('demo'));
  const paid = flag('execute-paid');
  const acknowledged = Number(arg('ack-cost-usd'));
  if (EXPECTED_PER_DEMO_USD * Object.keys(PROFILES).length > BATCH_HARD_CAP_USD) {
    throw new Error('BATCH_COST_CAP_EXCEEDED: 고정 프로필 비용이 $5 상한을 초과합니다.');
  }

  const blueprint = buildCandidateBlueprints(profile.survey)
    .find((candidate) => candidate.id === profile.candidateId);
  if (!blueprint?.heroImagePrompt) throw new Error(`SAFE_HERO_PROMPT_MISSING: ${profile.id}`);
  // The first selected tone is the customer's primary direction. Passing the whole
  // comma-joined string can let a later matcher win by registry order.
  const motionPrompt = buildMotionPrompt(profile.survey.tone?.[0] ?? '', 'ambient-ai');

  console.log(`[lp2-demo] ${profile.id} / ${profile.candidateId}`);
  console.log(`[lp2-demo] paid call cap: image=1 ($${IMAGE_UNIT_USD}), video=1 ($${VIDEO_UNIT_USD})`);
  console.log(`[lp2-demo] expected maximum for this invocation: $${EXPECTED_PER_DEMO_USD.toFixed(3)}`);
  console.log(`[lp2-demo] image prompt: ${blueprint.heroImagePrompt}`);
  console.log(`[lp2-demo] motion prompt: ${motionPrompt}`);
  if (!paid) {
    console.log('[lp2-demo] DRY RUN — provider calls: 0. Add --execute-paid --ack-cost-usd=0.999 to execute.');
    return;
  }
  if (acknowledged !== EXPECTED_PER_DEMO_USD) {
    throw new Error(`COST_ACK_REQUIRED: --ack-cost-usd=${EXPECTED_PER_DEMO_USD.toFixed(3)}가 필요합니다.`);
  }

  const outDir = join(PUBLIC_DIR, profile.id);
  const workDir = join(RECEIPT_DIR, `${profile.id}-work`);
  const posterPath = join(outDir, 'poster.webp');
  const videoPath = join(outDir, 'hero.mp4');
  if (!flag('replace-existing-assets') && (existsSync(posterPath) || existsSync(videoPath))) {
    throw new Error(
      `PUBLIC_ASSET_ALREADY_EXISTS: ${profile.id} 자산이 이미 있습니다. ` +
      '새 승인·새 profile version 없이 유료 생성을 반복하지 않습니다.',
    );
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });

  let receipt = beginPaidCall(profile, 'image', IMAGE_UNIT_USD);
  let image: Awaited<ReturnType<typeof generateGeminiImage>>;
  try {
    image = await generateGeminiImage({ prompt: blueprint.heroImagePrompt, aspectRatio: '16:9' });
    receipt = finishPaidCall(profile, receipt, 'image', 'succeeded', Buffer.byteLength(image.base64, 'base64'));
  } catch (error) {
    finishPaidCall(profile, receipt, 'image', 'failed');
    throw error;
  }

  const rawImagePath = join(workDir, `source${rawExtension(image.mimeType)}`);
  const rawImageBytes = Buffer.from(image.base64, 'base64');
  writeFileSync(rawImagePath, rawImageBytes);
  runFfmpeg([
    '-i', rawImagePath,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '88', posterPath,
  ]);

  receipt = beginPaidCall(profile, 'video', VIDEO_UNIT_USD);
  let video: Awaited<ReturnType<typeof generateVeoVideoBytes>>;
  try {
    video = await generateVeoVideoBytes({
      prompt: motionPrompt,
      image: { base64: image.base64, mimeType: image.mimeType },
      model: FAST_MODEL,
      resolution: '1080p',
    });
    receipt = finishPaidCall(profile, receipt, 'video', 'succeeded', video.bytes.byteLength);
  } catch (error) {
    finishPaidCall(profile, receipt, 'video', 'failed');
    throw error;
  }

  const rawVideoPath = join(workDir, `source${rawExtension(video.mimeType)}`);
  writeFileSync(rawVideoPath, video.bytes);
  runFfmpeg([
    '-i', rawVideoPath,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-maxrate', '6M', '-bufsize', '12M',
    '-pix_fmt', 'yuv420p', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
    '-an', '-movflags', '+faststart', videoPath,
  ]);

  const outputBytes = readFileSync(videoPath).byteLength;
  if (outputBytes > VIDEO_HARD_MAX_BYTES) {
    throw new Error(`VIDEO_SIZE_BLOCKED: ${outputBytes} bytes > ${VIDEO_HARD_MAX_BYTES}`);
  }
  if (outputBytes > VIDEO_TARGET_BYTES) {
    console.warn(`[lp2-demo] size warning: ${(outputBytes / 1024 / 1024).toFixed(2)}MB > 3MB target`);
  }

  const summary = {
    demoId: profile.id,
    fictionalDemo: true,
    origin: 'ai_generated',
    providerCalls: { image: 1, video: 1 },
    model: FAST_MODEL,
    resolution: '1920x1080',
    encoding: { video: 'h264', gop: 1, audio: false },
    assets: {
      poster: `/cases/demos/${profile.id}/poster.webp`,
      video: `/cases/demos/${profile.id}/hero.mp4`,
      posterBytes: readFileSync(posterPath).byteLength,
      videoBytes: outputBytes,
      posterSha256: sha256(readFileSync(posterPath)),
      videoSha256: sha256(readFileSync(videoPath)),
    },
    estimatedChargedUsd: receipt.estimatedChargedUsd,
  };
  // Operational receipt stays outside `public/`; customer-facing static assets never expose
  // provider/model identifiers. `scripts/out` is gitignored and server-only by convention.
  writeFileSync(join(RECEIPT_DIR, `${profile.id}-generation.json`), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`[lp2-demo] DONE ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error('[lp2-demo] FAILED', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
