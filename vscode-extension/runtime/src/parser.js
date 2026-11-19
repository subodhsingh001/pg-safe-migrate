
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

    return statements.map(s => {
      let offset =
        typeof s.stmt_location === 'number'
          ? s.stmt_location
          : 0;

      offset = Math.max(
        0,
        Math.min(offset, source.length)
      );

      // PostgreSQL may report the beginning of the
      // statement span before leading whitespace.
      // Advance to the first non-whitespace character.
      while (
        offset < source.length &&
        /\s/.test(source[offset])
      ) {
        offset++;
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
