/** Read-only catalog snapshot. Never executes user-supplied SQL or changes session state. */
export async function inspectDatabase(query, { limit = 50 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('limit must be between 1 and 200');
  const version = await query('SHOW server_version_num');
  const versionNum = Number(version.rows?.[0]?.server_version_num);
  if (!Number.isInteger(versionNum) || versionNum < 100000) throw new Error('Unable to determine PostgreSQL server version');
  const tables = await query(`SELECT n.nspname AS schema_name, c.relname AS table_name,
    c.reltuples::bigint AS estimated_rows, pg_total_relation_size(c.oid) AS bytes
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT $1`, [limit]);
  return { postgresVersion: Math.floor(versionNum / 10000), source: 'read-only PostgreSQL catalog', confidence: 'estimates', tables: tables.rows.map(r => ({ schema: r.schema_name, table: r.table_name, estimatedRows: Number(r.estimated_rows), bytes: Number(r.bytes) })) };
}

export async function inspectDatabaseUrl(url, options) {
  if (!url) throw new Error('Database URL is required');
  let pg;
  try { pg = await import('pg'); }
  catch { throw new Error('Database inspection requires the optional pg package: npm install pg'); }
  const client = new pg.default.Client({ connectionString: url, connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000, application_name: 'pg-safe-migrate-inspect' });
  try {
    await client.connect();
    // Read-only transaction protects against accidental writes; query budget is bounded.
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await inspectDatabase((sql, params) => client.query(sql, params), options);
    await client.query('ROLLBACK');
    return result;
  } finally { await client.end(); }
}
