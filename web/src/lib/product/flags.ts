/**
 * 가격 V6에서 동면한 제품 표면의 서버 권위 스위치.
 * 명시적으로 `1`인 경우에만 열리며, 기본값은 항상 닫힘이다.
 */
export function creditsEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.CREDITS_ENABLED === '1';
}

export function aiEditEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.AI_EDIT_ENABLED === '1';
}
