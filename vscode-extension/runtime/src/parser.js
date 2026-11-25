import pgQuery from 'libpg-query';

export async function parseSqlFile(sqlContent, options = {}) {
  if (!sqlContent || !sqlContent.trim()) {
    return [];
  }

  try {
    const result = await pgQuery.parse(sqlContent);
    const statements = result.stmts || [];

    if (!options.details) {
      return statements.map(s => s.stmt);
    }

    const source = String(sqlContent);

    // Convert ordered PostgreSQL UTF-8 byte locations to UTF-16 offsets.
    const byteLength = Buffer.byteLength(source);
    let byteCursor = 0;
    let charCursor = 0;
    function locateByte(target) {
      if (target < byteCursor) { byteCursor = 0; charCursor = 0; }
      while (byteCursor < target && charCursor < source.length) {
        const cp = source.codePointAt(charCursor);
        const width = cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
        if (byteCursor + width > target) break;
        byteCursor += width;
        charCursor += cp > 0xffff ? 2 : 1;
      }
      return charCursor;
    }

    return statements.map(s => {
      let offset =
        typeof s.stmt_location === 'number'
          ? s.stmt_location
          : 0;

      offset = Math.max(
        0,
        Math.min(offset, byteLength)
      );

      offset = locateByte(offset);

      // Skip only leading SQL trivia, never statement contents.
      while (offset < source.length) {
        if (/[ \t\r\n\f\v]/.test(source[offset])) {
          offset++;
        } else if (source.startsWith('--', offset)) {
          offset += 2;
          while (offset < source.length &&
                 source[offset] !== '\n' && source[offset] !== '\r') {
            offset++;
          }
        } else if (source.startsWith('/*', offset)) {
          offset += 2;
          let depth = 1;
          while (offset < source.length && depth > 0) {
            if (source.startsWith('/*', offset)) {
              depth++;
              offset += 2;
            } else if (source.startsWith('*/', offset)) {
              depth--;
              offset += 2;
            } else {
              offset++;
            }
          }
        } else {
          break;
        }
      }

      return {
        stmt: s.stmt,
        offset
      };
    });
  } catch (err) {
    throw new Error(
      `SQL Syntax Error: ${err.message}`
    );
  }
}
