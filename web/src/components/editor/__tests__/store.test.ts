/**
 * 캔버스 에디터 스토어(`@/stores/editor`)의 행위 계약.
 *
 * 실제 zustand+zundo 싱글턴을 그대로 구동한다 — 재구현·하네스 없음.
 * 시간은 node:test의 Date 목으로 제어한다: 히스토리 그룹핑(HISTORY_GROUP_MS=200)이
 * `Date.now()` 기반이라, 실제 시계로는 "빠른 연속 커밋"과 "따로 친 두 번의 편집"을
 * 구분해 검증할 수 없다.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import {
  activeSections,
  findElementLocation,
  initializeEditor,
  redoEditor,
  undoEditor,
  useEditorStore,
  type ZOrderOp,
} from '@/stores/editor';
import {
  DESIGN_WIDTH,
  RESERVED_PAGE_SLUGS,
  emptySiteConfig,
  type CanvasElement,
  type ElementKind,
  type SiteConfig,
  type SitePage,
} from '@/lib/types/site';

const FROZEN_NOW = 1_760_000_000_000;
/** HISTORY_GROUP_MS(200ms)보다 크게 — 별개의 undo 단계로 커밋하려면 필요하다 */
const APART = 300;

const st = () => useEditorStore.getState();
const temporal = () => useEditorStore.temporal.getState();
const pages = () => st().config.pages;
const sections = () => activeSections(st().config);
const page = (slug: string) => pages().find((p) => p.slug === slug)!;

/** 별개의 히스토리 단계로 기록되도록 시계를 밀고 나서 실행한다 */
function apart<T>(fn: () => T): T {
  mock.timers.tick(APART);
  return fn();
}

function boot(config: SiteConfig = emptySiteConfig('테스트 사이트')) {
  initializeEditor('site-1', config, 'premium');
}

/** 요소 n개를 가진 섹션 하나를 만들고 [섹션id, 요소id[]] 반환 */
function sectionWith(kinds: ElementKind[]): [string, string[]] {
  const sectionId = apart(() => st().addSection('custom'));
  const ids = kinds.map((kind) => apart(() => st().addElement(sectionId, kind))!);
  return [sectionId, ids];
}

function elementById(id: string): CanvasElement {
  const found = findElementLocation(st().config, id);
  assert.ok(found, `요소 ${id}를 찾지 못했다`);
  return found.element;
}

/**
 * 테스트 간 시계는 단조 증가해야 한다. 그룹핑 가드가 모듈 스코프의 `lastCommit`과
 * `Date.now()` 차이를 보기 때문에, 매 테스트를 같은 시각으로 되감으면 그 차이가 음수가 되어
 * 이후 커밋이 전부 "같은 그룹"으로 삼켜진다(스토어 결함이 아니라 목 시계의 문제).
 */
let clock = FROZEN_NOW;

beforeEach(() => {
  clock += 3_600_000;
  mock.timers.enable({ apis: ['Date'], now: clock });
  boot();
});
afterEach(() => {
  mock.timers.reset();
});

// ---------------------------------------------------------------- undo/redo

