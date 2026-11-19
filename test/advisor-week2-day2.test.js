import test from 'node:test';
import assert from 'node:assert/strict';
import { advise } from '../src/advisor.js';

test('Day 2 recommendations include non-executable SQL examples for selected risks', () => {
  for (const ruleId of ['PG001','PG003','PG004','PG005','PG010','PG012','PG013','PG023','PG024','PG025']) {
    const result = advise({ ruleId });
    assert.equal(result.ruleId, ruleId);
    assert.equal(result.alternative.automatic, false);
    assert.ok(result.alternative.title);
    assert.ok(result.alternative.sql);
    assert.ok(result.alternative.caveat);
    assert.match(result.note, /not validated against a live database/);
  }
});

test('Day 2 recommendations distinguish concurrent index and not-null workflows', () => {
  assert.match(advise({ruleId:'PG001'}).alternative.sql, /CREATE INDEX CONCURRENTLY/);
  assert.match(advise({ruleId:'PG025'}).alternative.sql, /VALIDATE CONSTRAINT/);
  assert.match(advise({ruleId:'PG023'}).alternative.caveat, /not equivalent/i);
});

test('Existing advisor shape and framework context remain compatible', () => {
  assert.ok(advise({ruleId:'PG002'}).steps.length >= 3);
  assert.match(advise({ruleId:'PG015'}, 'prisma').note, /Prisma/);
  assert.equal(advise({ruleId:'PG999'}).alternative, null);
});
