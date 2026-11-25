'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const extensionPath = path.resolve(__dirname, '../vscode-extension/extension.cjs');

function harness(settings = {}, fixture = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-safe integration '));
  const closed = [];
  const fixturePath = path.join(dir, 'fixture.cjs');
  fs.writeFileSync(fixturePath, `const fs = require('node:fs'); const file = process.argv[2]; if (fs.readFileSync(file, 'utf8').includes('STALL')) setInterval(() => {}, 1000); else console.log(JSON.stringify({findings:[{ruleId:'PG002',line:1,column:1,severity:'error',message:'fixture'}]}));`);
  const commands = new Map();
  const events = {};
  const diagnostics = new Map();
  const messages = [];
  const logs = [];
  const children = [];
  const uri = {
    scheme: 'file',
    fsPath: path.join(dir, 'first.sql'),
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
  function spawnReal(executable, args, options) {
    const child = spawn(executable, fixture ? [fixturePath, args.at(-1)] : args, options);
    children.push(child);
    child.once('close', (code, signal) => closed.push({ child, code, signal }));
    return child;
  }
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === 'vscode') return vscode;
      if (request === 'node:child_process') return { spawn: spawnReal };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[extensionPath];
    extension = require(extensionPath);
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  return {
    document, events, messages, logs, children, closed,
    make(name, sql) {
      const file = path.join(dir, name + ".sql");
      fs.writeFileSync(file, sql);
      return { ...document, fileName: file, uri: { scheme: "file", fsPath: file, toString() { return file; } }, lineCount: sql.split(/\r?\n/).length, lineAt(i) { return { text: sql.split(/\r?\n/)[i] }; } };
    },
    select(doc) { vscode.window.activeTextEditor.document = doc; },
    async lint() {
      await commands.get('pgSafeMigrate.lintFile')();
      return children.at(-1);
    },
    findings(doc) { return diagnostics.get(doc.uri.toString()) || []; },
    async dispose() {
      extension.deactivate(); delete require.cache[extensionPath];
      for (const child of children) { if (!closed.some(x => x.child === child)) child.kill(); }
      try { await until(() => closed.length === children.length); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }

  };
}


async function until(predicate, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error('Timed out waiting for child process');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('real CLI produces Unicode-aware extension diagnostic', async () => {
  const h = harness({ nodePath: process.execPath });
  try {
    const prefix = "SELECT '\u{1F600}'; ";
    const doc = h.make('unicode path', prefix + 'ALTER TABLE users DROP COLUMN email;');
    h.select(doc); await h.lint();
    await until(() => h.closed.length === 1);
    assert.equal(h.closed[0].code, 0);
    const findings = h.findings(doc);
    assert.deepEqual(findings.map(d => d.code), ['PG002']);
    assert.deepEqual(findings[0].range.start, { line: 0, character: prefix.length });
    assert.equal(findings[0].range.end.character, prefix.length + 5);
  } finally { await h.dispose(); }
});

test('real child cancellation releases queue only after close', async () => {
  const h = harness({ nodePath: process.execPath }, true);
  try {
    const first = h.make('first', 'STALL'); const second = h.make('second', 'SELECT 1;');
    h.select(first); await h.lint();
    h.select(second); await h.lint();
    assert.equal(h.children.length, 1);
    h.events.close(first);
    assert.equal(h.children.length, 1);
    await until(() => h.closed.length === 2);
    assert.notEqual(h.closed[0].code, 0);
    assert.deepEqual(h.findings(first), []);
    assert.deepEqual(h.findings(second).map(d => d.code), ['PG002']);
  } finally { await h.dispose(); }
});

test('real timeout terminates stalled child and resumes queue', async () => {
  const h = harness({ nodePath: process.execPath, timeoutMs: 1000 }, true);
  try {
    const first = h.make('stall', 'STALL'); const second = h.make('next', 'SELECT 1;');
    h.select(first); await h.lint(); h.select(second); await h.lint();
    assert.equal(h.children.length, 1);
    await until(() => h.closed.length === 2);
    assert.notEqual(h.closed[0].code, 0);
    assert.match(h.logs.join('\n'), /timed out/i);
    assert.deepEqual(h.findings(first), []);
    assert.deepEqual(h.findings(second).map(d => d.code), ['PG002']);
  } finally { await h.dispose(); }
});

test('real missing executable reports failure and queue recovers', async () => {
  const settings = { nodePath: path.join(os.tmpdir(), 'pg-safe-nonexistent-' + process.pid, 'node') };
  const h = harness(settings, true);
  try {
    const first = h.make('failure', 'SELECT 1;'); const second = h.make('recovery', 'SELECT 1;');
    h.select(first); await h.lint();
    settings.nodePath = process.execPath;
    h.select(second); await h.lint();
    await until(() => h.closed.length === 2);
    assert.match(h.logs.join('\n'), /Node launch error/);
    assert.deepEqual(h.findings(first), []);
    assert.deepEqual(h.findings(second).map(d => d.code), ['PG002']);
  } finally { await h.dispose(); }
});
