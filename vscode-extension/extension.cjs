
const vscode = require('vscode');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const timers = new Map();
const running = new Map();
const lastFindings = new Map();

let collection;
let output;

function isSql(document) {
  return Boolean(
    document &&
    document.uri &&
    document.uri.scheme === 'file' &&
    (
      document.languageId === 'sql' ||
      document.fileName.toLowerCase().endsWith('.sql')
    )
  );
}

function diagnosticsFor(findings, document) {
  return findings.map(f => {
    const lineCount = Math.max(1, Number(document.lineCount) || 1);

    const rawLine = Number(f.line);
    const line = Number.isFinite(rawLine) && rawLine >= 1
      ? Math.min(Math.floor(rawLine) - 1, lineCount - 1)
      : 0;

    // Support both real VS Code documents and test mocks.
    const lineText = typeof document.lineAt === 'function'
      ? String(document.lineAt(line).text || '')
      : '';

    const rawColumn = Number(f.column);

    let startColumn = Number.isFinite(rawColumn) && rawColumn >= 1
      ? Math.floor(rawColumn) - 1
      : 0;

    if (typeof document.lineAt === 'function') {
      startColumn = Math.min(startColumn, lineText.length);

      if (startColumn >= lineText.length && lineText.length > 0) {
        startColumn = lineText.length - 1;
      }
    }

    const token = /^[A-Za-z_][A-Za-z_0-9]*/.exec(
      lineText.slice(startColumn)
    );

    const endColumn = token
      ? startColumn + token[0].length
      : startColumn + 1;

    const range = new vscode.Range(
      line,
      startColumn,
      line,
      Math.max(startColumn + 1, endColumn)
    );

    const severity =
      String(f.severity || '').toLowerCase() === 'error'
        ? vscode.DiagnosticSeverity.Error
        : vscode.DiagnosticSeverity.Warning;

    const diagnostic = new vscode.Diagnostic(
      range,
      `${f.ruleId}: ${f.message}${f.fix ? `\nFix: ${f.fix}` : ''}`,
      severity
    );

    diagnostic.source = 'pg-safe-migrate';
    diagnostic.code = f.ruleId;

    return diagnostic;
  });
}

function findCli(documentPath) {
  const candidates = [
    path.join(__dirname, 'runtime', 'bin', 'cli.js'),
    path.resolve(__dirname, '..', 'bin', 'cli.js')
  ];

  let current = path.dirname(documentPath);

  while (true) {
    candidates.push(path.join(current, 'bin', 'cli.js'));

    const parent = path.dirname(current);
    if (parent === current) break;

    current = parent;
  }

  return candidates.find(file => fs.existsSync(file));
}

function settings() {
  return vscode.workspace.getConfiguration('pgSafeMigrate');
}

function cancel(uri) {
  const key = uri.toString();

  if (timers.has(key)) {
    clearTimeout(timers.get(key));
  }

  timers.delete(key);

  const processInfo = running.get(key);

  if (processInfo) {
    processInfo.cancelled = true;
    running.delete(key);

    try {
      processInfo.child.kill();
    } catch {
      // Process may already have exited.
    }
  }
}

