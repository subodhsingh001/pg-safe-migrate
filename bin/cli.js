#!/usr/bin/env node
import fs from 'fs';
import { program } from 'commander';
import chalk from 'chalk';
import { parseSqlFile } from '../src/parser.js';
import { lintStatements } from '../src/engine.js';
import { findMigrationFiles } from '../src/detector.js';
import { getChangedSqlFiles } from '../src/gitDiff.js';

program
  .name('pg-safe-migrate')
  .description('Deterministic AST linter for zero-downtime PostgreSQL migrations')
  .version('1.1.2')
  .argument('[target]', 'Path to a .sql file or migrations directory')
  .option('-c, --changed [baseBranch]', 'Lint changed SQL files (optionally compare with a base ref)')
  .action(async (target, options) => {
    try {
      let files = [];

      if (options.changed) {
        const baseBranch = typeof options.changed === 'string' ? options.changed : undefined;
        files = getChangedSqlFiles(baseBranch);
        if (files.length === 0) {
          console.log(chalk.green('✔ No changed .sql files found.'));
          process.exit(0);
        }
      } else {
        files = findMigrationFiles(target);
      }

      let totalIssues = 0;

      for (const file of files) {
        const sql = fs.readFileSync(file, 'utf-8');
        const stmts = await parseSqlFile(sql);
        const issues = lintStatements(stmts);

        if (issues.length > 0) {
          totalIssues += issues.length;
          console.log(chalk.bold.underline(`\nFile: ${file}`));
          for (const issue of issues) {
            console.log(chalk.red(`  ✖ [${issue.ruleId}] ${issue.message}`));
            console.log(chalk.yellow(`    Fix: ${issue.fix}\n`));
          }
        }
      }

      if (totalIssues === 0) {
        console.log(chalk.green(`✔ Checked ${files.length} migration file(s). No configured migration risks detected (not a downtime guarantee).`));
        process.exit(0);
      } else {
        console.log(chalk.red.bold(`Found ${totalIssues} blocking migration issue(s).`));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();
