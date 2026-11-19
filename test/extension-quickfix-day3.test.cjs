const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../vscode-extension/extension.cjs'), 'utf8');
test('Day 3 requests contextual advisor data from CLI', () => {
  assert.match(source, /'--advisor'/);
  assert.match(source, /finding\.advisor/);
});
test('Day 3 quick fixes are guidance only and never apply edits', () => {
  assert.match(source, /CodeActionKind\.QuickFix/);
  assert.match(source, /'pgSafeMigrate\.showGuidance'/);
  assert.doesNotMatch(source, /new vscode\.WorkspaceEdit|workspace\.applyEdit|action\.edit\s*=/);
});
test('Day 3 copies SQL only on explicit selection', () => {
  assert.match(source, /choice === 'Copy example SQL'/);
  assert.match(source, /vscode\.env\.clipboard\.writeText\(alternative\.sql\)/);
});

test('Day 3 guidance opens a separate SQL preview rather than editing the migration', () => {
  assert.match(source, /openTextDocument\(\{ language: 'sql', content: preview \}\)/);
  assert.match(source, /showTextDocument\(previewDocument/);
  assert.match(source, /advisory preview only/);
});