function lint(document, interactive = false) {
  if (!isSql(document)) return;

  const key = document.uri.toString();

  cancel(document.uri);

  const cli = findCli(document.uri.fsPath);

  if (!cli) {
    const message =
      'PG Safe Migrate runtime not found. Rebuild the standalone VSIX or configure a project CLI.';

    output.appendLine(`CLI not found for ${document.uri.fsPath}`);
    lastFindings.delete(key);
    collection.delete(document.uri);

    if (interactive) {
      vscode.window.showErrorMessage(message);
    }

    return;
  }

  const nodePath = settings().get('nodePath', 'node') || 'node';

  const args = [
    cli,
    '--format',
    'json',
    '--advisor',
    '--fail-on',
    'none',
    document.uri.fsPath
  ];

  const documentVersion = document.version;

  output.appendLine(`Linting: ${document.uri.fsPath}`);
  output.appendLine(`CLI: ${cli}`);

  let child;

  try {
    child = spawn(nodePath, args, {
      cwd: path.dirname(path.dirname(cli)),
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      }
    });
  } catch (err) {
    output.appendLine(`Node launch error: ${err.message}`);
    lastFindings.delete(key);
    collection.delete(document.uri);

    if (interactive) {
      vscode.window.showErrorMessage(
        `PG Safe Migrate: ${err.message}`
      );
    }

    return;
  }

  const task = {
    child,
    cancelled: false
  };

  running.set(key, task);

  let stdout = '';
  let stderr = '';
  let spawnFailed = false;

  child.stdout.on('data', chunk => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', chunk => {
    stderr += chunk.toString();
  });

  child.on('error', err => {
    spawnFailed = true;
    if (running.get(key) === task && !task.cancelled) {
      running.delete(key);
      lastFindings.delete(key);
      collection.delete(document.uri);
    }

    if (!task.cancelled) {
      output.appendLine(`Node launch error: ${err.message}`);

      if (interactive) {
        vscode.window.showErrorMessage(
          `PG Safe Migrate: ${err.message}`
        );
      }
    }
  });

  child.on('close', code => {
    // Ignore cancelled, failed or superseded lint processes.
    if (task.cancelled || running.get(key) !== task) return;
    running.delete(key);

    if (spawnFailed) {
      lastFindings.delete(key);
      collection.delete(document.uri);
      return;
    }

    output.appendLine(`Exit code: ${code}`);
    if (stderr.trim()) output.appendLine(`stderr: ${stderr.trim()}`);

    // With --fail-on none, unsafe SQL still returns 0.
    // Nonzero exit codes mean linting did not complete successfully.
    if (code !== 0) {
      const message = `CLI failed with exit code ${code}` +
        (stderr.trim() ? `: ${stderr.trim()}` : '');
      output.appendLine(`Lint failed: ${message}`);
      lastFindings.delete(key);
      collection.delete(document.uri);
      if (interactive) {
        output.show(true);
        vscode.window.showErrorMessage(`PG Safe Migrate: ${message}`);
      }
      return;
    }

    try {
      if (!stdout.trim()) {
        throw new Error('CLI returned no JSON');
      }
      const report = JSON.parse(stdout);
      const findings = Array.isArray(report) ? report : report?.findings;
      if (!Array.isArray(findings)) {
        throw new Error('CLI JSON has no findings array');
      }

      // Do not publish results from an outdated document.
      if (document.isClosed || document.isDirty || document.version !== documentVersion) {
        return;
      }

      const diagnostics = diagnosticsFor(findings, document);
      lastFindings.set(key, findings);
      collection.set(document.uri, diagnostics);
      const errors = findings.filter(f => String(f.severity).toLowerCase() === 'error').length;
      output.appendLine(`Findings: ${findings.length}; errors: ${errors}`);
      if (interactive) {
        vscode.window.showInformationMessage(
          `PG Safe Migrate: ${findings.length} finding(s), ${errors} error(s).`
        );
      }
    } catch (err) {
      output.appendLine(`Lint failed: ${err.message}`);
      // A failed report must not leave stale diagnostics on screen.
      lastFindings.delete(key);
      collection.delete(document.uri);
      if (interactive) {
        output.show(true);
        vscode.window.showErrorMessage(`PG Safe Migrate: ${err.message}`);
      }
    }
  });
}

function schedule(document) {
  if (!isSql(document)) return;

  cancel(document.uri);

  if (!settings().get('autoLint', true)) return;

  // CLI reads the saved file, not unsaved editor content.
  if (document.isDirty) return;

  const delay = Math.max(
    100,
    settings().get('debounceMs', 350)
  );

  const key = document.uri.toString();

  timers.set(key, setTimeout(() => {
    timers.delete(key);
    lint(document);
  }, delay));
}

