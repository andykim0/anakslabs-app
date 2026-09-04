/**
 * POST /api/contact — anakslabs.com 문의 폼 수신.
 *
 * 정적 사이트(anakslabs.com)에서 cross-origin fetch 로 들어오므로 CORS 가 필요하다.
 * 허용 출처 규칙은 `_lib/cors` 한 곳에만 있고(/api/scan 과 공유), withCors 가 바깥에서
 * 감싸므로 성공·거절·크래시 어느 분기로 나가도 헤더가 붙는다. site-events 와 달리 `*` 가
 * 아니라 허용목록이다 — 사람이 쓴 내용을 받는 입력구를 아무 페이지에나 열어 줄 수 없다.
 * 그리고 저쪽과 달리 스팸 방어가 필요해 허니팟·레이트리밋·본문 크기 제한을 함께 건다.
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
import { corsPreflight, withCors } from '@/app/api/_lib/cors';

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

export const OPTIONS = corsPreflight();

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

export const POST = withCors(withApiHandler(async (request: NextRequest) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Message is too long.' } }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'This is not valid JSON.' } }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Check the fields and try again.' } }, { status: 400 });
  }

  // 봇에게는 성공을 돌려준다. 거절을 알려주면 허니팟의 위치가 드러난다.
  if (parsed.data.company.trim() !== '') return NextResponse.json({ ok: true }, { status: 202 });

  const hash = clientHash(request);
  if (!allow(hash)) {
    return NextResponse.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }, { status: 429 });
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
    return NextResponse.json({ error: { code: 'STORE_FAILED', message: 'Could not record that. Try again.' } }, { status: 500 });
  }

  // 저장이 끝난 뒤에 알린다. 여기서 실패해도 문의는 이미 남아 있다.
  try {
    await notify(parsed.data.site, parsed.data.email, parsed.data.note);
  } catch {
    /* 알림은 부가 기능이다. 실패를 제출자에게 전가하지 않는다. */
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}));
