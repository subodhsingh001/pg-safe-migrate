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
import { suppressionReport, suppressionText, suppressionMarkdown } from '../src/suppression-report.js';
import { toJson, toSarif, toMarkdownReport } from '../src/reports.js';
import { inspectDatabaseUrl } from '../src/db-inspect.js';
import { simulateSqlFile } from '../src/simulator.js';
import { combinedAssessment } from '../src/combined.js';
import { loadTeamPolicy, assessTeamPolicy, assessLintPolicy, validateGateConfig, applySuppressionPolicy, enforceSuppressionAudit } from '../src/team-policy.js';
import { loadProductionContext, productionAssessment } from '../src/production-context.js';
import { createRiskBaseline, loadRiskBaseline, compareRiskBaseline, writeRiskBaseline } from '../src/risk-baseline.js';

program.name('pgsafe').description('AST-based PostgreSQL migration risk linter (not a downtime guarantee)').version(version)
 .argument('[target]', 'SQL file or migrations directory')
 .option('-c, --changed [baseBranch]', 'Lint changed SQL files')
 .option('--format <format>', 'text, json, sarif or markdown', 'text')
 .option('--output <file>', 'Write report to file')
 .option('--config <file>', 'JSON configuration file', 'pg-safe-migrate.config.json')
 .option('--postgres-version <version>', 'Target PostgreSQL major version')
 .option('--fail-on <severity>', 'warning, error or none', 'error')
 .option('--advisor', 'Include deployment guidance')
 .option('--preset <name>', 'recommended or strict', 'recommended')
 .option('--github', 'Emit GitHub workflow annotations')
 .option('--summary <file>', 'Write Markdown PR summary')
 .option('--risk', 'Include heuristic risk score in text output')
 .option('--production-context <file>', 'Optional read-only JSON production estimates for advisory output')
 .option('--assess', 'Combine static linting with disposable PostgreSQL simulation')
 .option('--verify-sql <file>', 'Run post-migration SQL assertions (SQL errors or exceptions fail verification)')
 .option('--team-policy <file>', 'Local JSON team policy for combined assessment')
 .option('--gate-policy <file>', 'Opt-in static CI gate policy (JSON); blocks matching risks')
 .option('--write-risk-baseline <file>', 'Write baseline of current static findings (review before committing)')
 .option('--risk-baseline <file>', 'Compare findings with a previously reviewed baseline')
 .option('--simulate <sqlFile>', 'Execute one SQL file against a disposable Docker PostgreSQL container')
 .option('--baseline <sqlFile>', 'Apply baseline SQL before simulation')
 .option('--migrations-dir <directory>', 'Simulate top-level SQL migrations in filename order')
 .option('--simulate-timeout <seconds>', 'Simulation execution timeout (10-300 seconds)', '60')
 .option('--inspect-db', 'Inspect database catalog (requires DATABASE_URL and optional pg dependency)')
 .action(async (target,opts)=>{
   try {
     if (!['text','json','sarif','markdown'].includes(opts.format)) throw new Error('format must be text, json, sarif or markdown');
     if (!['none','warning','error'].includes(opts.failOn)) throw new Error('fail-on must be none, warning or error');
     const preset = getPreset(opts.preset);
     const userConfig = loadConfig(opts.config);
     const config = { ...preset, ...userConfig, rules: { ...preset.rules, ...userConfig.rules } };
     if(opts.postgresVersion!==undefined) {
       const version=Number(opts.postgresVersion);
       if (!Number.isInteger(version)||version<10||version>99) throw new Error('postgres-version must be an integer >= 10');
       config.postgresVersion=version;
     }
     if ((opts.gatePolicy || opts.riskBaseline || opts.writeRiskBaseline || opts.productionContext) && (opts.assess || opts.simulate || opts.migrationsDir || opts.inspectDb)) throw new Error('--gate-policy is for static lint mode only');
     if (config.suppression?.enabled && (opts.assess || opts.teamPolicy || ((opts.riskBaseline || opts.writeRiskBaseline) && opts.gatePolicy))) throw new Error('Inline suppression is not supported with combined assessment or gate plus risk baseline');
     if (opts.assess) {
       const policy = opts.teamPolicy ? loadTeamPolicy(opts.teamPolicy) : null;
       validateGateConfig(config, policy);
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
     const gatePolicy = opts.gatePolicy ? loadTeamPolicy(opts.gatePolicy) : null;
     validateGateConfig(config, gatePolicy);
     if (gatePolicy?.requireSimulation) throw new Error('requireSimulation requires --assess with a disposable PostgreSQL simulation');
     const files=(opts.changed?getChangedSqlFiles(typeof opts.changed==='string'?opts.changed:undefined):findMigrationFiles(target)).filter(f=>!isExcluded(f,config.exclude));
     const entries=files.map(file=>({file:path.relative(process.cwd(),file)||file,sql:fs.readFileSync(file,'utf8')}));
     const suppressionAudit = [];
     const findings=await analyzeFiles(entries,applySuppressionPolicy(config, gatePolicy),{advisor:opts.advisor,suppressionAudit});
     const suppression = config.suppression?.enabled ? suppressionReport(suppressionAudit) : undefined;
     const allFindings = [...findings, ...suppressionAudit.filter(r => r.status === 'suppressed').map(r => r.finding)];
     const production = opts.productionContext ? productionAssessment(allFindings, loadProductionContext(opts.productionContext)) : null;
     if (opts.writeRiskBaseline && opts.riskBaseline) throw new Error('Cannot combine --write-risk-baseline and --risk-baseline');
     if (opts.writeRiskBaseline && opts.gatePolicy) throw new Error('Baseline creation cannot be combined with a gate policy');
     const baselineComparison = opts.riskBaseline ? compareRiskBaseline(allFindings, entries, loadRiskBaseline(opts.riskBaseline)) : null;
     // In baseline mode, only newly introduced findings are subject to the opt-in gate.
     const gateFindings = baselineComparison ? baselineComparison.newFindings : findings;
     const gate = opts.gatePolicy ? enforceSuppressionAudit(assessLintPolicy(suppression ? allFindings : gateFindings, gatePolicy, summarizeRisk(suppression ? allFindings : gateFindings)), gatePolicy, suppression) : null;
     if (opts.writeRiskBaseline) writeRiskBaseline(opts.writeRiskBaseline, createRiskBaseline(allFindings, entries));
     if (opts.github) process.stdout.write(toGitHubAnnotations(findings));
     if (opts.summary) {fs.mkdirSync(path.dirname(path.resolve(opts.summary)),{recursive:true});fs.writeFileSync(opts.summary,toMarkdownSummary(findings,files.length) + (suppression ? suppressionMarkdown(suppression) : ''));}
     const report=opts.format==='json'?toJson(findings,{filesChecked:files.length,postgresVersion:config.postgresVersion,...(suppression ? { suppression } : {})}):opts.format==='sarif'?toSarif(findings,suppression):opts.format==='markdown'?toMarkdownReport(findings,{filesChecked:files.length,postgresVersion:config.postgresVersion,risk:opts.risk?summarizeRisk(allFindings):undefined,suppression}):[
       ...findings.flatMap(f=>[`${f.file}:${f.line}:${f.column} [${f.ruleId}] ${f.severity}: ${f.message}`,`  Fix: ${f.fix}`,...(f.advisor?f.advisor.steps.map((s,i)=>`  ${i+1}. ${s}`):[])]),
       ...(opts.risk?[`Risk: ${JSON.stringify(summarizeRisk(allFindings))}`]:[]),
       ...(suppression ? [suppressionText(suppression)] : []),
       `Checked ${files.length} SQL file(s); found ${findings.length} configured risk(s). No downtime guarantee.`
     ].join('\n');
     const gateReport = opts.format === 'json' && (gate || baselineComparison || production) ? JSON.stringify({ ...JSON.parse(report), ...(baselineComparison ? { baseline: { newCount: baselineComparison.newCount, existingCount: baselineComparison.existingCount, resolvedCount: baselineComparison.resolvedCount, newFindings: baselineComparison.newFindings } } : {}), ...(production ? { production } : {}), ...(gate ? { gate: { name: gate.name, decision: gate.passed ? 'PASS' : 'BLOCK', passed: gate.passed, reasons: gate.reasons, note: gate.note } } : {}) }, null, 2) : report;
     if(opts.output) {fs.mkdirSync(path.dirname(path.resolve(opts.output)),{recursive:true});fs.writeFileSync(opts.output,gateReport+'\n');}
     else console.log(opts.format==='text'?(findings.length?chalk.yellow(gateReport):chalk.green(gateReport)):gateReport);
     if (production && opts.format !== 'json') console.error(`[PG Safe Migrate production] Advisory context evaluated for ${production.assessments.length} finding(s). Use --format json for details. No downtime guarantee.`);
     if (baselineComparison && opts.format !== 'json') console.error(`[PG Safe Migrate baseline] ${baselineComparison.newCount} new, ${baselineComparison.existingCount} existing, ${baselineComparison.resolvedCount} resolved finding(s).`);
     if (opts.writeRiskBaseline) console.error(`[PG Safe Migrate baseline] Wrote ${allFindings.length} finding fingerprint(s) to ${opts.writeRiskBaseline}; review before committing.`);
     if (gate) console.error(`[PG Safe Migrate gate] ${gate.passed ? 'PASS' : 'BLOCK'} (${gate.name})${gate.reasons.length ? ': '+gate.reasons.join('; ') : ''}. ${gate.note}`);
     process.exitCode=(gate && !gate.passed) || (opts.failOn==='warning' && gateFindings.length>0) || (opts.failOn==='error' && gateFindings.some(f=>f.severity==='error')) ? 1 : 0;
   }catch(e){console.error(`Error: ${e.message}`);process.exitCode=2;}
 });
if (process.argv[2] === 'generate') {
 const { Command } = await import('commander');
 const { planStatements, renderPlan } = await import('../src/generator.js');
 const { parseSqlFile } = await import('../src/parser.js');
 const generator = new Command().name('pgsafe generate').argument('<file>').option('--format <format>', 'text, markdown or json', 'text').option('--output <file>', 'Create a new report file; never overwrite').action(async (file, opts) => {
  try {
   const stat = fs.statSync(file);
   if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Expected a SQL file of at most 2 MiB');
   const sql = fs.readFileSync(file, 'utf8');
   if (Buffer.byteLength(sql) > 2 * 1024 * 1024) throw new Error('SQL exceeds 2 MiB');
   const parsed = await parseSqlFile(sql, {details:true});
   if (!parsed.length || parsed.length > 500) throw new Error('Expected 1–500 SQL statements');
   const report = renderPlan(planStatements(parsed), opts.format);
   if (opts.output) fs.writeFileSync(opts.output, report+'\n', {flag:'wx'});
   else console.log(report);
  } catch(e) { console.error(`Error: ${e.message}`); process.exitCode=2; }
 });
 await generator.parseAsync(process.argv.slice(3), {from:'user'});
} else program.parse();