function activate(context) {
  collection = vscode.languages.createDiagnosticCollection(
    'pg-safe-migrate'
  );

  output = vscode.window.createOutputChannel(
    'PG Safe Migrate'
  );

  context.subscriptions.push(collection, output);

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pgSafeMigrate.lintFile',
      async () => {
        const document =
          vscode.window.activeTextEditor?.document;

        if (!isSql(document)) {
          return vscode.window.showWarningMessage(
            'Open an SQL file first.'
          );
        }

        if (!await document.save()) {
          return vscode.window.showErrorMessage(
            'Save the SQL file before linting.'
          );
        }

        lint(document, true);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pgSafeMigrate.showGuidance',
      async guidance => {
        if (!guidance || typeof guidance !== 'object') return;
        const alternative = guidance.alternative;
        const preview = [
          '-- PG Safe Migrate: advisory preview only; not an executable migration.',
          '-- This preview is separate from your original SQL file.',
          `-- Rule: ${String(guidance.ruleId || 'migration safety')}`,
          ...((guidance.steps || []).map((step, index) => `-- ${index + 1}. ${String(step).replace(/\r?\n/g, ' ')}`)),
          ...(guidance.note ? [`-- ${String(guidance.note).replace(/\r?\n/g, ' ')}`] : []),
          ...(alternative?.title ? [`-- Suggested approach: ${String(alternative.title).replace(/\r?\n/g, ' ')}`] : []),
          '',
          alternative?.sql || '-- No general-purpose SQL rewrite is safe for this operation.',
          '',
          ...(alternative?.caveat ? [`-- Caveat: ${String(alternative.caveat).replace(/\r?\n/g, ' ')}`] : []),
          '-- Never execute this preview without reviewing and adapting it.'
        ].join('\n');
        const choices = ['Open separate SQL preview'];
        if (alternative?.sql) choices.push('Copy example SQL');
        const choice = await vscode.window.showInformationMessage(
          'PG Safe Migrate guidance is advisory. Open a separate preview to inspect it; your migration will not be modified.',
          ...choices
        );
        if (choice === 'Open separate SQL preview') {
          const previewDocument = await vscode.workspace.openTextDocument({ language: 'sql', content: preview });
          await vscode.window.showTextDocument(previewDocument, { preview: true, preserveFocus: false });
        } else if (choice === 'Copy example SQL' && alternative?.sql) {
          await vscode.env.clipboard.writeText(alternative.sql);
          vscode.window.showInformationMessage('PG Safe Migrate: example SQL copied. Review before use.');
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(schedule)
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(schedule)
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(document => {
      cancel(document.uri);

      const key = document.uri.toString();

      lastFindings.delete(key);
      collection.delete(document.uri);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (!isSql(event.document)) return;

      cancel(event.document.uri);

      collection.delete(event.document.uri);
      lastFindings.delete(event.document.uri.toString());
    })
  );

  const provider = vscode.languages.registerCodeActionsProvider(
    {
      language: 'sql',
      scheme: 'file'
    },
    {
      provideCodeActions(document, range, context) {
        const findings =
          lastFindings.get(document.uri.toString()) || [];

        return context.diagnostics
          .filter(d => d.source === 'pg-safe-migrate' && d.code)
          .map(d => {
            const finding = findings.find(f =>
              f.ruleId === d.code &&
              Number(f.line || 1) === d.range.start.line + 1 &&
              Number(f.column || 1) - 1 === d.range.start.character
            ) || findings.find(f =>
              f.ruleId === d.code &&
              Number(f.line || 1) === d.range.start.line + 1
            );
            if (!finding) return null;
            const guidance = finding.advisor || {
              steps: [finding.fix || finding.message],
              note: 'Review this migration in staging before deployment.',
              alternative: null
            };
            const action = new vscode.CodeAction(
              `PG Safe Migrate: View safe migration guidance (${d.code})`,
              vscode.CodeActionKind.QuickFix
            );
            action.diagnostics = [d];
            action.command = {
              command: 'pgSafeMigrate.showGuidance',
              title: 'View safe migration guidance',
              arguments: [guidance]
            };
            // Intentionally no WorkspaceEdit: a template is not a safe automatic fix.
            return action;
          })
          .filter(Boolean);
      }
    },
    {
      providedCodeActionKinds: [
        vscode.CodeActionKind.QuickFix
      ]
    }
  );

  context.subscriptions.push(provider);

  vscode.workspace.textDocuments.forEach(schedule);
}

function deactivate() {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }

  timers.clear();

  for (const task of running.values()) {
    task.cancelled = true;

    try {
      task.child.kill();
    } catch {
      // Process may already have exited.
    }
  }

  running.clear();
}

module.exports = {
  activate,
  deactivate,
  diagnosticsFor,
  findCli
};
