/** 신규 ID 발급만 제어한다. 저장된 핀의 렌더는 이 플래그를 읽지 않는다. */
export function templateGalleryEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.TEMPLATE_GALLERY_ENABLED === '1';
}