describe('undo/redo — 그룹핑과 100단계 한도', () => {
  test('200ms 넘게 떨어진 두 커밋은 각각 되돌릴 수 있는 단계가 된다', () => {
    assert.equal(temporal().pastStates.length, 0, '초기화 직후 히스토리는 비어 있어야 한다');

    const sectionId = apart(() => st().addSection('hero'));
    assert.equal(temporal().pastStates.length, 1);
    apart(() => st().addElement(sectionId, 'text'));
    assert.equal(temporal().pastStates.length, 2);

    undoEditor();
    assert.equal(sections()[0].elements.length, 0, '한 번의 undo는 요소 추가만 되돌려야 한다');
    assert.equal(sections().length, 1, '섹션까지 사라지면 그룹핑이 과하게 묶인 것이다');

    undoEditor();
    assert.equal(sections().length, 0);
  });

  test('200ms 안의 연속 커밋은 한 단계로 묶여 한 번에 되돌아간다', () => {
    const sectionId = apart(() => st().addSection('hero'));
    apart(() => st().addElement(sectionId, 'text'));
    const before = temporal().pastStates.length;
    assert.equal(before, 2);

    // 시계를 밀지 않는다 = 같은 그룹 윈도우 → 새 단계가 생기지 않아야 한다
    st().addElement(sectionId, 'button');
    assert.equal(sections()[0].elements.length, 2);
    assert.equal(temporal().pastStates.length, before, '연속 커밋이 별도 undo 단계를 만들었다');

    undoEditor();
    assert.equal(
      sections()[0].elements.length,
      0,
      '묶인 두 요소 추가는 한 번의 undo로 통째로 돌아가야 한다',
    );
  });

  test('redo가 되돌린 편집을 그대로 복원한다', () => {
    const sectionId = apart(() => st().addSection('hero'));
    apart(() => st().addElement(sectionId, 'text'));
    const withElement = st().config;

    undoEditor();
    assert.equal(temporal().futureStates.length, 1);
    redoEditor();
    assert.equal(temporal().futureStates.length, 0);
    assert.deepEqual(st().config, withElement);
  });

  test('빈 히스토리에서의 undo/redo는 아무것도 하지 않는다', () => {
    const before = st().config;
    const dirtyBefore = st().dirty;
    undoEditor();
    assert.equal(st().config, before, 'undo가 config를 건드렸다');
    assert.equal(st().dirty, dirtyBefore, 'undo가 dirty를 잘못 세웠다');
    redoEditor();
    assert.equal(st().config, before);
    assert.equal(st().dirty, dirtyBefore);
  });

  test('undo는 dirty를 다시 세워 자동저장이 되돌린 결과까지 저장하게 한다', () => {
    apart(() => st().addSection('hero'));
    st().setSaveStatus('saved');
    assert.equal(st().dirty, false);

    useEditorStore.setState({ editingElementId: 'x', guides: { sectionId: 's', v: [1], h: [] } });
    undoEditor();
    assert.equal(st().dirty, true, 'undo 결과가 저장되지 않고 남는다');
    assert.equal(st().editingElementId, null, 'undo 후 인라인 편집이 유령으로 남았다');
    assert.equal(st().guides, null);
  });

  test('undo/redo는 businessInfo(히스토리 비추적)를 되돌리지 않는다', () => {
    const info = {
      businessName: '아낙스랩스',
      ownerName: '김승현',
      businessNumber: '000-00-00000',
      address: '서울',
      phone: '02-000-0000',
    };
    apart(() => st().addSection('hero'));
    apart(() => st().setBusinessInfo(info));
    apart(() => st().addSection('about'));

    undoEditor();
    undoEditor();
    assert.deepEqual(st().businessInfo, info, 'undo가 사업자정보까지 되돌렸다');
    assert.equal(st().config.businessInfo, undefined, 'businessInfo가 config로 새어들었다');
  });

  test('히스토리는 100단계에서 멈추고 가장 오래된 단계를 버린다', () => {
    for (let i = 0; i < 120; i += 1) apart(() => st().addSection('custom'));
    assert.equal(sections().length, 120);
    assert.equal(temporal().pastStates.length, 100, 'HISTORY_LIMIT가 100이 아니다');

    for (let i = 0; i < 100; i += 1) undoEditor();
    assert.equal(sections().length, 20, '100단계를 되감으면 21번째 커밋 직전 상태여야 한다');
    assert.equal(temporal().pastStates.length, 0);

    const floor = st().config;
    undoEditor();
    assert.equal(st().config, floor, '한도를 넘어 더 되돌아갔다');
    assert.equal(temporal().futureStates.length, 100, 'redo 경로가 100단계 유지되어야 한다');
  });
});

// ------------------------------------------------------------------ 페이지

