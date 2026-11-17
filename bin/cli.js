#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { program } from 'commander';
import chalk from 'chalk';
import { findMigrationFiles } from '../src/detector.js';
import { getChangedSqlFiles } from '../src/gitDiff.js';
import { loadConfig, isExcluded } from '../src/config.js';
import { analyzeFiles } from '../src/analysis.js';
import { toJson, toSarif } from '../src/reports.js';

program.name('pg-safe-migrate').description('AST-based PostgreSQL migration risk linter (not a downtime guarantee)').version('2.0.0-rc.2')
 .argument('[target]', 'SQL file or migrations directory')
 .option('-c, --changed [baseBranch]', 'Lint changed SQL files')
 .option('--format <format>', 'text, json or sarif', 'text')
 .option('--output <file>', 'Write report to file')
 .option('--config <file>', 'JSON configuration file', 'pg-safe-migrate.config.json')
 .option('--postgres-version <version>', 'Target PostgreSQL major version')
 .option('--fail-on <severity>', 'warning, error or none', 'error')
 .option('--advisor', 'Include deployment guidance')
 .action(async (target,opts)=>{
   try {
     if (!['text','json','sarif'].includes(opts.format)) throw new Error('format must be text, json or sarif');
     if (!['none','warning','error'].includes(opts.failOn)) throw new Error('fail-on must be none, warning or error');
     const config=loadConfig(opts.config);
     if(opts.postgresVersion!==undefined) {
       const version=Number(opts.postgresVersion);
       if (!Number.isInteger(version)||version<10||version>99) throw new Error('postgres-version must be an integer >= 10');
       config.postgresVersion=version;
     }
     const files=(opts.changed?getChangedSqlFiles(typeof opts.changed==='string'?opts.changed:undefined):findMigrationFiles(target)).filter(f=>!isExcluded(f,config.exclude));
     const entries=files.map(file=>({file:path.relative(process.cwd(),file)||file,sql:fs.readFileSync(file,'utf8')}));
     const findings=await analyzeFiles(entries,config,{advisor:opts.advisor});
     const report=opts.format==='json'?toJson(findings,{filesChecked:files.length,postgresVersion:config.postgresVersion}):opts.format==='sarif'?toSarif(findings):[
       ...findings.flatMap(f=>[`${f.file}:${f.line}:${f.column} [${f.ruleId}] ${f.severity}: ${f.message}`,`  Fix: ${f.fix}`,...(f.advisor?f.advisor.steps.map((s,i)=>`  ${i+1}. ${s}`):[])]),
       `Checked ${files.length} SQL file(s); found ${findings.length} configured risk(s). No downtime guarantee.`
     ].join('\n');
     if(opts.output) {fs.mkdirSync(path.dirname(path.resolve(opts.output)),{recursive:true});fs.writeFileSync(opts.output,report+'\n');}
     else console.log(opts.format==='text'?(findings.length?chalk.yellow(report):chalk.green(report)):report);
     process.exitCode=opts.failOn==='warning'?Number(findings.length>0):opts.failOn==='error'?Number(findings.some(f=>f.severity==='error')):0;
   }catch(e){console.error(`Error: ${e.message}`);process.exitCode=2;}
 });
program.parse();
