'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

const extensionPath = path.resolve(__dirname, '../vscode-extension/extension.cjs');

function harness(settings = {}, fixture = false, security = {}) {
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
      isTrusted: security.trusted !== false,
      getConfiguration() { return { get(key, fallback) {
        return Object.hasOwn(settings, key) ? settings[key] : fallback;
      }, inspect(key) { return security[key] || {}; } }; },
      onDidSaveTextDocument(cb) { events.save = cb; return { dispose() {} }; },
      onDidOpenTextDocument(cb) { events.open = cb; return { dispose() {} }; },
      onDidCloseTextDocument(cb) { events.close = cb; return { dispose() {} }; },
      onDidChangeTextDocument(cb) { events.change = cb; return { dispose() {} }; }
    }
  };
  function spawnReal(executable, args, options) {
    security.launches.push({ executable, args, options });
    const child = spawn(executable, fixture ? [fixturePath, args.at(-1)] : args, options);
    children.push(child);
    child.once('close', (code, signal) => closed.push({ child, code, signal }));
    return child;
  }
  const isolated = path.join(dir, 'installed-extension');
  fs.mkdirSync(isolated);
  const isolatedPath = path.join(isolated, 'extension.cjs');
  fs.copyFileSync(extensionPath, isolatedPath);
  fs.copyFileSync(path.join(path.dirname(extensionPath), 'generate-plan.cjs'), path.join(isolated, 'generate-plan.cjs'));
  if (security.bundled !== false) {
    fs.mkdirSync(path.join(isolated, 'runtime', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(isolated, 'runtime', 'bin', 'cli.js'), '');
  }
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'cli.js'), 'throw new Error("unexpected workspace CLI");');
  security.launches = [];
  const originalLoad = Module._load;
  let extension;
  try {
    Module._load = function(request, parent, isMain) {
      if (request === 'vscode') return vscode;
      if (request === 'node:child_process') return { spawn: spawnReal };
      return originalLoad.apply(this, arguments);
    };
    delete require.cache[isolatedPath];
    extension = require(isolatedPath);
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }
  return {
    document, events, messages, logs, children, closed, launches: security.launches,
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
      extension.deactivate(); delete require.cache[isolatedPath];
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

test('missing bundled runtime never executes workspace CLI', async () => {
  const h = harness({}, true, { bundled: false });
  try { h.select(h.make('unsafe', 'SELECT 1;')); await h.lint();
    assert.equal(h.launches.length, 0); assert.match(h.logs.join('\n'), /CLI not found/);
  } finally { await h.dispose(); }
});
test('restricted workspace cannot launch manual lint', async () => {
  const h = harness({}, true, { trusted: false });
  try { h.select(h.make('restricted', 'SELECT 1;')); await h.lint(); assert.equal(h.launches.length, 0); }
  finally { await h.dispose(); }
});
test('workspace executable override is ignored in favor of global executable', async () => {
  const h = harness({ nodePath: 'untrusted-node' }, true, { nodePath: { globalValue: process.execPath, workspaceValue: 'untrusted-node' } });
  try { h.select(h.make('trusted', 'SELECT 1;')); await h.lint(); await until(() => h.closed.length === 1);
    assert.equal(h.launches[0].executable, process.execPath); assert.equal(h.launches[0].options.shell, false); assert.equal(h.closed[0].code, 0);
  } finally { await h.dispose(); }
});
test('manifest disables untrusted workspaces and machine scopes executable', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(extensionPath), 'package.json'), 'utf8'));
  assert.equal(manifest.capabilities.untrustedWorkspaces.supported, false);
  assert.equal(manifest.contributes.configuration.properties['pgSafeMigrate.nodePath'].scope, 'machine');
});