describe('페이지 CRUD 불변식', () => {
  test("홈(slug '')은 삭제할 수 없다", () => {
    const aboutId = apart(() => st().addPage('About Us'));
    assert.equal(pages().length, 2);

    apart(() => st().deletePage(page('').id));
    assert.equal(pages().length, 2, '홈이 삭제됐다');
    assert.ok(pages().some((p) => p.slug === ''));

    apart(() => st().deletePage(aboutId));
    assert.equal(pages().length, 1);
    assert.equal(pages()[0].slug, '');
  });

  test('홈이 아니어도 마지막 한 페이지는 삭제할 수 없다', () => {
    const single: SiteConfig = {
      ...emptySiteConfig('단일'),
      pages: [{ id: 'only', title: '소개', slug: 'about', sections: [] }],
    };
    boot(single);
    apart(() => st().deletePage('only'));
    assert.equal(pages().length, 1, '마지막 페이지가 삭제돼 사이트가 비었다');
  });

  test('삭제된 페이지가 선택 중이었으면 이웃으로 선택이 옮겨간다', () => {
    apart(() => st().addPage('About'));
    const contactId = apart(() => st().addPage('Contact'));
    assert.equal(st().selectedPageId, contactId);

    apart(() => st().deletePage(contactId));
    assert.equal(st().selectedPageId, page('about').id, '삭제 후 유령 페이지가 선택돼 있다');
    assert.equal(st().selectedSectionId, null);
  });

  test('setPageSlug는 소문자로 정규화하고 중복·예약·빈 slug를 거부한다', () => {
    const aboutId = apart(() => st().addPage('About Us'));
    const contactId = apart(() => st().addPage('Contact'));

    apart(() => st().setPageSlug(contactId, '  Contact-US  '));
    assert.equal(pages().find((p) => p.id === contactId)!.slug, 'contact-us', '정규화 실패');

    // 중복
    let before = st().config;
    apart(() => st().setPageSlug(contactId, 'about-us'));
    assert.equal(st().config, before, '중복 slug가 통과했다');

    // 예약어
    before = st().config;
    apart(() => st().setPageSlug(contactId, RESERVED_PAGE_SLUGS[0]));
    assert.equal(st().config, before, `예약 slug ${RESERVED_PAGE_SLUGS[0]}가 통과했다`);

    // 빈 문자열(홈 전용)·형식 위반
    for (const bad of ['', '   ', '한글', 'has space', 'UPPER_SCORE']) {
      before = st().config;
      apart(() => st().setPageSlug(contactId, bad));
      assert.equal(st().config, before, `잘못된 slug "${bad}"가 통과했다`);
    }

    // 홈은 불변
    before = st().config;
    apart(() => st().setPageSlug(page('').id, 'home'));
    assert.equal(st().config, before, "홈 slug('')가 바뀌었다");
    assert.equal(pages().find((p) => p.id === aboutId)!.slug, 'about-us');
  });

  test('addPage는 slug를 유니크하게 만들고, 만들 수 없으면 page/page-N으로 떨어진다', () => {
    apart(() => st().addPage('About Us'));
    assert.equal(page('about-us').title, 'About Us');

    // 한글 제목은 ASCII slug가 남지 않는다 → 폴백
    apart(() => st().addPage('소개'));
    apart(() => st().addPage('오시는 길'));
    assert.deepEqual(
      pages().map((p) => p.slug),
      ['', 'about-us', 'page', 'page-2'],
    );

    // 예약어로 slugify되는 제목도 폴백으로 밀려난다
    apart(() => st().addPage('API'));
    assert.equal(pages().at(-1)!.slug, 'page-3');
    assert.ok(
      pages().every((p) => !(RESERVED_PAGE_SLUGS as readonly string[]).includes(p.slug)),
      '예약 slug가 페이지 목록에 생겼다',
    );

    const slugs = pages().map((p) => p.slug);
    assert.equal(new Set(slugs).size, slugs.length, 'slug 중복이 생겼다');
  });

  test('duplicatePage는 원본 바로 뒤에 꽂히고 id·slug를 전부 새로 뽑는다', () => {
    const aboutId = apart(() => st().addPage('About Us'));
    const sectionId = apart(() => st().addSection('team'));
    apart(() => st().addElement(sectionId, 'text'));

    const copyId = apart(() => st().duplicatePage(aboutId))!;
    assert.equal(pages().length, 3);
    assert.equal(pages()[2].id, copyId, '복사본이 원본 바로 뒤가 아니다');

    const original = pages()[1];
    const copy = pages()[2];
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.slug, 'about-us-2');
    assert.equal(copy.title, 'About Us 복사본');
    assert.notEqual(copy.sections[0].id, original.sections[0].id, '섹션 id가 공유됐다');
    assert.notEqual(copy.sections[0].elements[0].id, original.sections[0].elements[0].id, '요소 id가 공유됐다');
    assert.equal(copy.sections[0].elements.length, original.sections[0].elements.length);
  });

  test('reorderPage가 내비 순서를 바꾸고 양 끝에서 멈춘다', () => {
    apart(() => st().addPage('About'));
    apart(() => st().addPage('Contact'));
    assert.deepEqual(pages().map((p) => p.slug), ['', 'about', 'contact']);

    apart(() => st().reorderPage(page('contact').id, -1));
    assert.deepEqual(pages().map((p) => p.slug), ['', 'contact', 'about']);

    // 양 끝 클램프 — 배열을 건드리지 않는다
    let before = st().config;
    apart(() => st().reorderPage(page('').id, -1));
    assert.equal(st().config, before, '첫 페이지가 배열 밖으로 나갔다');
    before = st().config;
    apart(() => st().reorderPage(page('about').id, 1));
    assert.equal(st().config, before, '마지막 페이지가 배열 밖으로 나갔다');
  });

  test('setPageNav가 내비 노출/라벨을 왕복시킨다', () => {
    const aboutId = apart(() => st().addPage('About'));
    apart(() => st().setPageNav(aboutId, { showInNav: false }));
    assert.equal(pages().find((p) => p.id === aboutId)!.showInNav, false);

    apart(() => st().setPageNav(aboutId, { navLabel: '회사소개' }));
    const after = pages().find((p) => p.id === aboutId)!;
    assert.equal(after.navLabel, '회사소개');
    assert.equal(after.showInNav, false, '라벨만 바꿨는데 노출 설정이 날아갔다');
  });

  test('선택 페이지가 요소/섹션 액션의 스코프를 결정한다', () => {
    const homeSection = apart(() => st().addSection('hero'));
    const aboutId = apart(() => st().addPage('About'));
    apart(() => st().addSection('team'));

    assert.equal(st().selectedPageId, aboutId);
    assert.equal(sections().length, 1, 'about 페이지에는 방금 만든 섹션 하나만 있어야 한다');
    assert.notEqual(sections()[0].id, homeSection, '다른 페이지의 섹션이 보인다');

    apart(() => st().selectPage(page('').id));
    assert.equal(sections()[0].id, homeSection);

    const before = st().config;
    apart(() => st().selectPage('없는-페이지'));
    assert.equal(st().selectedPageId, page('').id, '존재하지 않는 페이지가 선택됐다');
    assert.equal(st().config, before);
  });
});

