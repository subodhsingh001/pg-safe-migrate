// Detection only. Never use these candidates to suppress findings without AST binding.
const directive = /^\s*pg-safe-migrate-disable-next-line\b(.*)$/i;
const syntax = /^\s+(PG\d{3}(?:[ \t]*,[ \t]*PG\d{3})*)[ \t]*(?:--[ \t]*reason:[ \t]*(.*))?$/i;
const identifier = /[a-zA-Z_\u0080-\uffff]/;
const continuation = /[a-zA-Z_0-9$\u0080-\uffff]/;

export function scanSuppressions(sql) {
  if (typeof sql !== 'string') throw new TypeError('SQL must be a string');
  const directives = [], invalid = [];
  let i = 0, line = 1, lineStart = 0;
  function advance(end) {
    while (i < end) {
      if (sql[i] === '\r' || (sql[i] === '\n' && sql[i-1] !== '\r')) line++;
      if (sql[i] === '\r' || sql[i] === '\n') lineStart = i + 1;
      i++;
    }
  }
  function fail(message) { return { directives: [], invalid: [], scanError: { line, offset: i, message } }; }
  while (i < sql.length) {
    const c = sql[i];
    if (sql.startsWith('--', i)) {
      const start = i, startLine = line;
      let end = i + 2;
      while (end < sql.length && !/[\r\n]/.test(sql[end])) end++;
      const match = directive.exec(sql.slice(i+2,end));
      if (match && /^[ \t]*$/.test(sql.slice(lineStart,i))) {
        const parsed = syntax.exec(match[1]);
        const location = { line: startLine, offset: start, endOffset: end };
        if (!parsed) invalid.push({ ...location, message: 'Malformed suppression directive' });
        else directives.push({ ...location, ruleIds: [...new Set(parsed[1].toUpperCase().split(',').map(s=>s.trim()))], reason: (parsed[2] || '').trim() });
      }
      advance(end); continue;
    }
    if (sql.startsWith('/*', i)) {
      let depth = 1; advance(i+2);
      while (i < sql.length && depth) {
        if (sql.startsWith('/*',i)) { depth++; advance(i+2); }
        else if (sql.startsWith('*/',i)) { depth--; advance(i+2); }
        else advance(i+1);
      }
      if (depth) return fail('Unterminated block comment');
      continue;
    }
    const escape = /[eE]/.test(c) && sql[i+1] === "'";
    if (escape || c === "'" || c === '"') {
      const quote = escape ? "'" : c;
      advance(i+(escape?2:1)); let closed = false;
      while (i < sql.length) {
        if (sql[i] === '\\' && quote === "'") {
          if (!escape) return fail('Ambiguous backslash in ordinary string; suppression scan disabled');
          advance(Math.min(i+2,sql.length)); continue;
        }
        if (sql[i] === quote) {
          if (sql[i+1] === quote) { advance(i+2); continue; }
          advance(i+1); closed = true; break;
        }
        advance(i+1);
      }
      if (!closed) return fail('Unterminated quoted token');
      continue;
    }
    if (c === '$') {
      const tag = /^\$(?:[a-zA-Z_\u0080-\uffff][a-zA-Z_0-9\u0080-\uffff]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i+tag[0].length);
        if (end < 0) return fail('Unterminated dollar quote');
        advance(end+tag[0].length); continue;
      }
    }
    if (identifier.test(c)) {
      let end = i+1;
      while (end < sql.length && continuation.test(sql[end])) end++;
      advance(end); continue;
    }
    advance(i+1);
  }
  return { directives, invalid, scanError: null };
}
