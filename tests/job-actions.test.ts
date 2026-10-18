import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobActionGate } from '../src/lib/job-actions.ts';

test('a repeated retry reuses the in-flight request after its shelf caller is replaced', async () => {
  const run = createJobActionGate(), response = Promise.withResolvers<void>();
  let submissions = 0;
  const first = run('shot-1', 'retry', async () => { submissions++; await response.promise; });
  await Promise.resolve();
  const fromReopenedShelf = run('shot-1', 'retry', async () => { submissions++; });
  assert.equal(first, fromReopenedShelf);
  assert.equal(submissions, 1);
  response.resolve();
  await Promise.all([first, fromReopenedShelf]);
  await run('shot-1', 'retry', async () => { submissions++; });
  assert.equal(submissions, 2, 'a new explicit retry is allowed once the prior request finishes');
});

test('different jobs proceed independently and a conflicting action is not silently consumed', async () => {
  const run = createJobActionGate(), response = Promise.withResolvers<void>();
  const canceling = run('shot-1', 'cancel', () => response.promise);
  let otherFinished = false, deleted = false;
  await run('shot-2', 'delete', async () => { otherFinished = true; });
  await assert.rejects(run('shot-1', 'delete', async () => { deleted = true; }), /still running/);
  assert.equal(otherFinished, true);
  assert.equal(deleted, false);
  response.resolve();
  await canceling;
  await run('shot-1', 'delete', async () => { deleted = true; });
  assert.equal(deleted, true);
});

test('failed and synchronously throwing requests release the action gate for an explicit retry', async () => {
  const run = createJobActionGate();
  const failed = run('shot-1', 'retry', () => { throw new Error('Network unavailable'); });
  const duplicate = run('shot-1', 'retry', async () => assert.fail('must not submit twice'));
  assert.equal(failed, duplicate);
  await assert.rejects(failed, /Network unavailable/);
  let retried = false;
  await run('shot-1', 'retry', async () => { retried = true; });
  assert.equal(retried, true);
});