// ------------------------------------------------------------------- 요소

describe('요소 추가/삭제/복제', () => {
  const ALL_KINDS: ElementKind[] = [
    'text', 'image', 'button', 'shape', 'divider', 'video', 'form', 'map', 'socialLinks',
  ];

  test('9종 전부 추가되고 z는 0..n-1로 연속이며 프레임은 섹션 안이다', () => {
    const [sectionId, ids] = sectionWith(ALL_KINDS);
    assert.equal(new Set(ids).size, ALL_KINDS.length, '요소 id가 중복됐다');

    const section = sections().find((s) => s.id === sectionId)!;
    assert.equal(section.elements.length, ALL_KINDS.length);
    assert.deepEqual(
      section.elements.map((e) => e.z).sort((a, b) => a - b),
      ALL_KINDS.map((_, i) => i),
    );
    for (const el of section.elements) {
      assert.ok(el.frame.y >= 0 && el.frame.y + el.frame.h <= section.height, `${el.kind} 프레임이 섹션 밖이다`);
      assert.ok(el.frame.x + el.frame.w > 0 && el.frame.x < DESIGN_WIDTH, `${el.kind} 프레임이 캔버스 밖이다`);
    }
    assert.equal(st().selectedElementId, ids.at(-1));
    assert.equal(st().selectedSectionId, sectionId);
  });

  test('없는 섹션에 추가하면 null을 돌려주고 config를 건드리지 않는다', () => {
    apart(() => st().addSection('hero'));
    const before = st().config;
    const id = apart(() => st().addElement('없는-섹션', 'text'));
    assert.equal(id, null);
    assert.equal(st().config, before);
  });

  test('deleteElement가 요소와 그 요소를 가리키던 선택을 함께 지운다', () => {
    const [, [a, b]] = sectionWith(['text', 'button']);
    apart(() => st().selectElement(st().selectedSectionId!, b));
    apart(() => st().setEditingElement(b));

    apart(() => st().deleteElement(b));
    assert.equal(findElementLocation(st().config, b), null);
    assert.ok(findElementLocation(st().config, a), '엉뚱한 요소가 지워졌다');
    assert.equal(st().selectedElementId, null, '지워진 요소가 계속 선택돼 있다');
    assert.equal(st().editingElementId, null, '지워진 요소가 계속 인라인 편집 중이다');

    const before = st().config;
    apart(() => st().deleteElement('없는-요소'));
    assert.equal(st().config, before);
  });

  test('duplicateElement는 16px 어긋난 깊은 복사본을 맨 위에 올린다', () => {
    const [sectionId, [textId]] = sectionWith(['text', 'button']);
    const original = elementById(textId);

    const copyId = apart(() => st().duplicateElement(textId))!;
    const copy = elementById(copyId);

    assert.notEqual(copyId, textId);
    assert.equal(copy.kind, original.kind);
    assert.equal(copy.frame.x, original.frame.x + 16);
    assert.equal(copy.frame.y, original.frame.y + 16);
    assert.equal(copy.frame.w, original.frame.w);
    assert.equal(copy.z, 2, '복사본은 맨 위(maxZ+1)여야 한다');
    assert.notEqual(copy.style, original.style, 'style 객체가 원본과 공유되고 있다(얕은 복사)');
    assert.deepEqual(copy.style, original.style);
    assert.equal(sections().find((s) => s.id === sectionId)!.elements.length, 3);
    assert.equal(st().selectedElementId, copyId);
  });
});

