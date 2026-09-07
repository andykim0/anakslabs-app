/**
 * 초안 자동저장 계약 — 실제 프로덕션 클로저(`createDraftSaver`)를 그대로 구동한다.
 *
 * 이 저장소에는 jsdom도 react-test-renderer도 없어서 훅 자체를 렌더할 수 없다. 그래서
 * `useAutosave`의 저장 루프·디바운스·재시도를 React에 의존하지 않는 saver로 분리했고
 * (동작 무변경 리팩터), 훅은 그 saver를 그대로 쓴다 — 여기서 검증하는 코드가 에디터가
 * 실행하는 코드다. 네트워크는 두 층에서 막는다: `save` 주입(루프 검증)과 globalThis.fetch
 * 목(실제 PATCH 계약 검증).
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_RETRY_MS,
  createDraftSaver,
} from '@/components/editor/useAutosave';
import { EditorApiError, saveDraftRequest } from '@/components/editor/api';
import { initializeEditor, useEditorStore } from '@/stores/editor';
import { emptySiteConfig, type SiteConfig } from '@/lib/types/site';

const SITE_ID = 'site-1';
const st = () => useEditorStore.getState();
const originalFetch = globalThis.fetch;

/** 목 타이머 아래에서 마이크로태스크가 다 풀릴 때까지 양보한다 */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}
async function advance(ms: number): Promise<void> {
  mock.timers.tick(ms);
  await settle();
}

/** 호출을 기록하고, 해결 시점을 테스트가 쥐는 저장 스텁 */
function deferredSave() {
  const calls: Array<{ siteId: string; config: SiteConfig }> = [];
  const pending: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];
  const save = (siteId: string, config: SiteConfig) => {
    calls.push({ siteId, config });
    return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
  };
  return { calls, pending, save };
}

function dirtyEdit(): string {
  return st().addSection('hero');
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  initializeEditor(SITE_ID, emptySiteConfig('자동저장 테스트'), 'premium');
});
afterEach(() => {
  mock.timers.reset();
  globalThis.fetch = originalFetch;
});

describe('디바운스', () => {
  test('상수 자체가 2초 디바운스 / 4초 재시도다', () => {
    assert.equal(AUTOSAVE_DEBOUNCE_MS, 2000);
    assert.equal(AUTOSAVE_RETRY_MS, 4000);
  });

  test('마지막 변경 후 2초가 지나야 정확히 한 번 저장한다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    dirtyEdit();
    saver.schedule();

    await advance(AUTOSAVE_DEBOUNCE_MS - 1);
    assert.equal(calls.length, 0, '디바운스가 끝나기 전에 저장이 나갔다');

    await advance(1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].siteId, SITE_ID);
    assert.equal(st().saveStatus, 'saving');

    pending[0].resolve();
    await settle();
    assert.equal(st().saveStatus, 'saved');
    assert.equal(st().dirty, false);
    assert.ok(typeof st().lastSavedAt === 'number');
  });

  test('연타 편집은 하나의 저장으로 합쳐지고, 타이머는 마지막 편집 기준으로 다시 무장한다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    // 훅의 useEffect가 config 변경마다 하는 일: 취소 후 재스케줄
    for (let i = 0; i < 5; i += 1) {
      dirtyEdit();
      saver.cancelScheduled();
      saver.schedule();
      await advance(500);
    }
    assert.equal(calls.length, 0, '중간 편집마다 저장이 나갔다 — 디바운스가 재무장되지 않는다');

    await advance(AUTOSAVE_DEBOUNCE_MS);
    assert.equal(calls.length, 1, '연타 편집이 한 번의 저장으로 합쳐지지 않았다');
    pending[0].resolve();
    await settle();
    assert.equal(st().dirty, false);
  });

  test('대기 중 디바운스를 취소하면(언마운트 등) 저장이 나가지 않는다', async () => {
    const { calls, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    dirtyEdit();
    saver.schedule();
    await advance(AUTOSAVE_DEBOUNCE_MS - 100);
    saver.dispose();

    await advance(AUTOSAVE_DEBOUNCE_MS * 2);
    assert.equal(calls.length, 0, '정리된 뒤에도 타이머가 살아 저장이 나갔다');
  });

  test('저장할 변경이 없으면 요청 없이 성공으로 끝난다', async () => {
    const { calls, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    assert.equal(st().dirty, false);
    assert.equal(await saver.run(), true);
    assert.equal(calls.length, 0, 'dirty가 아닌데 PATCH를 보냈다');
    assert.equal(st().saveStatus, 'idle', '보낸 것도 없는데 상태가 움직였다');
  });
});

