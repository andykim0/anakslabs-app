'use client';

/**
 * The US fork keeps the renderer seam for legacy serialized connector blocks,
 * but it does not load the Korea-only Kakao or Naver browser SDKs.
 * Existing anchors still retain their progressive-enhancement href fallback.
 */
export function ConnectorRuntime() {
  return null;
}
