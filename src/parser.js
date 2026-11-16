import pgQuery from 'libpg-query';

export async function parseSqlFile(sqlContent) {
  if (!sqlContent || !sqlContent.trim()) {
    return [];
  }
  try {
    const result = await pgQuery.parse(sqlContent);
    return (result.stmts || []).map((s) => s.stmt);
  } catch (err) {
    throw new Error(`SQL Syntax Error: ${err.message}`);
  }
}