describe('실패 → 재시도 → 성공 (중복 저장 없음)', () => {
  test('실패는 error로 남고 4초 뒤 한 번만 재시도하며, 성공하면 saved로 닫힌다', async () => {
    const errors: unknown[] = [];
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save, onError: (e) => errors.push(e) });

    dirtyEdit();
    saver.schedule();
    await advance(AUTOSAVE_DEBOUNCE_MS);
    assert.equal(calls.length, 1);

    // 서버가 거절
    pending[0].reject(new EditorApiError(500, 'INTERNAL', '서버 오류', {}));
    await settle();
    assert.equal(st().saveStatus, 'error');
    assert.equal(st().dirty, true, '실패했는데 변경이 저장된 것으로 표시됐다');
    assert.equal(errors.length, 1);

    // 재시도 창이 오기 전에는 아무것도 더 보내지 않는다
    await advance(AUTOSAVE_RETRY_MS - 1);
    assert.equal(calls.length, 1, '재시도가 4초보다 일찍 나갔다');

    await advance(1);
    assert.equal(calls.length, 2, '자동 재시도가 나가지 않았다');

    pending[1].resolve();
    await settle();
    assert.equal(st().saveStatus, 'saved');
    assert.equal(st().dirty, false);

    // 재시도 성공 후에는 유령 타이머가 남지 않아야 한다
    await advance(AUTOSAVE_RETRY_MS * 3);
    assert.equal(calls.length, 2, '성공 후에도 재시도 타이머가 계속 저장을 보냈다');
  });

  test('재시도 시점에 저장할 변경이 없으면 재시도를 보내지 않는다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save, onError: () => {} });

    dirtyEdit();
    // run()은 첫 await에서 멈춘다 — 요청 자체는 동기적으로 이미 나갔다
    const first = saver.run();
    assert.equal(calls.length, 1);
    pending[0].reject(new Error('네트워크'));
    assert.equal(await first, false);
    assert.equal(st().saveStatus, 'error');

    // 다른 경로(수동 flush 등)가 이미 저장을 끝낸 상황
    st().setSaveStatus('saved');
    assert.equal(st().dirty, false);

    await advance(AUTOSAVE_RETRY_MS + 10);
    assert.equal(calls.length, 1, '깨끗한 상태인데 재시도가 나갔다');
  });

  test('저장이 진행 중이면 추가 run()은 새 요청을 만들지 않고 같은 약속을 돌려준다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    dirtyEdit();
    const first = saver.run();
    const second = saver.run();
    const third = saver.run();
    assert.equal(first, second, '동시 flush가 서로 다른 약속을 만들었다');
    assert.equal(first, third);
    assert.equal(calls.length, 1, '동시 flush가 PATCH를 중복 발사했다');

    pending[0].resolve();
    assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
    assert.equal(calls.length, 1);
  });
});

