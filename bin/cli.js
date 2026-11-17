#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { program } from 'commander';
import chalk from 'chalk';
import { createRequire } from 'node:module';
import { toGitHubAnnotations, toMarkdownSummary } from '../src/github.js';
import { summarizeRisk } from '../src/risk.js';
import { getPreset } from '../src/presets.js';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
import { findMigrationFiles } from '../src/detector.js';
import { getChangedSqlFiles } from '../src/gitDiff.js';
import { loadConfig, isExcluded } from '../src/config.js';
import { analyzeFiles } from '../src/analysis.js';
import { toJson, toSarif } from '../src/reports.js';
import { inspectDatabaseUrl } from '../src/db-inspect.js';
import { simulateSqlFile } from '../src/simulator.js';
import { combinedAssessment } from '../src/combined.js';
import { loadTeamPolicy, assessTeamPolicy } from '../src/team-policy.js';

program.name('pg-safe-migrate').description('AST-based PostgreSQL migration risk linter (not a downtime guarantee)').version(version)
 .argument('[target]', 'SQL file or migrations directory')
 .option('-c, --changed [baseBranch]', 'Lint changed SQL files')
 .option('--format <format>', 'text, json or sarif', 'text')
 .option('--output <file>', 'Write report to file')
 .option('--config <file>', 'JSON configuration file', 'pg-safe-migrate.config.json')
 .option('--postgres-version <version>', 'Target PostgreSQL major version')
 .option('--fail-on <severity>', 'warning, error or none', 'error')
 .option('--advisor', 'Include deployment guidance')
 .option('--preset <name>', 'recommended or strict', 'recommended')
 .option('--github', 'Emit GitHub workflow annotations')
 .option('--summary <file>', 'Write Markdown PR summary')
 .option('--risk', 'Include heuristic risk score in text output')
 .option('--assess', 'Combine static linting with disposable PostgreSQL simulation')
 .option('--verify-sql <file>', 'Run post-migration SQL assertions (SQL errors or exceptions fail verification)')
 .option('--team-policy <file>', 'Local JSON team policy for combined assessment')
 .option('--simulate <sqlFile>', 'Execute one SQL file against a disposable Docker PostgreSQL container')
 .option('--baseline <sqlFile>', 'Apply baseline SQL before simulation')
 .option('--migrations-dir <directory>', 'Simulate top-level SQL migrations in filename order')
 .option('--simulate-timeout <seconds>', 'Simulation execution timeout (10-300 seconds)', '60')
 .option('--inspect-db', 'Inspect database catalog (requires DATABASE_URL and optional pg dependency)')
 .action(async (target,opts)=>{
   try {
     if (!['text','json','sarif'].includes(opts.format)) throw new Error('format must be text, json or sarif');
     if (!['none','warning','error'].includes(opts.failOn)) throw new Error('fail-on must be none, warning or error');
     const preset = getPreset(opts.preset);
     const userConfig = loadConfig(opts.config);
     const config = { ...preset, ...userConfig, rules: { ...preset.rules, ...userConfig.rules } };
     if(opts.postgresVersion!==undefined) {
       const version=Number(opts.postgresVersion);
       if (!Number.isInteger(version)||version<10||version>99) throw new Error('postgres-version must be an integer >= 10');
       config.postgresVersion=version;
     }
     if (opts.assess) {
       const policy = opts.teamPolicy ? loadTeamPolicy(opts.teamPolicy) : null;
       const assessment = await combinedAssessment({ file: opts.simulate, migrationsDir: opts.migrationsDir, baseline: opts.baseline, verifySql: opts.verifySql, postgresVersion: String(opts.postgresVersion ?? '16'), config });
       if (policy) assessment.teamPolicy = assessTeamPolicy(assessment, policy);
       if (opts.output) { fs.mkdirSync(path.dirname(path.resolve(opts.output)), {recursive:true}); fs.writeFileSync(opts.output, JSON.stringify(assessment,null,2)+'\n'); }
       else console.log(JSON.stringify(assessment,null,2));
       process.exitCode = assessment.passed && (!assessment.teamPolicy || assessment.teamPolicy.passed) ? 0 : 1;
       return;
     }
     if (opts.simulate || opts.migrationsDir) {
       const result = simulateSqlFile(opts.simulate, { baseline: opts.baseline, migrationsDir: opts.migrationsDir, postgresVersion: String(opts.postgresVersion ?? '16'), timeoutSeconds: Number(opts.simulateTimeout), verifySql: opts.verifySql });
       console.log(JSON.stringify(result, null, 2));
       process.exitCode = result.passed ? 0 : 1;
       return;
     }
     if (opts.inspectDb) {
       const snapshot = await inspectDatabaseUrl(process.env.DATABASE_URL);
       console.log(JSON.stringify(snapshot, null, 2));
       return;
     }
     const files=(opts.changed?getChangedSqlFiles(typeof opts.changed==='string'?opts.changed:undefined):findMigrationFiles(target)).filter(f=>!isExcluded(f,config.exclude));
     const entries=files.map(file=>({file:path.relative(process.cwd(),file)||file,sql:fs.readFileSync(file,'utf8')}));
     const findings=await analyzeFiles(entries,config,{advisor:opts.advisor});
     if (opts.github) process.stdout.write(toGitHubAnnotations(findings));
     if (opts.summary) {fs.mkdirSync(path.dirname(path.resolve(opts.summary)),{recursive:true});fs.writeFileSync(opts.summary,toMarkdownSummary(findings,files.length));}
     const report=opts.format==='json'?toJson(findings,{filesChecked:files.length,postgresVersion:config.postgresVersion}):opts.format==='sarif'?toSarif(findings):[
       ...findings.flatMap(f=>[`${f.file}:${f.line}:${f.column} [${f.ruleId}] ${f.severity}: ${f.message}`,`  Fix: ${f.fix}`,...(f.advisor?f.advisor.steps.map((s,i)=>`  ${i+1}. ${s}`):[])]),
       ...(opts.risk?[`Risk: ${JSON.stringify(summarizeRisk(findings))}`]:[]),
       `Checked ${files.length} SQL file(s); found ${findings.length} configured risk(s). No downtime guarantee.`
     ].join('\n');
     if(opts.output) {fs.mkdirSync(path.dirname(path.resolve(opts.output)),{recursive:true});fs.writeFileSync(opts.output,report+'\n');}
     else console.log(opts.format==='text'?(findings.length?chalk.yellow(report):chalk.green(report)):report);
     process.exitCode=opts.failOn==='warning'?Number(findings.length>0):opts.failOn==='error'?Number(findings.some(f=>f.severity==='error')):0;
   }catch(e){console.error(`Error: ${e.message}`);process.exitCode=2;}
 });
program.parse();
