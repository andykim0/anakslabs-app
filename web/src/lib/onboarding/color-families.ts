/**
 * [v4 #2c] 2단계 컬러 선택 데이터 — 색 계열 8개 → 각 계열의 명암 5단(밝은→어두운).
 * "색이 한번에 너무 많이 노출"되는 문제 해결: 먼저 계열을 고르고, 그 계열의 5단만 보여준다.
 * 각 hex는 유효(/^#[0-9a-f]{6}$/i)하고 40개 전부 중복 없음(불변식 테스트로 고정).
 */
export interface ColorFamily {
  id: string;
  label: string;
  /** 밝은→어두운 5단 */
  shades: readonly [string, string, string, string, string];
}

export const COLOR_FAMILIES: readonly ColorFamily[] = [
  { id: 'red', label: 'Red and burgundy', shades: ['#f2b8b5', '#e07a75', '#c0392b', '#8e2c22', '#5c1e18'] },
  { id: 'orange', label: 'Orange and terracotta', shades: ['#f5c8a8', '#e79a6a', '#c97a3c', '#a85a28', '#7a3f1a'] },
  { id: 'yellow', label: 'Yellow and brown', shades: ['#f0d9a0', '#d9b45c', '#b8922e', '#8a6a20', '#5c4718'] },
  { id: 'green', label: 'Green and olive', shades: ['#c3d4a8', '#8faa63', '#5f7a3f', '#455a2d', '#2c3a1c'] },
  { id: 'blue', label: 'Blue', shades: ['#b8d0ef', '#6fa0d8', '#2d63f0', '#1f4aad', '#152f6e'] },
  { id: 'navy', label: 'Navy and indigo', shades: ['#b3b8e0', '#6f75c6', '#3b4296', '#282d68', '#171a3f'] },
  { id: 'purple', label: 'Purple', shades: ['#d8c3e8', '#a978d0', '#7a42a8', '#5a2c7d', '#3a1c52'] },
  { id: 'neutral', label: 'Neutral: gray, beige, and charcoal', shades: ['#f4f2ee', '#c9c6bf', '#8a8780', '#4b4945', '#26241f'] },
] as const;
