import test from 'node:test';
import assert from 'node:assert/strict';
import { directorDares, makeDareShot } from '../src/lib/director-dares.ts';
import { makeProject, parseProject } from '../src/lib/project.ts';

test('every dare creates a portable independent take without changing the original or its photos', () => {
  const project = makeProject();
  const source = project.shots[0];
  source.frames[0].image = 'data:image/png;base64,aW1hZ2U=';
  const before = structuredClone(source);
  for (const dare of directorDares) {
    const take = makeDareShot(source, dare.id);
    const portable = parseProject(JSON.stringify({...project, shots: [take], activeShotId: take.id}));
    assert.deepEqual(portable.shots[0], take);
    assert.notEqual(take.id, source.id);
    assert.ok(take.props.every(prop => !source.props.some(original => original.id === prop.id)));
    assert.ok(take.frames.every(frame => !frame.image && !source.frames.some(original => original.id === frame.id)));
    take.frames[0].poses[take.props[0].id].x = 4;
    assert.deepEqual(source, before);
  }
});

test('the scenery dare keeps the lead fixed and makes every background prop travel', () => {
  const take = makeDareShot(makeProject().shots[0], 'scenery-leads');
  const lead = take.props[0].id;
  for (const frame of take.frames) assert.deepEqual(frame.poses[lead], take.frames[0].poses[lead]);
  for (const prop of take.props.slice(1)) assert.notDeepEqual(take.frames[0].poses[prop.id], take.frames[2].poses[prop.id]);
  assert.equal(take.camera, 'wide');
});

test('the scale dare makes its hierarchy visible through geometry and a low camera', () => {
  const take = makeDareShot(makeProject().shots[0], 'scale-swap');
  assert.equal(take.camera, 'low');
  assert.ok(take.props.slice(1).every(prop => take.props[0].scale / prop.scale > 4));
  assert.match(take.props[0].role, /enormous/);
});

test('the loop dare closes every pose and creates a middle detour even from a static scene', () => {
  const source = makeProject().shots[0];
  source.frames.forEach(frame => { frame.poses = structuredClone(source.frames[0].poses); });
  const take = makeDareShot(source, 'close-loop');
  assert.deepEqual(take.frames[0].poses, take.frames[2].poses);
  assert.notDeepEqual(take.frames[1].poses[take.props[0].id], take.frames[0].poses[take.props[0].id]);
  take.frames[2].poses[take.props[0].id].x = 5;
  assert.notEqual(take.frames[0].poses[take.props[0].id].x, 5, 'loop endpoints remain independently editable');
});

test('dares respect imported text/pose limits and require scenery for relational transformations', () => {
  const project = makeProject();
  const source = project.shots[0];
  source.name = 'x'.repeat(200); source.prompt = 'x'.repeat(4000);
  source.props.forEach(prop => {prop.role = 'x'.repeat(500);});
  source.frames.forEach(frame => Object.values(frame.poses).forEach(pose => {pose.x = 6; pose.z = 4;}));
  for (const dare of directorDares) {
    const take = makeDareShot(source, dare.id);
    assert.doesNotThrow(() => parseProject(JSON.stringify({...project, shots: [take], activeShotId: take.id})));
    assert.ok(take.prompt.startsWith("DIRECTOR'S DARE:"));
  }
  source.props = [source.props[0]];
  assert.throws(() => makeDareShot(source, 'scenery-leads'), /second prop/);
  assert.throws(() => makeDareShot(source, 'scale-swap'), /second prop/);
  assert.doesNotThrow(() => makeDareShot(source, 'close-loop'));
});
