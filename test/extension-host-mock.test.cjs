const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const extensionPath = path.resolve(__dirname, '../vscode-extension/extension.cjs');

test('VS Code extension registers command and maps uppercase error severity', async () => {
  let command, diagnosticCollection, output;
  const messages = [];
  const document = { languageId: 'sql', fileName: 'migration.sql', isDirty: false, lineCount: 10, uri: { scheme: 'file', fsPath: '/workspace/migration.sql', toString: () => 'file:///workspace/migration.sql' }, save: async () => true };
  const vscode = {
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    CodeActionKind: { QuickFix: 'quickfix' },
    CodeAction: class { constructor(title, kind) { Object.assign(this, { title, kind }); } },
    Range: class { constructor(...args) { this.args = args; } },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    languages: { createDiagnosticCollection: () => diagnosticCollection = { set: (uri, findings) => { output = findings; }, delete() {} }, registerCodeActionsProvider: () => ({}) },
    commands: { registerCommand: (_name, fn) => { command = fn; return {}; } },
    window: { activeTextEditor: { document }, createOutputChannel: () => ({ appendLine() {}, show() {} }), showInformationMessage: m => messages.push(m), showErrorMessage: m => messages.push(m) },
    workspace: { getWorkspaceFolder: () => ({ uri: { fsPath: '/workspace' } }), getConfiguration: () => ({ get: (_key, def) => def }), textDocuments: [], onDidSaveTextDocument: () => ({}), onDidOpenTextDocument: () => ({}), onDidCloseTextDocument: () => ({}), onDidChangeTextDocument: () => ({}) }
  };
  const original = Module._load;
  try {
    Module._load = function(request, parent, isMain) { if (request === 'vscode') return vscode; return original.apply(this, arguments); };
    delete require.cache[extensionPath];
    const ext = require(extensionPath);
    ext.activate({ subscriptions: [] });
    assert.equal(typeof command, 'function');
    const findings = ext.diagnosticsFor([
      { ruleId: 'PG001', line: 2, column: 4, severity: 'ERROR', message: 'unsafe', fix: 'rewrite' },
      { ruleId: 'PG002', severity: 'warning', message: 'caution' }
    ], document);
    assert.equal(findings[0].severity, 0);
    assert.deepEqual(findings[0].range.args, [1, 3, 1, 4]);
    assert.equal(findings[1].severity, 1);
    assert.equal(findings[0].code, 'PG001');
    assert.ok(diagnosticCollection);
  } finally { Module._load = original; delete require.cache[extensionPath]; }
});
