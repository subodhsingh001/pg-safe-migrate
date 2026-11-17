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
  return document && document.uri.scheme === 'file' &&
    (document.languageId === 'sql' || document.fileName.toLowerCase().endsWith('.sql'));
}
function diagnosticsFor(findings, document) {
  return findings.map(f => {
    const line = Math.min(Math.max(0, Number(f.line || 1) - 1), Math.max(0, document.lineCount - 1));
    const column = Math.max(0, Number(f.column || 1) - 1);
    const length = document.lineAt ? document.lineAt(line).text.length : column + 1;
    const start = Math.min(column, length);
    const range = new vscode.Range(line, start, line, Math.min(length, start + 1));
    const severity = String(f.severity || '').toLowerCase() === 'error'
      ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
    const diagnostic = new vscode.Diagnostic(range,
      `${f.ruleId}: ${f.message}${f.fix ? `\nFix: ${f.fix}` : ''}`, severity);
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
  if (timers.has(key)) clearTimeout(timers.get(key));
  timers.delete(key);
  const processInfo = running.get(key);
  if (processInfo) {
    processInfo.cancelled = true;
    processInfo.child.kill();
    running.delete(key);
  }
}
function lint(document, interactive = false) {
  if (!isSql(document)) return;
  const key = document.uri.toString();
  cancel(document.uri);
  const cli = findCli(document.uri.fsPath);
  if (!cli) {
    if (interactive) vscode.window.showErrorMessage('PG Safe Migrate runtime not found. Rebuild the standalone VSIX or configure a project CLI.');
    output.appendLine(`CLI not found for ${document.uri.fsPath}`);
    return;
  }
  const nodePath = settings().get('nodePath', 'node') || 'node';
  const args = [cli, '--format', 'json', '--fail-on', 'none', document.uri.fsPath];
  output.appendLine(`Linting: ${document.uri.fsPath}`);
  output.appendLine(`CLI: ${cli}`);
  const child = spawn(nodePath, args, {
    cwd: path.dirname(path.dirname(cli)), shell: false, windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });
  const task = { child, cancelled: false };
  running.set(key, task);
  let stdout = '';
  let stderr = '';
  let spawnFailed = false;
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', err => {
    spawnFailed = true;
    if (!task.cancelled) {
      output.appendLine(`Node launch error: ${err.message}`);
      if (interactive) vscode.window.showErrorMessage(`PG Safe Migrate: ${err.message}`);
    }
  });
  child.on('close', code => {
    if (running.get(key) === task) running.delete(key);
    if (task.cancelled || spawnFailed) return;
    output.appendLine(`Exit code: ${code}`);
    if (stderr.trim()) output.appendLine(`stderr: ${stderr.trim()}`);
    try {
      if (!stdout.trim()) throw new Error(`CLI returned no JSON (exit ${code}). ${stderr.trim()}`);
      const report = JSON.parse(stdout);
      const findings = Array.isArray(report) ? report : report.findings;
      if (!Array.isArray(findings)) throw new Error('CLI JSON has no findings array');
      if (code !== 0) output.appendLine(`CLI returned findings with exit code ${code}`);
      // Never publish stale diagnostics after the document changes.
      if (document.isDirty) return;
      lastFindings.set(key, findings);
      collection.set(document.uri, diagnosticsFor(findings, document));
      const errors = findings.filter(f => String(f.severity).toLowerCase() === 'error').length;
      output.appendLine(`Findings: ${findings.length}; errors: ${errors}`);
      if (interactive) vscode.window.showInformationMessage(`PG Safe Migrate: ${findings.length} finding(s), ${errors} error(s).`);
    } catch (err) {
      output.appendLine(`Lint failed: ${err.message}`);
      if (interactive) {
        output.show(true);
        vscode.window.showErrorMessage(`PG Safe Migrate: ${err.message}`);
      }
    }
  });
}
function schedule(document) {
  if (!isSql(document) || !settings().get('autoLint', true)) return;
  cancel(document.uri);
  // CLI reads the on-disk file, so lint only saved content. Unsaved edits are linted on save.
  if (document.isDirty) return;
  const delay = Math.max(100, settings().get('debounceMs', 350));
  const key = document.uri.toString();
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    lint(document);
  }, delay));
}
function activate(context) {
  collection = vscode.languages.createDiagnosticCollection('pg-safe-migrate');
  output = vscode.window.createOutputChannel('PG Safe Migrate');
  context.subscriptions.push(collection, output);
  context.subscriptions.push(vscode.commands.registerCommand('pgSafeMigrate.lintFile', async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (!isSql(document)) return vscode.window.showWarningMessage('Open an SQL file first.');
    if (!await document.save()) return vscode.window.showErrorMessage('Save the SQL file before linting.');
    lint(document, true);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('pgSafeMigrate.showGuidance', (message) => {
    vscode.window.showInformationMessage(message, { modal: true });
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(schedule));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(schedule));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
    cancel(document.uri);
    lastFindings.delete(document.uri.toString());
    collection.delete(document.uri);
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (isSql(event.document)) {
      cancel(event.document.uri);
      // Existing diagnostics may be stale until the next save.
      collection.delete(event.document.uri);
      lastFindings.delete(event.document.uri.toString());
    }
  }));
  const provider = vscode.languages.registerCodeActionsProvider({ language: 'sql', scheme: 'file' }, {
    provideCodeActions(document, range, context) {
      const findings = lastFindings.get(document.uri.toString()) || [];
      return context.diagnostics.filter(d => d.source === 'pg-safe-migrate' && d.code).map(d => {
        const finding = findings.find(f => f.ruleId === d.code && Number(f.line || 1) === d.range.start.line + 1);
        if (!finding || !finding.fix) return null;
        const action = new vscode.CodeAction(`PG Safe Migrate: Show guidance for ${d.code}`, vscode.CodeActionKind.QuickFix);
        action.diagnostics = [d];
        action.command = { command: 'pgSafeMigrate.showGuidance', title: 'Show safe migration guidance', arguments: [finding.fix] };
        return action;
      }).filter(Boolean);
    }
  }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] });
  context.subscriptions.push(provider);
  vscode.workspace.textDocuments.forEach(schedule);
}
function deactivate() {
  for (const key of timers.keys()) clearTimeout(timers.get(key));
  timers.clear();
  for (const task of running.values()) { task.cancelled = true; task.child.kill(); }
  running.clear();
}
module.exports = { activate, deactivate, diagnosticsFor, findCli };
