/**
 * API 공통 헬퍼 — 실패 응답 포맷 / zod 바디 파싱 / 에러 바운더리.
 * 실패 응답은 항상 { error: { code, message, ...extra } } JSON.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

/** 실패 응답 공통 포맷. extra는 error 객체 안에 병합 (예: INSUFFICIENT_CREDITS의 balance) */
export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export type ParsedBody<S extends z.ZodType> =
  | { ok: true; data: z.output<S> }
  | { ok: false; res: NextResponse };

/** 요청 JSON 바디를 zod 스키마로 검증. 실패 시 400 응답을 만들어 반환 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<ParsedBody<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      res: apiError(400, 'INVALID_JSON', 'The request body is not valid JSON.'),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) =>
        issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      )
      .join(' / ');
    return {
      ok: false,
      res: apiError(400, 'VALIDATION_ERROR', `Check the submitted values. (${detail})`),
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * 라우트 핸들러 공통 에러 바운더리.
 * 미처리 예외를 { error: { code: 'INTERNAL_ERROR' } } 500 JSON으로 변환한다.
 */
export function withApiHandler<Ctx = unknown>(
  handler: (request: NextRequest, context: Ctx) => Promise<Response>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      console.error('[api] unhandled error:', err);
      return apiError(500, 'INTERNAL_ERROR', 'Something went wrong on our end. Try again in a moment.');
    }
  };
}
