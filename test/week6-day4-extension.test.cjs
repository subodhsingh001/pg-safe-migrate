
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const extensionPath = path.resolve(
  __dirname,
  '../vscode-extension/extension.cjs'
);

function createHarness() {
  const commands = new Map();
  const events = {};
  const diagnostics = new Map();
  const messages = [];
  const logs = [];
  const children = [];

  const uri = {
    scheme: 'file',
    fsPath: path.resolve(__dirname, '../examples/safe.sql'),
    toString() {
      return `file://${this.fsPath}`;
    }
  };

  const document = {
    uri,
    fileName: uri.fsPath,
    languageId: 'sql',
    lineCount: 1,
    version: 1,
    isDirty: false,
    isClosed: false,
    lineAt() {
      return { text: 'SELECT 1;' };
    },
    async save() {
      return true;
    }
  };

  const collection = {
    set(uri, values) {
      diagnostics.set(uri.toString(), values);
    },
    delete(uri) {
      diagnostics.delete(uri.toString());
    },
    dispose() {}
  };

  const vscode = {
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1
    },
    Range: class {
      constructor(line, column, endLine, endColumn) {
        this.start = { line, character: column };
        this.end = { line: endLine, character: endColumn };
      }
    },
    Diagnostic: class {
      constructor(range, message, severity) {
        Object.assign(this, { range, message, severity });
      }
    },
    CodeActionKind: {
      QuickFix: 'quickfix'
    },
    CodeAction: class {
      constructor(title, kind) {
        Object.assign(this, { title, kind });
      }
    },
    languages: {
      createDiagnosticCollection() {
        return collection;
      },
      registerCodeActionsProvider() {
        return { dispose() {} };
      }
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
        return {
          appendLine(value) {
            logs.push(value);
          },
          show() {},
          dispose() {}
        };
      },
      showErrorMessage(message) {
        messages.push(message);
      },
      showWarningMessage(message) {
        messages.push(message);
      },
      showInformationMessage(message) {
        messages.push(message);
      }
    },
    workspace: {
      textDocuments: [],
      getConfiguration() {
        return {
          get(_key, fallback) {
            return fallback;
          }
        };
      },
      onDidSaveTextDocument(callback) {
        events.save = callback;
        return { dispose() {} };
      },
      onDidOpenTextDocument(callback) {
        events.open = callback;
        return { dispose() {} };
      },
      onDidCloseTextDocument(callback) {
        events.close = callback;
        return { dispose() {} };
      },
      onDidChangeTextDocument(callback) {
        events.change = callback;
        return { dispose() {} };
      }
    }
  };

  function spawnMock() {
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();

    child.killed = false;
    child.kill = () => {
      child.killed = true;
      return true;
    };

    children.push(child);

    return child;
  }

  const originalLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') {
      return vscode;
    }

    if (request === 'node:child_process') {
      return { spawn: spawnMock };
    }

    return originalLoad.apply(this, arguments);
  };

  let extension;

  try {
    delete require.cache[extensionPath];
    extension = require(extensionPath);
    extension.activate({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
  }

  async function lint() {
    await commands.get('pgSafeMigrate.lintFile')();
    return children.at(-1);
  }

  function finish(child, code, payload, stderr = '') {
    if (payload !== undefined) {
      child.stdout.emit(
        'data',
        typeof payload === 'string'
          ? payload
          : JSON.stringify(payload)
      );
    }

    if (stderr) {
      child.stderr.emit('data', stderr);
    }

    child.emit('close', code);
  }

  function findings() {
    return diagnostics.get(uri.toString()) || [];
  }

  function dispose() {
    extension.deactivate();
    delete require.cache[extensionPath];
  }

  return {
    document,
    events,
    messages,
    logs,
    children,
    diagnostics,
    lint,
    finish,
    findings,
    dispose
  };
}

function report(ruleId = 'PG001') {
  return {
    findings: [{
      ruleId,
      line: 1,
      column: 1,
      severity: 'error',
      message: 'Unsafe migration',
      fix: 'Review migration'
    }]
  };
}

test('successful CLI report creates diagnostics', async () => {
  const h = createHarness();

  try {
    const child = await h.lint();

    h.finish(child, 0, report());

    assert.equal(h.findings().length, 1);
    assert.equal(h.findings()[0].code, 'PG001');
  } finally {
    h.dispose();
  }
});

test('malformed JSON clears stale diagnostics', async () => {
  const h = createHarness();

  try {
    const first = await h.lint();
    h.finish(first, 0, report());

    assert.equal(h.findings().length, 1);

    const second = await h.lint();
    h.finish(second, 0, '{invalid-json');

    assert.equal(
      h.findings().length,
      0,
      'Malformed CLI JSON must clear stale diagnostics'
    );

    assert.match(h.logs.join('\n'), /Lint failed/);
  } finally {
    h.dispose();
  }
});

test('failed CLI must not publish misleading diagnostics', async () => {
  const h = createHarness();

  try {
    const child = await h.lint();

    h.finish(child, 2, report('PG001'), 'CLI failed');

    assert.equal(
      h.findings().length,
      0,
      'Failed CLI execution must not publish diagnostics'
    );

    assert.match(h.logs.join('\n'), /Exit code: 2/);
  } finally {
    h.dispose();
  }
});

test('superseded CLI process cannot overwrite newer diagnostics', async () => {
  const h = createHarness();

  try {
    const oldChild = await h.lint();
    const newChild = await h.lint();

    assert.equal(oldChild.killed, true);

    h.finish(newChild, 0, report('PG002'));
    h.finish(oldChild, 0, report('PG001'));

    assert.equal(h.findings().length, 1);
    assert.equal(h.findings()[0].code, 'PG002');
  } finally {
    h.dispose();
  }
});

test('document changes clear existing diagnostics', async () => {
  const h = createHarness();

  try {
    const child = await h.lint();
    h.finish(child, 0, report());

    assert.equal(h.findings().length, 1);

    h.document.version += 1;
    h.document.isDirty = true;

    h.events.change({ document: h.document });

    assert.equal(h.findings().length, 0);
  } finally {
    h.dispose();
  }
});

test('closing document clears diagnostics and cancels lint', async () => {
  const h = createHarness();

  try {
    const child = await h.lint();

    h.events.close(h.document);

    assert.equal(child.killed, true);
    assert.equal(h.findings().length, 0);
  } finally {
    h.dispose();
  }
});

test('outdated document version cannot publish diagnostics', async () => {
  const h = createHarness();

  try {
    const child = await h.lint();

    h.document.version += 1;

    h.finish(child, 0, report());

    assert.equal(h.findings().length, 0);
  } finally {
    h.dispose();
  }
});
