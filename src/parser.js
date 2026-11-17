import pgQuery from 'libpg-query';

export async function parseSqlFile(sqlContent, options = {}) {
  if (!sqlContent || !sqlContent.trim()) return [];
  try {
    const result = await pgQuery.parse(sqlContent);
    const statements = result.stmts || [];
    if (!options.details) return statements.map(s => s.stmt);
    return statements.map(s => ({stmt:s.stmt,offset:typeof s.stmt_location==='number'?s.stmt_location:0}));
  } catch (err) {
    throw new Error(`SQL Syntax Error: ${err.message}`);
  }
}
