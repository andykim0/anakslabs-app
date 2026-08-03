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
    assert.match(diagnostics, /!isFetching/);
    assert.match(diagnostics, /refetchOnMount:\s*'always'/);
    assert.match(diagnostics, /Publishing is unavailable because the diagnostic check could not complete/);
    assert.doesNotMatch(diagnostics, /그대로 발행/);
  });

  test('에디터는 autosave 완료 뒤에만 새 진단을 마운트하고 차단 상태에 발행 가능 문구를 내지 않는다', () => {
    const shell = source('src/components/editor/EditorShell.tsx');
    const diagnostics = source('src/components/editor/PublishDiagnostics.tsx');
    const clickStart = shell.indexOf('const handlePublishClick = async');
    const flushAt = shell.indexOf('await autosave.flush()', clickStart);
    const openAt = shell.indexOf('setPrePublishOpen(true)', flushAt);
    assert.ok(clickStart >= 0 && flushAt > clickStart && openAt > flushAt);
    assert.match(shell, /prePublishOpen \? \(\s*<PrePublishDialog/);
    assert.match(diagnostics, /!data\.ok \? \([\s\S]*run the diagnostic check again before publishing/);
    assert.match(diagnostics, /data\.ok && data\.warnings\.length/);
  });

  test('발행 성공 응답의 QA 경고를 에디터와 대시보드가 버리지 않는다', () => {
    const resultContract = source('src/lib/publish/result.ts');
    const dialog = source('src/components/editor/PublishDialog.tsx');
    const dashboard = source('src/components/dashboard/site-detail.tsx');
    assert.match(resultContract, /warnings:\s*string\[\]/);
    assert.match(resultContract, /needsQa:\s*boolean/);
    assert.match(dialog, /result\?\.preflight\.warnings/);
    assert.match(dialog, /result\?\.preflight\.needsQa/);
    assert.match(dashboard, /result\.preflight\.warnings\.length/);
  });

  test('US editor and dashboard can continue without optional business information', () => {
    const editor = source('src/components/editor/PrePublishDialog.tsx');
    const dashboard = source('src/components/dashboard/site-detail.tsx');
    const sectionList = source('src/components/editor/SectionListPanel.tsx');
    assert.match(editor, /businessInfoRequiredForPublish\(s\.config\)/);
    assert.match(editor, /Continue without it/);
    assert.match(dashboard, /!businessInfoRequired/);
    assert.match(dashboard, /No legal footer will be shown unless you add it/);
    assert.match(sectionList, /businessInfoRequired \? '\(Required before publication\)' : '\(Optional\)'/);
  });
});
