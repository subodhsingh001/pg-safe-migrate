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
  function spawnMock(...args) {
    if (settings.failNextSpawn) { settings.failNextSpawn = false; throw new Error("mock launch failure"); }
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = false;
    child.file = args[1].at(-1);
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
    select(doc) { vscode.window.activeTextEditor.document = doc; },
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
    await h.lint();
    assert.equal(oldChild.killed, true);
    assert.equal(h.children.length, 1);
    h.finish(oldChild, 0, report('PG001'));
    const newChild = h.children.at(-1);
    assert.notEqual(newChild, oldChild);
    h.finish(newChild, 0, report('PG002'));
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

function otherDocument(h, name) {
  const fsPath = path.resolve(__dirname, name + '.sql');
  return { ...h.document, fileName: fsPath, uri: { scheme: 'file', fsPath, toString() { return fsPath; } } };
}

test('global limit queues distinct files until close', async () => {
  const h = harness();
  try {
    const first = await h.lint();
    h.select(otherDocument(h, 'second'));
    await h.lint();
    assert.equal(h.children.length, 1);
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 2);
    h.finish(h.children[1], 0, report('PG002'));
  } finally { h.dispose(); }
});

test('closing queued document removes it', async () => {
  const h = harness();
  try {
    const first = await h.lint();
    const second = otherDocument(h, 'second');
    h.select(second);
    await h.lint();
    h.events.close(second);
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 1);
  } finally { h.dispose(); }
});

test('configured concurrency permits two active processes', async () => {
  const h = harness({ maxConcurrentLints: 2 });
  try {
    await h.lint();
    h.select(otherDocument(h, 'second')); await h.lint();
    h.select(otherDocument(h, 'third')); await h.lint();
    assert.equal(h.children.length, 2);
    h.finish(h.children[0], 0, report('PG001'));
    assert.equal(h.children.length, 3);
  } finally { h.dispose(); }
});


const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('manual requests take priority over queued automatic requests', async () => {
  const h = harness({ debounceMs: 100 });
  try {
    const first = await h.lint();
    const auto = otherDocument(h, 'auto');
    const manual = otherDocument(h, 'manual');
    h.events.open(auto);
    await wait(150);
    h.select(manual); await h.lint();
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children[1].file, manual.uri.fsPath);
    h.finish(h.children[1], 0, report('PG002'));
    assert.equal(h.children[2].file, auto.uri.fsPath);
  } finally { h.dispose(); }
});

test('oversized saved file is rejected before spawn', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe-test-'));
  const h = harness({ maxFileSizeMB: 1 });
  try {
    const file = path.join(dir, 'large.sql');
    fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1, 32));
    const doc = { ...h.document, fileName: file, uri: { scheme: 'file', fsPath: file, toString() { return file; } } };
    h.select(doc); await h.lint();
    assert.equal(h.children.length, 0);
    assert.match(h.logs.join('\n'), /exceeds 1 MiB/);
  } finally { h.dispose(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('duplicate queued requests retain latest version only', async () => {
  const h = harness();
  try {
    const first = await h.lint();
    const doc = otherDocument(h, 'duplicate');
    h.select(doc); await h.lint(); doc.version++; await h.lint();
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 2);
    assert.equal(h.children[1].file, doc.uri.fsPath);
    h.finish(h.children[1], 0, report('PG002'));
    assert.equal(h.children.length, 2);
  } finally { h.dispose(); }
});

test('editing queued document cancels outdated analysis', async () => {
  const h = harness();
  try {
    const first = await h.lint();
    const doc = otherDocument(h, 'edited');
    h.select(doc); await h.lint(); doc.version++; doc.isDirty = true;
    h.events.change({ document: doc });
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 1);
  } finally { h.dispose(); }
});

test('synchronous spawn failure does not block next queued request', async () => {
  const settings = {}; const h = harness(settings);
  try {
    const first = await h.lint();
    h.select(otherDocument(h, 'failure')); await h.lint();
    const next = otherDocument(h, 'next'); h.select(next); await h.lint();
    settings.failNextSpawn = true;
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 2);
    assert.equal(h.children[1].file, next.uri.fsPath);
    assert.match(h.logs.join('\n'), /mock launch failure/);
  } finally { h.dispose(); }
});

test('timeout holds slot until child closes', async () => {
  const h = harness({ timeoutMs: 1000 });
  try {
    const first = await h.lint();
    h.select(otherDocument(h, 'waiting')); await h.lint();
    await wait(1100);
    assert.equal(first.killed, true); assert.equal(h.children.length, 1);
    h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 2);
    assert.equal(h.findings().length, 0);
  } finally { h.dispose(); }
});

test('shutdown clears pending requests', async () => {
  const h = harness();
  try {
    const first = await h.lint();
    h.select(otherDocument(h, 'waiting')); await h.lint();
    h.dispose(); h.finish(first, 0, report('PG001'));
    assert.equal(h.children.length, 1);
  } finally { h.dispose(); }
});

test('UTF-8 split across stdout chunks is preserved', async () => {
  const h = harness();
  try {
    const child = await h.lint();
    const payload = report('PG001'); payload.findings[0].message = 'Risk: café';
    const bytes = Buffer.from(JSON.stringify(payload));
    const split = bytes.indexOf(Buffer.from('é')) + 1;
    child.stdout.emit('data', bytes.subarray(0, split));
    child.stdout.emit('data', bytes.subarray(split));
    h.finish(child);
    assert.equal(h.findings()[0].message, 'PG001: Risk: café');
  } finally { h.dispose(); }
});