describe('z-order 불변식', () => {
  /** z 집합은 항상 0..n-1의 순열이고, 요소 구성은 바뀌지 않는다 */
  function assertContiguousZ(sectionId: string, expectedIds: string[]) {
    const section = sections().find((s) => s.id === sectionId)!;
    assert.deepEqual(
      section.elements.map((e) => e.z).sort((a, b) => a - b),
      expectedIds.map((_, i) => i),
      'z가 0..n-1 연속 순열이 아니다',
    );
    assert.deepEqual(new Set(section.elements.map((e) => e.id)), new Set(expectedIds), '요소 구성이 바뀌었다');
  }

  /** z 오름차순 = 아래→위 순서 */
  function stack(sectionId: string): string[] {
    return [...sections().find((s) => s.id === sectionId)!.elements]
      .sort((a, b) => a.z - b.z)
      .map((e) => e.id);
  }

  test('front/back/forward/backward가 쌓임 순서를 예상대로 바꾼다', () => {
    const [sectionId, [a, b, c, d]] = sectionWith(['text', 'text', 'text', 'text']);
    assert.deepEqual(stack(sectionId), [a, b, c, d]);

    apart(() => st().reorderElement(a, 'front'));
    assert.deepEqual(stack(sectionId), [b, c, d, a]);
    assertContiguousZ(sectionId, [a, b, c, d]);

    apart(() => st().reorderElement(a, 'back'));
    assert.deepEqual(stack(sectionId), [a, b, c, d]);

    apart(() => st().reorderElement(b, 'forward'));
    assert.deepEqual(stack(sectionId), [a, c, b, d], 'forward가 한 칸만 올라가지 않았다');

    apart(() => st().reorderElement(b, 'backward'));
    assert.deepEqual(stack(sectionId), [a, b, c, d]);
    assertContiguousZ(sectionId, [a, b, c, d]);
  });

  test('끝에서의 z-order 조작은 no-op이라 히스토리를 더럽히지 않는다', () => {
    const [sectionId, [a, , , d]] = sectionWith(['text', 'text', 'text', 'text']);

    const noops: Array<[string, ZOrderOp]> = [
      [d, 'front'],
      [d, 'forward'],
      [a, 'back'],
      [a, 'backward'],
    ];
    for (const [id, op] of noops) {
      const before = st().config;
      apart(() => st().reorderElement(id, op));
      assert.equal(st().config, before, `끝단 ${op}가 config를 새로 만들었다`);
    }
    assert.deepEqual(stack(sectionId).length, 4);

    const before = st().config;
    apart(() => st().reorderElement('없는-요소', 'front'));
    assert.equal(st().config, before);
  });
});

