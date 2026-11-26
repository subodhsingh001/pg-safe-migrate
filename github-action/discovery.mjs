import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';
const decode = b => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b);
const sha = s => { if (typeof s !== 'string' || !/^[a-f0-9]{40}$/.test(s)) throw new Error('Expected full Git commit SHA'); return s; };
const roots = /(?:^|\/)(?:prisma\/migrations|drizzle|migrations|db\/migration|sql)\//i;
export function discoverSql({ cwd, base, head, mode = 'changed' }) {
  const git = (args, maxBuffer = 8 * 1024 * 1024) => execFileSync('git', ['--no-replace-objects', ...args], { cwd, timeout: 15000, maxBuffer, stdio: ['ignore','pipe','pipe'], env: {...process.env, GIT_NO_LAZY_FETCH:'1', GIT_TERMINAL_PROMPT:'0'} });
  const commit = s => { sha(s); if (decode(git(['cat-file','-t',s])).trim() !== 'commit') throw new Error('Expected commit object'); return s; };
  commit(head);
  if (!['changed','all'].includes(mode)) throw new Error('Invalid mode');
  let changed;
  if (mode === 'changed') {
    commit(base);
    const ancestor = sha(decode(git(['merge-base',base,head])).trim());
    changed = new Set(decode(git(['diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z','--diff-filter=AMT',ancestor,head,'--'])).split('\0').filter(Boolean));
  }
  const entries = []; let total = 0;
  for (const row of decode(git(['ls-tree','-r','-z','--full-tree',head])).split('\0').filter(Boolean)) {
    const tab = row.indexOf('\t');
    const [modeBits,type,oid] = row.slice(0,tab).split(' ');
    const file = row.slice(tab+1);
    if (!file.toLowerCase().endsWith('.sql') || (changed ? !changed.has(file) : !roots.test(file))) continue;
    if (!['100644','100755'].includes(modeBits) || type !== 'blob') throw new Error('Non-regular SQL entry');
    if (/[\\\x00-\x1f\x7f]/.test(file) || file.split('/').some(p=>!p || p==='.' || p==='..')) throw new Error('Unsupported SQL path');
    sha(oid);
    if (entries.length >= 500) throw new Error('SQL file count limit exceeded');
    const size = Number(decode(git(['cat-file','-s',oid])).trim());
    if (!Number.isSafeInteger(size) || size < 0 || size > 2*1024*1024 || total+size > 16*1024*1024) throw new Error('SQL size limit exceeded');
    const blob = git(['cat-file','blob',oid], 2*1024*1024+1);
    if (blob.length !== size) throw new Error('SQL blob size mismatch');
    total += size;
    entries.push({file,sql:decode(blob)});
  }
  return entries.sort((a,b)=>a.file.localeCompare(b.file));
}
