import test from 'node:test';
import assert from 'node:assert/strict';
import { addKeyframe, changeShotWorld, cloneShot, compilePrompt, describeMotion, frameTime, interpolatePose, makeProject, makeShot, parseProject, readImage, removeKeyframe, removeShot, reorderShot } from '../src/lib/project.ts';

test('portable projects preserve every staging decision on round trip', () => {
  const project = makeProject();
  project.shots[0].props[0].role = 'A delivery rover';
  project.shots[0].frames[1].poses[project.shots[0].props[0].id].x = 1.2;
  assert.deepEqual(parseProject(JSON.stringify(project)), project);
});

test('invalid coordinates and missing frame poses are rejected before reaching the stage', () => {
  const project = makeProject();
  const shot = project.shots[0];
  shot.frames[0].poses[shot.props[0].id].x = 999;
  assert.throws(() => parseProject(JSON.stringify(project)), /invalid object positions/);
  delete shot.frames[0].poses[shot.props[0].id];
  assert.throws(() => parseProject(JSON.stringify(project)), /invalid object positions/);
});

test('project import rejects external and executable image references', () => {
  for (const image of ['https://tracker.invalid/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const project = makeProject();
    project.shots[0].frames[0].image = image;
    assert.throws(() => parseProject(JSON.stringify(project)), /unsupported/);
  }
});

test('project import rejects duplicate ids and broken active-shot references', () => {
  const project = makeProject();
  project.shots.push(structuredClone(project.shots[0]));
  assert.throws(() => parseProject(JSON.stringify(project)), /invalid shot/);
  project.shots.pop(); project.activeShotId = 'missing';
  assert.throws(() => parseProject(JSON.stringify(project)), /missing its active shot/);
});

test('project import rejects coercible arrays in enum and color fields', () => {
  for (const key of ['world', 'camera']) {
    const project = makeProject();
    const shot = project.shots[0] as unknown as Record<string, unknown>;
    shot[key] = [shot[key]];
    assert.throws(() => parseProject(JSON.stringify(project)), /invalid shot/);
  }
  for (const key of ['kind', 'color']) {
    const project = makeProject();
    const prop = project.shots[0].props[0] as unknown as Record<string, unknown>;
    prop[key] = [prop[key]];
    assert.throws(() => parseProject(JSON.stringify(project)), /invalid prop/);
  }
});

test('stage interpolation passes through all three authored poses', () => {
  const shot = makeProject().shots[0]; const id = shot.props[0].id;
  for (const [i, t] of [0, .5, 1].entries()) {
    const actual = interpolatePose(shot, id, t); const expected = shot.frames[i].poses[id];
    for (const key of ['x', 'z', 'rotation'] as const) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-9);
  }
  const midway = interpolatePose(shot, id, .25);
  assert.ok(midway.x > shot.frames[0].poses[id].x && midway.x < shot.frames[1].poses[id].x);
});

test('render direction includes world, cast, camera move, and camera-relative motion in plain words', () => {
  const shot = makeProject().shots[0]; shot.world = 'lunar';
  const prompt = compilePrompt(shot);
  assert.match(prompt, /lunar outpost/); assert.match(prompt, /vintage red getaway car/);
  assert.match(prompt, /pushes in/);
  assert.match(prompt, /The vintage red getaway car moves from left to right/);
  assert.doesNotMatch(prompt, /x=|z=/, 'coordinates belong to the guide frames, not the text encoder');
  const car = shot.props[0].id;
  shot.frames[2].poses[car] = {...shot.frames[0].poses[car], z: shot.frames[0].poses[car].z - 3};
  assert.match(describeMotion(shot), /away from the camera/);
  for (const frame of shot.frames) frame.poses = structuredClone(shot.frames[0].poses);
  assert.equal(describeMotion(shot), 'Every object holds its position.');
  shot.camera = 'overhead'; shot.frames[2].poses[car] = {...shot.frames[0].poses[car], x: shot.frames[0].poses[car].x - 3};
  assert.match(describeMotion(shot), /from right to left/);
});

test('camera moves survive import, older projects keep a locked camera, and unknown moves are rejected', () => {
  const project = makeProject();
  project.shots[0].cameraMove = 'orbit-left';
  assert.equal(parseProject(JSON.stringify(project)).shots[0].cameraMove, 'orbit-left');
  const older = JSON.parse(JSON.stringify(project)); delete older.shots[0].cameraMove;
  assert.equal(parseProject(JSON.stringify(older)).shots[0].cameraMove, 'static');
  older.shots[0].cameraMove = 'barrel-roll';
  assert.throws(() => parseProject(JSON.stringify(older)), /unknown camera move/);
  assert.equal(cloneShot(project.shots[0]).cameraMove, 'orbit-left');
});

