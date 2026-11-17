
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function verifySarif(filePath) {
  if (!filePath) {
    throw new Error('Usage: node test/verify-sarif.cjs <report.sarif>');
  }

  const absolutePath = path.resolve(filePath);
  const report = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

  if (report.version !== '2.1.0') {
    throw new Error('Expected SARIF version 2.1.0');
  }

  if (!Array.isArray(report.runs) || report.runs.length === 0) {
    throw new Error('SARIF must contain at least one run');
  }

  for (const run of report.runs) {
    if (!Array.isArray(run.results)) {
      throw new Error('SARIF run must contain a results array');
    }

    for (const result of run.results) {
      if (!result.ruleId || !result.message?.text) {
        throw new Error('SARIF finding is missing ruleId or message');
      }

      if (!result.locations?.[0]?.physicalLocation?.artifactLocation?.uri) {
        throw new Error('SARIF finding is missing a source location');
      }
    }
  }

  console.log('SARIF structural verification passed.');
}

if (require.main === module) {
  const filePath = process.argv[2];

  if (!filePath) {
    // node --test discovers .cjs files in the test directory.
    // Run a small self-test when no CLI argument is provided.
    const os = require('node:os');
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pg-safe-sarif-')
    );

    try {
      const reportPath = path.join(tempDir, 'report.sarif');

      fs.writeFileSync(reportPath, JSON.stringify({
        version: '2.1.0',
        runs: [{
          tool: { driver: { name: 'pg-safe-migrate' } },
          results: [{
            ruleId: 'PG001',
            message: { text: 'Test migration risk' },
            locations: [{
              physicalLocation: {
                artifactLocation: { uri: 'unsafe.sql' },
                region: { startLine: 1 }
              }
            }]
          }]
        }]
      }));

      verifySarif(reportPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } else {
    verifySarif(filePath);
  }
}

module.exports = { verifySarif };
