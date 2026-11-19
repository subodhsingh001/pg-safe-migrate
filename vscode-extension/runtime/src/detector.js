import fs from 'node:fs';
import path from 'node:path';
function scan(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...scan(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) results.push(full);
  }
  return results;
}
export function findMigrationFiles(targetPath) {
  if (targetPath) {
    if (!fs.existsSync(targetPath)) throw new Error(`Path not found: ${targetPath}`);
    if (fs.statSync(targetPath).isFile()) {
      if (!targetPath.toLowerCase().endsWith('.sql')) throw new Error('Target must be a .sql file.');
      return [targetPath];
    }
    return scan(targetPath).sort();
  }
  const dirs = ['prisma/migrations', 'drizzle', 'migrations', 'db/migrations', 'db/migration', 'sql/migrations', 'sql'];
  const files = [...new Set(dirs.filter(d => fs.existsSync(d) && fs.statSync(d).isDirectory()).flatMap(scan))].sort();
  if (!files.length) throw new Error('No SQL migrations found. Supply a file or directory.');
  return files;
}