test('early v1 imports acquire an ID and unknown fields do not enter the project schema', () => {
  const original = makeProject();
  const legacy = JSON.parse(JSON.stringify(original));
  delete legacy.id;
  legacy.injected = { secret: true };
  legacy.shots[0].props[0].unrecognized = 'discard';
  legacy.shots[0].frames[0].poses.unknown = { x: 0, z: 0, rotation: 0 };
  const restored = parseProject(JSON.stringify(legacy));
  assert.match(restored.id, /^[0-9a-f-]{36}$/);
  assert.equal('injected' in restored, false);
  assert.equal('unrecognized' in restored.shots[0].props[0], false);
  assert.equal('unknown' in restored.shots[0].frames[0].poses, false);
  assert.equal(parseProject(JSON.stringify(restored)).id, restored.id);
});

test('duplicate keyframe IDs, empty IDs, fractional seeds and invalid durations are rejected', () => {
  const duplicate = makeProject();
  duplicate.shots[0].frames[1].id = duplicate.shots[0].frames[0].id;
  assert.throws(() => parseProject(JSON.stringify(duplicate)), /invalid keyframe/);
  const blank = makeProject(); blank.shots[0].id = '   ';
  assert.throws(() => parseProject(JSON.stringify(blank)), /invalid shot/);
  for (const seed of [1.5, -1, 2147483648]) {
    const project = makeProject(); project.shots[0].seed = seed;
    assert.throws(() => parseProject(JSON.stringify(project)), /invalid shot/);
  }
  for (const duration of [0, 2.5, 13]) {
    const project = makeProject(); project.shots[0].duration = duration;
    assert.throws(() => parseProject(JSON.stringify(project)), /invalid shot/);
  }
});

test('each world supplies matching direction and untouched defaults follow world changes', () => {
  for (const world of ['lunar', 'noir'] as const) {
    const shot = makeShot('Scene', world);
    assert.doesNotMatch(shot.prompt, /canyon/);
    assert.doesNotMatch(shot.props.map(prop => prop.role).join(' '), /sandstone|canyon/);
    assert.match(shot.prompt, world === 'lunar' ? /lunar/ : /city/);
  }
  const shot = makeShot();
  shot.props[0].role = 'My customized emergency vehicle';
  shot.note = 'A story I wrote';
  const lunar = changeShotWorld(shot, 'lunar');
  assert.match(lunar.prompt, /lunar/);
  assert.equal(lunar.props[0].role, shot.props[0].role);
  assert.match(lunar.props[1].role, /lunar/);
  assert.equal(lunar.note, shot.note);
  assert.equal(shot.world, 'desert');
  lunar.prompt = 'Do a barrel roll.';
  const noir = changeShotWorld(lunar, 'noir');
  assert.equal(noir.prompt, lunar.prompt);
  assert.match(noir.props[1].role, /building/);
  const earlyShot = makeShot(); earlyShot.world = 'lunar';
  assert.match(changeShotWorld(earlyShot, 'noir').prompt, /city/);
});

test('cloning a shot remaps every staging identifier and isolates later changes', () => {
  const original = makeShot();
  original.frames[0].image = 'data:image/jpeg;base64,AQID';
  const snapshot = structuredClone(original);
  const copy = cloneShot(original);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, `${original.name} copy`);
  assert.equal(copy.frames[0].image, original.frames[0].image);
  for (const [i, prop] of copy.props.entries()) {
    assert.notEqual(prop.id, original.props[i].id);
    for (const [j, frame] of copy.frames.entries()) {
      assert.notEqual(frame.id, original.frames[j].id);
      assert.deepEqual(frame.poses[prop.id], original.frames[j].poses[original.props[i].id]);
      assert.equal(original.props[i].id in frame.poses, false);
    }
  }
  copy.props[0].name = 'Changed'; copy.frames[0].poses[copy.props[0].id].x = 4;
  assert.deepEqual(original, snapshot);
});

test('scene removal keeps at least one shot and selects the nearest remaining scene', () => {
  const project = makeProject();
  assert.equal(removeShot(project, project.activeShotId), project);
  const second = makeShot('Second'); const third = makeShot('Third');
  project.shots.push(second, third); project.activeShotId = second.id;
  const removed = removeShot(project, second.id);
  assert.equal(removed.activeShotId, third.id);
  assert.equal(removed.shots.length, 2);
  assert.equal(project.shots.length, 3);
  assert.equal(removeShot(removed, third.id).activeShotId, project.shots[0].id);
  assert.equal(removeShot(project, 'missing'), project);
});

