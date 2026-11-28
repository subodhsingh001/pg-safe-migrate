// Review-only framework guidance; never write migration history or execute SQL.
const supported = ['auto','prisma','drizzle','flyway','raw'];
export function detectGeneratorFramework(file) {
 const p = file.replaceAll('\\','/').toLowerCase().split('/');
 const matches = [];
 if (p.some((x,i)=>x==='prisma' && p[i+1]==='migrations')) matches.push('prisma');
 if (p.includes('drizzle')) matches.push('drizzle');
 if (p.some((x,i)=>x==='db' && p[i+1]==='migration') || p.includes('flyway')) matches.push('flyway');
 if(matches.length>1) throw new Error('Ambiguous framework path; specify --framework explicitly');
 return matches[0] || 'raw';
}
const profiles = {
 prisma: {directory:'prisma/migrations/<timestamp>_<description>/migration.sql', guidance:'Review schema.prisma and generated client compatibility at each deployment. PostgreSQL migrations are not automatically wrapped by Prisma Migrate by default; inspect explicit transaction statements and runner behavior.', index:'Use a separate reviewed migration without BEGIN/COMMIT for concurrent indexes. Verify actual Prisma runner behavior.', recovery:'Use migrate resolve only after reconciling actual database state and migration history; it does not undo SQL.'},
 drizzle: {directory:'Configured Drizzle migration directory (often drizzle/)', guidance:'Keep schema definitions, snapshots and journal consistent using the supported tooling. Verify the selected driver and migrator transaction behavior.', index:'Do not place concurrent index SQL in a transaction-wrapped migrator. Use a separately reviewed nontransactional deployment procedure and reconcile migration history.', recovery:'Reconcile database state and Drizzle metadata before retrying; do not manually mark an unapplied migration successful.'},
 flyway: {directory:'Configured Flyway locations (often db/migration/V<version>__<description>.sql)', guidance:'Use new versioned migrations; do not edit applied migrations. Verify Flyway version, locations and transaction settings.', index:'Isolate concurrent index SQL in a separate migration and verify per-script executeInTransaction=false configuration and runner settings.', recovery:'Inspect schema history and database state before repair; repair does not reverse database changes.'},
 raw: {directory:'Project-defined migration directory (for example migrations/001_description.sql)', guidance:'Use ordered reviewed migration stages and record their execution externally.', index:'Execute concurrent index creation outside any transaction block using a compatible runner.', recovery:'Reconcile actual database state with the deployment ledger before retrying.'}
};
export function addFramework(plan, file, requested='auto') {
 if(!supported.includes(requested)) throw new Error('framework must be auto, prisma, drizzle, flyway or raw');
 const name=requested==='auto'?detectGeneratorFramework(file):requested;
 const p=profiles[name];
 plan.framework={name, selection:requested==='auto'?'path-heuristic':'explicit', directory:p.directory, guidance:[p.guidance,p.index,p.recovery,'Keep expansion, application deployment, backfill, validation and contract as separately approved stages. Never run the entire report as a migration.']};
 for(const op of plan.operations) {
  op.frameworkSteps=op.steps.map(s=>({phase:s.phase,execution:s.sql===null?'manual':op.kind==='create-index'?'outside-transaction':s.phase==='backfill'?'one-short-transaction-per-batch':s.phase==='validate'?'read-only-review':'separately-reviewed',instruction:op.kind==='create-index'?p.index:s.phase==='contract'?'Separate approval after compatibility and recovery review.': 'Review prerequisites and runner behavior before proceeding.'}));
 }
 plan.limitations.push('Framework selection is advisory; installed ORM versions, configuration and transaction behavior are not inspected. No migration files or metadata are modified.');
 return plan;
}
