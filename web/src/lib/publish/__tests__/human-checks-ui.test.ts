import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('발행 휴먼 체크 UI 배선', () => {
  test('공용 체크리스트는 레지스트리에서 세 항목을 렌더한다', () => {
    const checklist = source('src/components/publish/HumanPublishChecklist.tsx');
    assert.match(checklist, /PUBLISH_HUMAN_CHECKS\.map/);
    assert.match(checklist, /type="checkbox"/);
    assert.match(checklist, /border-ob-accent-strong/);
    assert.doesNotMatch(checklist, /tone|neutral-|c8a96a/i);
  });

  test('에디터와 대시보드 모두 세 체크 완료 전 발행 버튼을 잠근다', () => {
    const editor = source('src/components/editor/PrePublishDialog.tsx');
    const dashboard = source('src/components/dashboard/site-detail.tsx');

    for (const ui of [editor, dashboard]) {
      assert.match(ui, /<HumanPublishChecklist/);
      assert.match(ui, /allPublishHumanChecksConfirmed\(humanChecks\)/);
    }
    assert.match(editor, /onConfirmed\(humanChecks\)/);
    assert.match(dashboard, /publishMutation\.mutate\(humanChecks\)/);
  });

  test('에디터 진단은 로딩·오류·artifact blocker에서 다음 단계로 진행하지 않는다', () => {
    const dialog = source('src/components/editor/PrePublishDialog.tsx');
    const diagnostics = source('src/components/editor/PublishDiagnostics.tsx');
    assert.match(dialog, /onGateChange=\{setQualityGateReady\}/);
    assert.match(dialog, /disabled=\{!qualityGateReady\}/);
    assert.match(diagnostics, /data\?\.ok === true/);
    assert.match(diagnostics, /진단을 완료하지 못해 지금은 발행할 수 없어요/);
    assert.doesNotMatch(diagnostics, /그대로 발행/);
  });
});
