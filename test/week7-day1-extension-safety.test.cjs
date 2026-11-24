'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const extensionPath = path.resolve(__dirname, '../vscode-extension/extension.cjs');

function harness(settings = {}) {
  const commands = new Map();
  const events = {};
  const diagnostics = new Map();
  const messages = [];
  const logs = [];
  const children = [];
  const uri = {
    scheme: 'file',
    fsPath: path.resolve(__dirname, '../examples/safe.sql'),
    toString() { return `file://${this.fsPath}`; }
  };
  const document = {
    uri, fileName: uri.fsPath, languageId: 'sql', lineCount: 1,
    version: 1, isDirty: false, isClosed: false,
    lineAt() { return { text: 'SELECT 1;' }; },
    async save() { return true; }
  };
  const collection = {
    set(u, values) { diagnostics.set(u.toString(), values); },
    delete(u) { diagnostics.delete(u.toString()); },
    dispose() {}
  };
  const vscode = {
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Range: class { constructor(line, col, endLine, endCol) {
      this.start = { line, character: col };
      this.end = { line: endLine, character: endCol };
    } },
    Diagnostic: class { constructor(range, message, severity) {
      Object.assign(this, { range, message, severity });
    } },
    CodeActionKind: { QuickFix: 'quickfix' },
    CodeAction: class { constructor(title, kind) { Object.assign(this, { title, kind }); } },
    languages: {
      createDiagnosticCollection() { return collection; },
      registerCodeActionsProvider() { return { dispose() {} }; }
    },
    commands: {
      registerCommand(name, callback) {
        commands.set(name, callback);
        return { dispose() {} };
      }
    },
    window: {
      activeTextEditor: { document },
      createOutputChannel() {
        return { appendLine(line) { logs.push(line); }, show() {}, dispose() {} };
      },
      showErrorMessage(message) { messages.push(message); },
      showWarningMessage(message) { messages.push(message); },
      showInformationMessage(message) { messages.push(message); }
    },
    workspace: {
      textDocuments: [],
      getConfiguration() { return { get(key, fallback) {
        return Object.hasOwn(settings, key) ? settings[key] : fallback;
      } }; },
      onDidSaveTextDocument(cb) { events.save = cb; return { dispose() {} }; },
      onDidOpenTextDocument(cb) { events.open = cb; return { dispose() {} }; },
      onDidCloseTextDocument(cb) { events.close = cb; return { dispose() {} }; },
      onDidChangeTextDocument(cb) { events.change = cb; return { dispose() {} }; }
    }
  };
  function spawnMock() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.kill = () => { child.killed = true; return true; };
    children.push(child);
    return child;
  }
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === 'vscode') return vscode;
      if (request === 'node:child_process') return { spawn: spawnMock };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[extensionPath];
    extension = require(extensionPath);
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  return {
    document, events, messages, logs, children,
    async lint() {
      await commands.get('pgSafeMigrate.lintFile')();
      return children.at(-1);
    },
    finish(child, code = 0, payload) {
      if (payload !== undefined) {
        child.stdout.emit('data', typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
      child.emit('close', code);
    },
    findings() { return diagnostics.get(uri.toString()) || []; },
    dispose() { extension.deactivate(); delete require.cache[extensionPath]; }
  };
}

const report = ruleId => ({ findings: [{
  ruleId, line: 1, column: 1, severity: 'error', message: 'Risky SQL'
}] });

test('timeout terminates a stalled lint and rejects late diagnostics', async () => {
  const h = harness({ timeoutMs: 1000 });
  try {
    const child = await h.lint();
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal(child.killed, true, 'timed-out child must be killed');
    h.finish(child, 0, report('PG001'));
    assert.equal(h.findings().length, 0);
    assert.match(h.logs.join('\n'), /timed out|exceeded 1000 ms/i);
  } finally { h.dispose(); }
});

test('oversized stdout terminates lint without publishing findings', async () => {
  const h = harness();
  try {
    const child = await h.lint();
    child.stdout.emit('data', Buffer.alloc(16 * 1024 * 1024 + 1, 65));
    assert.equal(child.killed, true);
    h.finish(child, 0, report('PG001'));
    assert.equal(h.findings().length, 0);
    assert.match(h.logs.join('\n'), /output exceeded the safety limit/i);
  } finally { h.dispose(); }
});

test('oversized stderr terminates lint without publishing findings', async () => {
  const h = harness();
  try {
    const child = await h.lint();
    child.stderr.emit('data', Buffer.alloc(1024 * 1024 + 1, 65));
    assert.equal(child.killed, true);
    h.finish(child, 0, report('PG001'));
    assert.equal(h.findings().length, 0);
    assert.match(h.logs.join('\n'), /output exceeded the safety limit/i);
  } finally { h.dispose(); }
});

test('superseding a lint cancels the older child and preserves newer diagnostics', async () => {
  const h = harness();
  try {
    const oldChild = await h.lint();
    const newChild = await h.lint();
    assert.equal(oldChild.killed, true);
    h.finish(newChild, 0, report('PG002'));
    h.finish(oldChild, 0, report('PG001'));
    assert.deepEqual(h.findings().map(d => d.code), ['PG002']);
  } finally { h.dispose(); }
});

test('deactivation kills running lint and prevents late publication', async () => {
  const h = harness();
  try {
    const child = await h.lint();
    h.dispose();
    assert.equal(child.killed, true);
    h.finish(child, 0, report('PG001'));
    assert.equal(h.findings().length, 0);
  } finally { h.dispose(); }
});
