/**
 * POST /api/contact — anakslabs.com 문의 폼 수신.
 *
 * 정적 사이트(anakslabs.com)에서 cross-origin fetch 로 들어오므로 site-events 와
 * 같은 공개 CORS 라우트 형태다. 다만 저쪽과 달리 사람이 쓴 내용을 받으므로
 * 스팸 방어가 필요하고, 그래서 허니팟·레이트리밋·본문 크기 제한을 함께 건다.
 *
 * 저장과 알림은 분리한다. 알림 메일이 실패해도 문의는 이미 DB 에 있어야 한다 —
 * 반대로 묶으면 Resend 장애 한 번에 리드가 통째로 사라진다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '@/lib/env';
import { withApiHandler } from '@/app/api/_lib/http';

const MAX_BODY_BYTES = 8_192;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

const hits = new Map<string, number[]>();

function allow(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

const payloadSchema = z
  .object({
    site: z.string().trim().min(1).max(300),
    email: z.string().trim().email().max(320),
    note: z.string().trim().max(4000).optional().default(''),
    /** 허니팟. 사람이 볼 수 없는 칸이므로 채워져 있으면 봇이다. */
    company: z.string().max(200).optional().default(''),
    source: z.string().trim().max(120).optional().default('contact'),
  })
  .strict();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://anakslabs.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
} as const;

function cors(body: unknown, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
  return response;
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** 원문 IP·UA 는 저장도 로그도 하지 않는다. 여기서 해시로 바꾸고 버린다. */
function clientHash(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  return createHash('sha256').update(`${ip}|${ua}`).digest('hex');
}

async function notify(subject: string, email: string, note: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  // REPORT_FROM_EMAIL is the sender the monthly reports already go out as, so it
  // is a verified Resend identity. Inventing an address here would look right and
  // then be rejected at send time, and this notification fails silently by design.
  const from = process.env.REPORT_FROM_EMAIL;
  if (!key || !from) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: ['service@anakslabs.com'],
      reply_to: email,
      subject: `New inquiry — ${subject}`,
      text: [`Site or business: ${subject}`, `Email: ${email}`, '', note || '(no note)'].join('\n'),
    }),
  });
}

export const POST = withApiHandler(async (request: NextRequest) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return cors({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Message is too long.' } }, 413);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return cors({ error: { code: 'INVALID_JSON', message: 'This is not valid JSON.' } }, 400);
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return cors({ error: { code: 'VALIDATION_ERROR', message: 'Check the fields and try again.' } }, 400);
  }

  // 봇에게는 성공을 돌려준다. 거절을 알려주면 허니팟의 위치가 드러난다.
  if (parsed.data.company.trim() !== '') return cors({ ok: true }, 202);

  const hash = clientHash(request);
  if (!allow(hash)) {
    return cors({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }, 429);
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from('inbound_inquiries').insert({
    subject: parsed.data.site,
    email: parsed.data.email,
    note: parsed.data.note || null,
    source: parsed.data.source,
    client_hash: hash,
  });
  if (error) {
    return cors({ error: { code: 'STORE_FAILED', message: 'Could not record that. Try again.' } }, 500);
  }

  // 저장이 끝난 뒤에 알린다. 여기서 실패해도 문의는 이미 남아 있다.
  try {
    await notify(parsed.data.site, parsed.data.email, parsed.data.note);
  } catch {
    /* 알림은 부가 기능이다. 실패를 제출자에게 전가하지 않는다. */
  }

  return cors({ ok: true }, 201);
});
