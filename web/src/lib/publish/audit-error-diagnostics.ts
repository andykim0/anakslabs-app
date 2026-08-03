export type PublishAuditStage = 'render' | 'parse' | 'rules' | 'artifact-audit';

const UNKNOWN_PAGE = '<unknown-page>';
const UNKNOWN_STAGE = '<unknown-stage>';
const MAX_LOG_FIELD_LENGTH = 500;

/**
 * Carries the exact preflight boundary without changing fail-closed behavior.
 * The original error is retained only for server-side diagnostics and is scrubbed before logging.
 */
export class PublishAuditStageError extends Error {
  readonly auditStage: PublishAuditStage;
  readonly auditPageSlug: string;
  readonly originalError: unknown;

  constructor(error: unknown, stage: PublishAuditStage, pageSlug: string) {
    super(error instanceof Error ? error.message : 'Unknown publish audit failure', {
      cause: error,
    });
    this.name = error instanceof Error ? error.name : 'UnknownError';
    this.auditStage = stage;
    this.auditPageSlug = pageSlug;
    this.originalError = error;
  }
}

export function withPublishAuditContext(
  error: unknown,
  stage: PublishAuditStage,
  pageSlug: string,
): PublishAuditStageError {
  if (error instanceof PublishAuditStageError) return error;
  return new PublishAuditStageError(error, stage, pageSlug);
}

function truncate(value: string): string {
  return value.length <= MAX_LOG_FIELD_LENGTH
    ? value
    : `${value.slice(0, MAX_LOG_FIELD_LENGTH - 1)}…`;
}

/**
 * Scrub secrets and customer identifiers from an error field while retaining the failure shape.
 * This intentionally favors redaction over completeness: server logs are diagnostic, not evidence storage.
 */
export function scrubPublishAuditLogText(value: string): string {
  return truncate(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted-token]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(
      /\b(?:asset(?:[_-]?id)?|client(?:[_-]?id)?|customer(?:[_-]?id)?|owner(?:[_-]?id)?|site(?:[_-]?id)?|tenant(?:[_-]?id)?|token|signature|sig)\s*[:=]\s*["']?[^\s,"'}&]+/gi,
      (match) => `${match.slice(0, Math.max(match.indexOf(':'), match.indexOf('=')) + 1)}[redacted]`,
    )
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\basset[-_][A-Za-z0-9._~-]+\b/gi, '[redacted-asset]')
    .replace(/\b[0-9a-f]{32,}\b/gi, '[redacted-hash]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]')
    .replace(/\bhttps?:\/\/[^\s)]+/gi, '[redacted-url]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

function errorName(error: unknown): string {
  const value = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(value) ? value : 'UnknownError';
}

function sourceError(error: unknown): unknown {
  return error instanceof PublishAuditStageError ? error.originalError : error;
}

function topStackFrame(error: unknown): string {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return '<unavailable>';
  const frame = stack.split('\n').map((line) => line.trim()).find((line) => line.startsWith('at '));
  if (!frame) return '<unavailable>';

  const cwd = process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return scrubPublishAuditLogText(
    frame
      .replace(new RegExp(`file://${cwd}/?`, 'g'), '')
      .replace(new RegExp(`${cwd}/?`, 'g'), '')
      .replace(/(?:file:\/\/)?\/?(?:[^\s():]+\/)+(?=web\/src\/)/g, ''),
  );
}

export interface SafePublishAuditErrorDetails {
  errorName: string;
  errorMessage: string;
  stage: PublishAuditStage | typeof UNKNOWN_STAGE;
  pageSlug: string;
  stackFrame: string;
}

/** The only shape routes may place in publish-audit exception logs. */
export function safePublishAuditErrorDetails(error: unknown): SafePublishAuditErrorDetails {
  const contextual = error instanceof PublishAuditStageError ? error : null;
  const original = sourceError(error);
  const rawMessage = original instanceof Error ? original.message : String(original ?? 'Unknown publish audit failure');
  return {
    errorName: errorName(original),
    errorMessage: scrubPublishAuditLogText(rawMessage) || 'Unknown publish audit failure',
    stage: contextual?.auditStage ?? UNKNOWN_STAGE,
    pageSlug: scrubPublishAuditLogText(contextual?.auditPageSlug ?? UNKNOWN_PAGE),
    stackFrame: topStackFrame(original),
  };
}
