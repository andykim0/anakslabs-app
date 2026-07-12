/**
 * [F3 #7] 무드보드 레퍼런스 샘플 12종 — 각 샘플은 STYLE_DIRECTIONS의 특정 스타일의 '얼굴'.
 * 고객이 고른 샘플의 styleId가 SurveyInput.referenceStyleIds로 실려 selectDesignBriefs의
 * 스타일 선택에 가중치로 반영된다(우선순위: imageStyle 고정 > 샘플 가중 > POV 비중복).
 *
 * 13지선다(STYLE_DIRECTIONS 직접 노출)는 소상공인에게 선택 과부하라 하지 않는다 — 취향 입력은
 * 시각적 무드보드로, 최종 선택지는 후보 3안으로(절제 원칙). 업종군 커버리지 기준 큐레이션.
 * swatch = UI 칩용 대표 2색 그라디언트(장식). styleId는 STYLE_DIRECTIONS.id와 1:1 매핑.
 */
export interface ReferenceSample {
  id: string;
  label: string;
  /** STYLE_DIRECTIONS.id — 가중치 대상 */
  styleId: string;
  description: string;
  /** UI 칩 그라디언트 [from, to] */
  swatch: [string, string];
  /**
   * [v4 #2b] 이 무드의 대표색 시드 — 무드를 첫 번째로 고르면 colorPreference/secondaryColor로 기록되어
   * derivePalette가 6토큰을 파생한다. (primary=브랜드 주색, secondary=보조/배경 계열)
   */
  paletteSeed: { primary: string; secondary?: string };
}

export const REFERENCE_SAMPLES: ReferenceSample[] = [
  { id: 'ref-dark-luxury', label: '다크 럭셔리', styleId: 'dark-luxury', description: '깊은 어둠에 금빛 포인트 — 프리미엄·고요', swatch: ['#0f0e0c', '#b08d57'], paletteSeed: { primary: '#b08d57', secondary: '#1a1712' } },
  { id: 'ref-minimal-swiss', label: '미니멀 스위스', styleId: 'minimal-swiss', description: '흰 여백과 또렷한 타이포 — 절제·명료', swatch: ['#ffffff', '#111111'], paletteSeed: { primary: '#111111', secondary: '#f4f4f4' } },
  { id: 'ref-editorial', label: '에디토리얼 매거진', styleId: 'editorial-magazine', description: '아이보리 지면에 세리프 — 잡지 같은 결', swatch: ['#f5f1e8', '#7a2e2e'], paletteSeed: { primary: '#7a2e2e', secondary: '#f5f1e8' } },
  { id: 'ref-soft-clay', label: '소프트 클레이 3D', styleId: 'soft-clay-3d', description: '말랑한 3D 오브젝트 — 친근한 테크', swatch: ['#eef0ff', '#8b9cff'], paletteSeed: { primary: '#8b9cff', secondary: '#eef0ff' } },
  { id: 'ref-premium-3d', label: '프리미엄 3D 프로덕트', styleId: 'premium-3d-product', description: '다크 배경 위 입체 제품 — 앱·하드웨어', swatch: ['#0b1020', '#3b82f6'], paletteSeed: { primary: '#3b82f6', secondary: '#0b1020' } },
  { id: 'ref-organic', label: '내추럴 오가닉', styleId: 'organic-natural', description: '흙빛·풀빛 뉴트럴 — 자연·건강', swatch: ['#f3f0e7', '#6b7a4f'], paletteSeed: { primary: '#6b7a4f', secondary: '#f3f0e7' } },
  { id: 'ref-warm-cozy', label: '웜 코지', styleId: 'warm-cozy', description: '따뜻한 베이지·테라코타 — 카페·공간', swatch: ['#f7ede2', '#c98a5e'], paletteSeed: { primary: '#c98a5e', secondary: '#f7ede2' } },
  { id: 'ref-retro', label: '레트로 아날로그', styleId: 'retro-analog', description: '빈티지 색감과 질감 — 러스틱·감성', swatch: ['#efe7d8', '#b5502f'], paletteSeed: { primary: '#b5502f', secondary: '#efe7d8' } },
  { id: 'ref-glass', label: '글래스 모던', styleId: 'glass-modern', description: '유리 질감·라이트 블루 — 산뜻한 IT', swatch: ['#e8f0f7', '#5aa0d8'], paletteSeed: { primary: '#5aa0d8', secondary: '#e8f0f7' } },
  { id: 'ref-bold', label: '볼드 에너지', styleId: 'bold-energy', description: '강한 대비와 원색 — 대담·활기', swatch: ['#111111', '#ff5a3c'], paletteSeed: { primary: '#ff5a3c', secondary: '#111111' } },
  { id: 'ref-botanical', label: '보태니컬 일러스트', styleId: 'botanical-illust', description: '손그림 식물 일러스트 — 부드러운 감성', swatch: ['#eef3ea', '#5a8a5a'], paletteSeed: { primary: '#5a8a5a', secondary: '#eef3ea' } },
  { id: 'ref-flat-kids', label: '플랫 프렌들리 일러스트', styleId: 'flat-friendly-illust', description: '밝고 둥근 플랫 일러스트 — 키즈·공방', swatch: ['#fff3e6', '#ff9a3c'], paletteSeed: { primary: '#ff9a3c', secondary: '#fff3e6' } },
];

/** [F3 #7] 고른 샘플 id들 → 매핑 styleId들 (referenceStyleIds로 전송) */
export function styleIdsForSamples(sampleIds: string[]): string[] {
  const byId = new Map(REFERENCE_SAMPLES.map((s) => [s.id, s.styleId]));
  return sampleIds.map((id) => byId.get(id)).filter((v): v is string => Boolean(v));
}