describe('moveElementToSection — 섹션 경계를 넘는 드롭', () => {
  function twoSections(): { src: string; dst: string; moved: string } {
    const src = apart(() => st().addSection('hero'));
    const moved = apart(() => st().addElement(src, 'text'))!;
    apart(() => st().updateElement(moved, { text: '옮겨질 문구' }));
    const dst = apart(() => st().addSection('about'));
    apart(() => st().addElement(dst, 'button'));
    apart(() => st().addElement(dst, 'image'));
    return { src, dst, moved };
  }

  test('요소 정체성을 유지한 채 원본 섹션에서 사라지고 대상 맨 위로 붙는다', () => {
    const { src, dst, moved } = twoSections();
    const before = elementById(moved);

    apart(() => st().moveElementToSection(moved, dst, { x: 10.4, y: 20.6, w: 100.2, h: 50.9 }));

    const srcSection = sections().find((s) => s.id === src)!;
    const dstSection = sections().find((s) => s.id === dst)!;
    assert.ok(!srcSection.elements.some((e) => e.id === moved), '원본 섹션에 요소가 남았다');
    assert.equal(dstSection.elements.filter((e) => e.id === moved).length, 1, '대상 섹션에 정확히 하나여야 한다');

    const after = elementById(moved);
    assert.equal(after.id, before.id, '요소 id가 재발급됐다');
    assert.equal(after.kind, before.kind);
    assert.equal((after as { text?: string }).text, '옮겨질 문구', '요소 내용이 이동 중 유실됐다');
    assert.deepEqual(after.frame, { x: 10, y: 21, w: 100, h: 51 }, '대상 섹션 로컬 좌표로 반올림돼야 한다');
    assert.equal(after.z, 2, '대상 섹션의 맨 위(maxZ+1)여야 한다');
    assert.equal(st().selectedSectionId, dst);
    assert.equal(st().selectedElementId, moved);
  });

  test('같은 섹션·없는 섹션·없는 요소로의 이동은 no-op이다', () => {
    const { src, dst, moved } = twoSections();

    let before = st().config;
    apart(() => st().moveElementToSection(moved, src, { x: 0, y: 0, w: 10, h: 10 }));
    assert.equal(st().config, before, '같은 섹션으로 옮겼는데 config가 새로 생겼다');

    before = st().config;
    apart(() => st().moveElementToSection(moved, '없는-섹션', { x: 0, y: 0, w: 10, h: 10 }));
    assert.equal(st().config, before);

    before = st().config;
    apart(() => st().moveElementToSection('없는-요소', dst, { x: 0, y: 0, w: 10, h: 10 }));
    assert.equal(st().config, before);
  });
});

// ------------------------------------------------------- 회전 / 테마 / 메타

describe('회전 값의 정규형', () => {
  test('스토어는 회전값을 그대로 왕복시키고, 0은 undefined로 정규화돼 직렬화에서 빠진다', () => {
    const [, [id]] = sectionWith(['image']);
    assert.equal(elementById(id).rotation, undefined, '기본 요소에 회전이 붙어 있다');

    apart(() => st().updateElement(id, { rotation: 45 }));
    assert.equal(elementById(id).rotation, 45);
    apart(() => st().updateElement(id, { rotation: -90 }));
    assert.equal(elementById(id).rotation, -90, '음수 회전이 유실됐다');

    // Inspector가 0을 undefined로 커밋한다(= 정규형). 저장 페이로드에서 사라져야 한다.
    apart(() => st().updateElement(id, { rotation: undefined }));
    assert.equal(elementById(id).rotation ?? 0, 0);
    const serialized = JSON.parse(JSON.stringify(elementById(id))) as Record<string, unknown>;
    assert.ok(!('rotation' in serialized), 'rotation:0/undefined가 저장 페이로드에 남았다');
  });

  test('스토어 자체는 360도 모듈러 정규화를 하지 않는다 (범위 제한은 인스펙터 필드의 책임)', () => {
    const [, [id]] = sectionWith(['image']);
    apart(() => st().updateElement(id, { rotation: 540 }));
    assert.equal(elementById(id).rotation, 540);
  });
});

