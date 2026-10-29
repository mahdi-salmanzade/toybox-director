import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrompt, makeShot, parseProject, makeProject } from '../src/lib/project.ts';
import { keyframeLooks, restyleInstruction } from '../src/lib/restyle.ts';
import { editSource, guideSource } from '../src/lib/studio-controls.ts';

test('every keyframe becomes real, and a reveal keeps a toy opening with a free middle', () => {
  const shot = makeShot();
  assert.deepEqual(keyframeLooks(shot), ['real', 'real', 'real']);
  shot.reveal = true;
  assert.deepEqual(keyframeLooks(shot), ['toy', null, 'real']);
});

test('restyle instructions keep the composition and name the real cast, world, and toys', () => {
  const shot = makeShot();
  const real = restyleInstruction(shot, 'real');
  assert.match(real, /^Make this image photorealistic/);
  assert.match(real, /Change nothing else/);
  assert.match(real, /the car is a real vintage red getaway car/);
  assert.match(real, /the tall column is a real monumental sandstone tower/);
  assert.match(real, /desert canyon at golden hour/);
  assert.ok(real.length < 600, 'short instructions keep the staged layout');
  assert.doesNotMatch(real, /image 2/);
  const toy = restyleInstruction(shot, 'toy');
  assert.match(toy, /the car is a small die-cast toy car, the tall column is a ceramic coffee mug/);
  assert.doesNotMatch(toy, /canyon/);
});

test('a reveal holds the toy opening through the middle, ends real, and tells the video model', () => {
  const shot = makeShot(); shot.reveal = true;
  assert.deepEqual(guideSource(shot, .5), {kind: 'skip'}, 'without a toy photo the middle stays free');
  shot.frames[0].image = 'data:image/jpeg;base64,AAAA';
  assert.deepEqual(guideSource(shot, .5), {kind: 'photo', image: shot.frames[0].image}, 'the toy holds through the middle');
  assert.deepEqual(guideSource(shot, 1), {kind: 'stage', frameIndex: 2, time: 1});
  shot.frames[2].image = 'data:image/jpeg;base64,BBBB';
  assert.deepEqual(guideSource(shot, 1), {kind: 'photo', image: shot.frames[2].image});
  assert.match(compilePrompt(shot), /tabletop becomes the real world/);
  assert.doesNotMatch(compilePrompt(makeShot()), /Transformation/);
});

test('reveal survives import and older projects open without it', () => {
  const project = makeProject(); project.shots[0].reveal = true;
  assert.equal(parseProject(JSON.stringify(project)).shots[0].reveal, true);
  const older = JSON.parse(JSON.stringify(project)); delete older.shots[0].reveal;
  assert.equal(parseProject(JSON.stringify(older)).shots[0].reveal, false);
  older.shots[0].reveal = 'yes';
  assert.throws(() => parseProject(JSON.stringify(older)), /reveal/);
});

test('real keyframes restyle together as one strip that splits back into exact panels', async () => {
  const { panelBounds } = await import('../src/lib/triptych.ts');
  const shot = makeShot();
  const strip = restyleInstruction(shot, 'real', 3);
  assert.match(strip, /These are 3 frames from the same film shot, side by side/);
  assert.match(strip, /same size and faces the same direction/);
  assert.match(strip, /Each frame contains exactly one car and exactly 2 tall columns: never add or duplicate an object/);
  assert.doesNotMatch(restyleInstruction(shot, 'real'), /side by side/);
  assert.deepEqual(panelBounds(2240, 3), [{x: 0, width: 747}, {x: 747, width: 746}, {x: 1493, width: 747}]);
  assert.equal(panelBounds(2240, 3).reduce((sum, panel) => sum + panel.width, 0), 2240);
  assert.deepEqual(panelBounds(1280, 1), [{x: 0, width: 1280}]);
});

test('a keyframe edit starts from this keyframe, the one before it, or the previous scene', () => {
  const first = makeShot(), second = makeShot(), shots = [first, second];
  assert.deepEqual(editSource(shots, second.id, 1, 'this'), {shot: second, index: 1});
  assert.deepEqual(editSource(shots, second.id, 1, 'previous'), {shot: second, index: 0});
  assert.deepEqual(editSource(shots, second.id, 0, 'previous'), {shot: first, index: 2}, 'a scene continues from the last one');
  assert.equal(editSource(shots, first.id, 0, 'previous'), null);
  assert.equal(editSource(shots, 'missing', 0, 'this'), null);
});

test('photo keyframes are directed by the prompt and camera alone', () => {
  const shot = makeShot(); shot.prompt = 'The toy becomes a real car in a tunnel.'; shot.cameraMove = 'push-in';
  shot.frames.forEach((frame, index) => { frame.image = `data:image/jpeg;base64,${'ABC'[index]}AAA`; });
  assert.equal(compilePrompt(shot), 'The toy becomes a real car in a tunnel.\nCamera: The camera slowly pushes in toward the action.');
  shot.frames[1].image = undefined;
  assert.match(compilePrompt(shot), /World: /, 'a staged keyframe still needs the world and cast');
});

test('many keyframes restyle in even strips of up to four', async () => {
  const { stripGroups } = await import('../src/lib/triptych.ts');
  assert.deepEqual(stripGroups([0, 1, 2]), [[0, 1, 2]]);
  assert.deepEqual(stripGroups([0, 1, 2, 3, 4]), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(stripGroups([1, 2, 3, 4, 5, 6, 7]), [[1, 2, 3, 4], [5, 6, 7]]);
});