describe('저장 중 들어온 편집 (유실 방지 루프)', () => {
  test('전송 중 config가 바뀌면 최신본으로 한 번 더 보내고 그때 saved로 닫는다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });

    dirtyEdit();
    const staleConfig = st().config;
    const done = saver.run();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].config, staleConfig);

    // 요청이 날아가 있는 동안 사용자가 계속 편집
    dirtyEdit();
    const freshConfig = st().config;
    assert.notEqual(freshConfig, staleConfig, '전제: 편집은 config 참조를 새로 만든다');

    pending[0].resolve();
    await settle();
    assert.equal(calls.length, 2, '전송 중 생긴 편집이 유실됐다');
    assert.equal(calls[1].config, freshConfig);
    assert.equal(st().dirty, true, '아직 최신본이 서버에 안 닿았는데 깨끗하다고 표시했다');

    pending[1].resolve();
    assert.equal(await done, true);
    assert.equal(st().dirty, false);
    assert.equal(st().saveStatus, 'saved');
  });

  test('businessInfo는 config 밖에 있지만 draftConfig로 합성돼 함께 전송된다', async () => {
    const { calls, pending, save } = deferredSave();
    const saver = createDraftSaver(SITE_ID, { save });
    const info = {
      businessName: '아낙스랩스',
      ownerName: '김승현',
      businessNumber: '000-00-00000',
      address: '서울',
      phone: '02-000-0000',
    };

    st().setBusinessInfo(info);
    const done = saver.run();
    pending[0].resolve();
    assert.equal(await done, true);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].config.businessInfo, info, 'businessInfo가 저장 페이로드에서 빠졌다');
    assert.equal(st().config.businessInfo, undefined, 'businessInfo가 undo 추적 config로 새어들었다');
  });

  test('저장 루프가 의존하는 불변식: 편집은 새 참조, no-op은 같은 참조', () => {
    const sectionId = dirtyEdit();
    const afterAdd = st().config;
    st().updateSection(sectionId, { name: '바뀐 이름' });
    assert.notEqual(st().config, afterAdd, '편집이 같은 config 참조를 재사용하면 최신성 판정이 깨진다');

    const afterEdit = st().config;
    st().updateSection('없는-섹션', { name: 'x' });
    assert.equal(st().config, afterEdit, 'no-op이 새 참조를 만들면 저장 루프가 끝나지 않는다');
  });
});

describe('실제 PATCH 계약 (globalThis.fetch 목)', () => {
  test('saver의 기본 저장 경로가 PATCH /api/sites/[siteId] { draftConfig }를 친다', async () => {
    let url = '';
    let init: RequestInit | undefined;
    globalThis.fetch = (async (u: string | URL | Request, i?: RequestInit) => {
      url = String(u);
      init = i;
      return new Response(JSON.stringify({ ok: true, savedAt: '2026-09-07T00:00:00.000Z' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    // deps 없이 = 실제 saveDraftRequest 경로
    const saver = createDraftSaver('사이트/1');
    dirtyEdit();
    assert.equal(await saver.run(), true);

    assert.equal(url, '/api/sites/%EC%82%AC%EC%9D%B4%ED%8A%B8%2F1');
    assert.equal(init?.method, 'PATCH');
    const body = JSON.parse(String(init?.body)) as { draftConfig: SiteConfig };
    assert.deepEqual(body.draftConfig.pages, st().config.pages);
    assert.equal(body.draftConfig.version, 2);
    assert.equal(st().saveStatus, 'saved');
  });

  test('서버 에러 계약이 EditorApiError로 옮겨진다', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 'BUSINESS_INFO_REQUIRED', message: '사업자정보 필요', foo: 1 } }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () => saveDraftRequest('s', emptySiteConfig('x')),
      (err: unknown) => {
        assert.ok(err instanceof EditorApiError);
        assert.equal(err.status, 409);
        assert.equal(err.code, 'BUSINESS_INFO_REQUIRED');
        assert.deepEqual(err.extra, { foo: 1 });
        return true;
      },
    );
  });

  test('네트워크 자체가 끊기면 NETWORK_ERROR로 옮겨진다', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    await assert.rejects(
      () => saveDraftRequest('s', emptySiteConfig('x')),
      (err: unknown) => {
        assert.ok(err instanceof EditorApiError);
        assert.equal(err.code, 'NETWORK_ERROR');
        assert.equal(err.status, 0);
        return true;
      },
    );
  });

  test('PATCH가 실패하면 자동 재시도가 같은 엔드포인트로 다시 나가고, 이번엔 성공한다', async () => {
    const hits: string[] = [];
    let failNext = true;
    globalThis.fetch = (async (u: string | URL | Request) => {
      hits.push(String(u));
      if (failNext) {
        failNext = false;
        return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: '일시 오류' } }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, savedAt: 'x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const saver = createDraftSaver(SITE_ID, { onError: () => {} });
    dirtyEdit();
    saver.schedule();

    await advance(AUTOSAVE_DEBOUNCE_MS);
    assert.equal(hits.length, 1);
    assert.equal(st().saveStatus, 'error');
    assert.equal(st().dirty, true);

    await advance(AUTOSAVE_RETRY_MS);
    assert.equal(hits.length, 2, '실패 후 자동 재시도가 나가지 않았다');
    assert.deepEqual(new Set(hits), new Set([`/api/sites/${SITE_ID}`]));
    assert.equal(st().saveStatus, 'saved');
    assert.equal(st().dirty, false);
  });
});