describe('테마·메타 편집 왕복', () => {
  test('updateTheme은 지정한 축만 병합하고 나머지를 보존한다', () => {
    const base = st().config.theme;

    apart(() => st().updateTheme({ fonts: { heading: "'Pretendard', sans-serif" } }));
    assert.equal(st().config.theme.fonts.heading, "'Pretendard', sans-serif");
    assert.equal(st().config.theme.fonts.body, base.fonts.body, 'body 폰트가 병합에서 날아갔다');

    apart(() => st().updateTheme({ palette: { primary: '#2D63F0' } }));
    assert.equal(st().config.theme.palette.primary, '#2D63F0');
    assert.equal(st().config.theme.palette.background, base.palette.background, '팔레트 나머지가 날아갔다');

    apart(() => st().updateTheme({ radius: 24, customCss: '.x{color:red}' }));
    assert.equal(st().config.theme.radius, 24);
    assert.equal(st().config.theme.customCss, '.x{color:red}');
    assert.equal(st().config.theme.palette.primary, '#2D63F0', '이전 팔레트 편집이 덮였다');
  });

  test('폰트를 손으로 고치면 생성된 fontPairing 핀을 걷어낸다', () => {
    boot({
      ...emptySiteConfig('핀 있는 사이트'),
      theme: {
        ...emptySiteConfig('x').theme,
        fontPairing: { catalogVersion: 1, id: 'kr-pretendard-neutral' },
      },
    });
    assert.ok(st().config.theme.fontPairing, '전제 조건: 핀이 있어야 한다');

    apart(() => st().updateTheme({ fonts: { body: "'Gmarket Sans', sans-serif" }, clearFontPairing: true }));
    assert.equal(st().config.theme.fontPairing, undefined, 'stale한 폰트 매니페스트 핀이 남았다');
    assert.equal(st().config.theme.fonts.body, "'Gmarket Sans', sans-serif");
  });

  test('updateMeta는 부분 병합이고 title을 지우지 않는다', () => {
    assert.equal(st().config.meta.title, '테스트 사이트');
    apart(() => st().updateMeta({ description: '설명입니다' }));
    assert.equal(st().config.meta.title, '테스트 사이트', 'title이 부분 병합에서 사라졌다');
    assert.equal(st().config.meta.description, '설명입니다');

    apart(() => st().updateMeta({ title: '바뀐 제목' }));
    assert.deepEqual(st().config.meta, { title: '바뀐 제목', description: '설명입니다' });
  });

  test('테마·메타 편집도 undo 한 단계로 되돌아간다', () => {
    const base = st().config.meta.title;
    apart(() => st().updateMeta({ title: '임시' }));
    undoEditor();
    assert.equal(st().config.meta.title, base);
  });
});

describe('initializeEditor', () => {
  test('진입 시 홈을 선택하고 첫 섹션을 골라두며 히스토리를 비운다', () => {
    const seeded: SiteConfig = {
      ...emptySiteConfig('시드'),
      pages: [
        { id: 'p-about', title: '소개', slug: 'about', sections: [] },
        {
          id: 'p-home',
          title: '홈',
          slug: '',
          sections: [{ id: 'sec-home', type: 'hero', name: '히어로', height: 720, background: {}, elements: [] }],
        },
      ] satisfies SitePage[],
      businessInfo: {
        businessName: '아낙스랩스',
        ownerName: '김승현',
        businessNumber: '000-00-00000',
        address: '서울',
        phone: '02-000-0000',
      },
    };
    boot(seeded);

    assert.equal(st().selectedPageId, 'p-home', '홈이 배열 첫 자리가 아니어도 홈을 골라야 한다');
    assert.equal(st().selectedSectionId, 'sec-home');
    assert.equal(temporal().pastStates.length, 0);
    assert.equal(st().dirty, false);
    assert.equal(st().saveStatus, 'idle');
    assert.equal(st().config.businessInfo, undefined, 'businessInfo가 undo 추적 config에 남았다');
    assert.equal(st().businessInfo?.businessName, '아낙스랩스');
  });
});
