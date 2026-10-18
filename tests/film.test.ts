import test from 'node:test';
import assert from 'node:assert/strict';
import { clipSeconds, clipTrimProblem, completedVideoTakes, createClipBoundary, takesForProject } from '../src/lib/film.ts';
import type { MovieClip } from '../src/lib/project.ts';
import type { StudioJob } from '../src/lib/render.ts';

const job = (id: string, projectId: string, createdAt = 1): StudioJob => ({id, projectId, createdAt, status: 'completed', outputs: [{url: `/api/outputs/${id}/0.mp4`, type: 'video', duration: 3}]});
const clip: MovieClip = {id: 'clip', jobId: 'take-a', outputIndex: 0, inPoint: .5, outPoint: 2.5};

test('existing clips resolve across project boundaries while add/assembly choices stay scoped', () => {
  const jobs = [job('take-a', 'original'), job('take-b', 'imported', 2), {...job('failed', 'imported'), status: 'failed' as const}];
  const takes = completedVideoTakes(jobs);
  assert.equal(takes.find(take => take.job.id === clip.jobId)?.duration, 3);
  assert.deepEqual(takesForProject(takes, 'imported').map(take => take.job.id), ['take-b']);
  assert.deepEqual(takes.map(take => take.job.id), ['take-b', 'take-a']);
  assert.equal(jobs[0].id, 'take-a', 'sorting must not mutate the render library');
});

test('duration calculations honor trims and match the server end tolerance', () => {
  assert.equal(clipSeconds(clip, 3), 2);
  assert.equal(clipSeconds({...clip, outPoint: undefined}, 3), 2.5);
  assert.equal(clipSeconds({...clip, outPoint: 3.02}, 3), 2.5);
  assert.equal(clipTrimProblem({...clip, outPoint: 3.02}, 3), null);
  assert.match(clipTrimProblem({...clip, outPoint: 3.1}, 3)!, /fit inside/);
  assert.match(clipTrimProblem({...clip, inPoint: 3, outPoint: 4}, 3)!, /fit inside/);
  assert.match(clipTrimProblem({...clip, outPoint: .52}, 3)!, /one frame/);
  assert.equal(clipTrimProblem({...clip, outPoint: .5 + 1/24}, 3), null);
  assert.equal(clipTrimProblem({...clip, outPoint: undefined}), null, 'unknown metadata is left to the server probe');
});

test('timeupdate and ended advance a clip only once, including after native replay', () => {
  const boundary = createClipBoundary();
  boundary.start('first');
  assert.equal(boundary.finish('first'), true);
  assert.equal(boundary.finish('first'), false);
  boundary.start('second');
  assert.equal(boundary.finish('first'), false, 'late media events cannot advance the new clip');
  assert.equal(boundary.finish('second'), true);
  boundary.start('second');
  assert.equal(boundary.finish('second'), true, 'replaying the selected clip gets a fresh boundary');
  assert.equal(boundary.finish('second'), false);
});