test('scene ordering moves only one position without changing the active shot', () => {
  const project = makeProject(); const second = makeShot('Second');
  project.shots.push(second);
  assert.equal(reorderShot(project, project.shots[0].id, -1), project);
  const moved = reorderShot(project, second.id, -1);
  assert.deepEqual(moved.shots.map(shot => shot.id), [second.id, project.shots[0].id]);
  assert.equal(moved.activeShotId, project.activeShotId);
  assert.notEqual(moved.shots, project.shots);
  assert.equal(reorderShot(project, 'missing', 1), project);
});

test('film edits round trip while invalid clip ranges and duplicate clip IDs are rejected', () => {
  const project = makeProject();
  project.edit = { clips: [{ id: 'clip-1', jobId: 'job-1', outputIndex: 0, inPoint: .25, outPoint: 2.5 }, { id: 'clip-2', jobId: 'job-2', outputIndex: 2, inPoint: 0 }] };
  assert.deepEqual(parseProject(JSON.stringify(project)).edit, project.edit);
  for (const bad of [{ inPoint: -1 }, { outPoint: .2 }, { outputIndex: .5 }, { jobId: '' }, { outPoint: 3601 }]) {
    const invalid = structuredClone(project);
    Object.assign(invalid.edit!.clips[0], bad);
    assert.throws(() => parseProject(JSON.stringify(invalid)), /invalid film clip/);
  }
  project.edit.clips[1].id = 'clip-1';
  assert.throws(() => parseProject(JSON.stringify(project)), /invalid film clip/);
});

test('interpolation clamps out-of-range playback positions to valid poses', () => {
  const shot = makeShot(); const id = shot.props[0].id;
  assert.deepEqual(interpolatePose(shot, id, -1), shot.frames[0].poses[id]);
  assert.deepEqual(interpolatePose(shot, id, Infinity), shot.frames[0].poses[id]);
  const final = interpolatePose(shot, id, 2);
  for (const key of ['x', 'z', 'rotation'] as const) assert.ok(Math.abs(final[key] - shot.frames[2].poses[id][key]) < 1e-9);
});

test('image decoding failure is actionable and image bitmaps close when canvas preparation fails', async () => {
  const originalDecode = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let closed = 0;
  try {
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: async () => { throw new Error('Decoder failed'); } });
    await assert.rejects(readImage(new File(['bad'], 'broken.jpg', { type: 'image/jpeg' })), /could not be opened/);
    Object.defineProperty(globalThis, 'createImageBitmap', { configurable: true, writable: true, value: async () => ({ width: 1200, height: 600, close: () => { closed++; } }) });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
    await assert.rejects(readImage(new File(['image'], 'photo.png', { type: 'image/png' })), /could not prepare/);
    assert.equal(closed, 1);
  } finally {
    if (originalDecode) Object.defineProperty(globalThis, 'createImageBitmap', originalDecode); else Reflect.deleteProperty(globalThis, 'createImageBitmap');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a shot holds three to eight evenly spaced keyframes, and the stage moves through every one', () => {
  let shot = makeShot();
  const lead = shot.props[0].id;
  shot = addKeyframe(shot, 0);
  assert.equal(shot.frames.length, 4);
  assert.equal(shot.frames[1].label, 'In between');
  assert.deepEqual(shot.frames[1].poses, shot.frames[0].poses, 'a new keyframe starts from the one before it');
  assert.notEqual(shot.frames[1].poses, shot.frames[0].poses);
  shot.frames[1].poses[lead] = {x: 1, z: 1, rotation: 0};
  assert.equal(frameTime(shot, 1), 1 / 3);
  assert.deepEqual(interpolatePose(shot, lead, 1 / 3), {x: 1, z: 1, rotation: 0});
  const end = interpolatePose(shot, lead, 1), last = shot.frames[3].poses[lead];
  assert.ok(Math.abs(end.x - last.x) + Math.abs(end.z - last.z) < 1e-9, 'the shot ends on its last keyframe');
  for (let index = 0; index < 6; index++) shot = addKeyframe(shot, shot.frames.length - 1);
  assert.equal(shot.frames.length, 8, 'no more than eight keyframes');
  const project = makeProject(); project.shots[0] = shot; project.activeShotId = shot.id;
  assert.equal(parseProject(JSON.stringify(project)).shots[0].frames.length, 8);
  project.shots[0] = {...shot, frames: [...shot.frames, {...shot.frames[0], id: 'ninth'}]};
  assert.throws(() => parseProject(JSON.stringify(project)), /invalid shot/);
  let small = makeShot();
  small = removeKeyframe(small, 1);
  assert.equal(small.frames.length, 3, 'a shot keeps at least three keyframes');
  assert.equal(removeKeyframe(addKeyframe(small, 1), 2).frames.map(frame => frame.id).join(), small.frames.map(frame => frame.id).join());
});
