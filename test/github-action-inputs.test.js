import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInputs } from '../github-action/inputs.mjs';
test('action defaults', () => assert.deepEqual(validateInputs(), {postgresVersion:'16',failOn:'error',advisor:true,preset:'recommended',mode:'changed'}));
test('action explicit options', () => assert.deepEqual(validateInputs({'postgres-version':'18','fail-on':'warning',advisor:'false',preset:'strict',mode:'all'}), {postgresVersion:'18',failOn:'warning',advisor:false,preset:'strict',mode:'all'}));
for (const raw of [{'postgres-version':'9'},{'postgres-version':'016'},{'postgres-version':'16; echo bad'},{'postgres-version':16},{'fail-on':'ERROR'},{advisor:'yes'},{advisor:true},{preset:'custom'},{mode:'../'},{extra:'value'},{mode:''},{'fail-on':'none\n'}]) {
  test(`reject action input ${JSON.stringify(raw)}`, () => assert.throws(() => validateInputs(raw)));
}
test('action result immutable', () => assert.ok(Object.isFrozen(validateInputs())));
