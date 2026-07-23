import { parse, type HTMLElement } from 'node-html-parser';

const NON_CONTENT_SELECTOR = 'script, style, noscript, template';
const PRESENTATION_ATTRIBUTES = new Set([
  'class',
  'style',
  'width',
  'height',
]);

function contentClone(root: HTMLElement): HTMLElement {
  const clone = parse(root.toString());
  for (const element of clone.querySelectorAll(NON_CONTENT_SELECTOR)) element.remove();
  return clone;
}

/** 모든 스캔 대상에 공통 적용되는 서버 HTML 가시 텍스트 투영. */
export function extractVisibleText(root: HTMLElement): string {
  return contentClone(root).text.replace(/\s+/gu, ' ').trim();
}

/** 반복 헤더·푸터 신호가 본문 휴리스틱을 발화하지 않도록 실제 main 경계를 우선한다. */
export function mainContentRoot(root: HTMLElement): HTMLElement {
  return root.querySelector('main, [role="main"]') ?? root;
}

export function extractMainVisibleText(root: HTMLElement): string {
  return extractVisibleText(mainContentRoot(root));
}

/**
 * 본문 비율의 분모. 실행 코드·CSS와 class/style/data-* 같은 표현·런타임 속성은
 * 콘텐츠 양이 아니므로 제거한다. 외부 사이트와 다보임 발행물에 같은 계산을 쓴다.
 */
export function contentMarkupLength(root: HTMLElement): number {
  const clone = contentClone(root);
  for (const element of clone.querySelectorAll('*')) {
    for (const name of Object.keys(element.attributes)) {
      if (PRESENTATION_ATTRIBUTES.has(name) || name.startsWith('data-')) {
        element.removeAttribute(name);
      }
    }
  }
  return clone.toString().replace(/>\s+</gu, '><').trim().length;
}
