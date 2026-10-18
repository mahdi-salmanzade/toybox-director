import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePrompt, parseProject } from '../src/lib/project.ts';
import type { Project, Shot } from '../src/lib/project.ts';
import { makeStoryProject, storySparks } from '../src/lib/story-sparks.ts';
import type { StorySparkId } from '../src/lib/story-sparks.ts';

const identifiers = (project: Project) => [project.id, ...project.shots.flatMap(shot => [shot.id, ...shot.props.map(prop => prop.id), ...shot.frames.map(frame => frame.id)])];
const changes = (shot: Shot, propId: string) => shot.frames.some(frame => JSON.stringify(frame.poses[propId]) !== JSON.stringify(shot.frames[0].poses[propId]));

test('every authored story is portable, complete, and within render and editor limits', () => {
  assert.equal(storySparks.length, 3);
  assert.equal(new Set(storySparks.map(spark => spark.id)).size, 3);
  for (const spark of storySparks) {
    const project = makeStoryProject(spark.id);
    assert.deepEqual(parseProject(JSON.stringify(project)), project);
    assert.equal(project.name, spark.title);
    assert.equal(project.shots.length, 3);
    assert.equal(project.activeShotId, project.shots[0].id);
    assert.equal(project.shots.reduce((sum, shot) => sum + shot.duration, 0), 9);
    assert.equal(new Set(project.shots.map(shot => shot.name)).size, 3);
    assert.equal(new Set(project.shots.map(shot => shot.camera)).size, 3);
    for (const shot of project.shots) {
      assert.equal(shot.world, spark.world);
      assert.equal(shot.duration, 3);
      assert.equal(shot.frames.length, 3);
      assert.ok(shot.props.length <= 8);
      assert.ok(shot.props.some(prop => changes(shot, prop.id)), `${shot.name} must contain actual staged motion`);
      assert.equal(shot.cameraMove, 'static', 'every authored story asks for a locked camera');
      assert.match(compilePrompt(shot), /The camera stays perfectly still/);
      assert.equal(new Set(shot.frames.map(frame => frame.label)).size, 3);
      for (const frame of shot.frames) {
        assert.deepEqual(Object.keys(frame.poses).sort(), shot.props.map(prop => prop.id).sort());
        for (const pose of Object.values(frame.poses)) {
          assert.ok(Math.abs(pose.x) <= 5.5 && Math.abs(pose.z) <= 3.6, 'every pose must be editable within inspector bounds');
        }
      }
    }
  }
});

test('every project creation owns fresh identifiers and mutable objects at every level', () => {
  const allIds = new Set<string>();
  for (const spark of storySparks) {
    const first = makeStoryProject(spark.id);
    const second = makeStoryProject(spark.id);
    for (const id of [...identifiers(first), ...identifiers(second)]) {
      assert.equal(allIds.has(id), false);
      allIds.add(id);
    }
    const untouched = structuredClone(second);
    first.name = 'My remix';
    first.shots[0].props[0].name = 'New lead';
    first.shots[0].frames[0].poses[first.shots[0].props[0].id].x = 5;
    assert.deepEqual(second, untouched);
    assert.notEqual(first.shots[0].props[0], first.shots[1].props[0]);
    assert.notEqual(first.shots[0].frames[0].poses[first.shots[0].props[0].id], first.shots[0].frames[1].poses[first.shots[0].props[0].id]);
  }
});

test('the city story reverses the usual chase: buildings move and its car never does', () => {
  const project = makeStoryProject('city-crosses-first');
  let parkedPose;
  for (const shot of project.shots) {
    const car = shot.props.find(prop => prop.kind === 'car')!;
    assert.equal(changes(shot, car.id), false);
    parkedPose ??= shot.frames[0].poses[car.id];
    assert.deepEqual(shot.frames[0].poses[car.id], parkedPose);
    assert.ok(shot.props.some(prop => prop.kind === 'mug' && changes(shot, prop.id)));
  }
  const last = project.shots[2];
  const latecomer = last.props.find(prop => prop.name === 'The little latecomer')!;
  assert.ok(changes(last, latecomer.id), 'the punchline must be visible in the staged action');
});

test('the wandering doorway finds a stationary tree without relying on a car or prop morphing', () => {
  const project = makeStoryProject('doorway-looking-for-home');
  for (const shot of project.shots) {
    assert.equal(shot.props.some(prop => prop.kind === 'car'), false);
    const tree = shot.props.find(prop => prop.kind === 'tree')!;
    const door = shot.props.find(prop => prop.kind === 'arch')!;
    assert.equal(changes(shot, tree.id), false);
    assert.equal(changes(shot, door.id), true);
  }
  const final = project.shots[2];
  const door = final.props.find(prop => prop.kind === 'arch')!;
  const tree = final.props.find(prop => prop.kind === 'tree')!;
  const doorPose = final.frames[2].poses[door.id];
  const treePose = final.frames[2].poses[tree.id];
  assert.ok(doorPose.z > treePose.z, 'the doorway must finish in front of the tree');
  assert.ok(Math.abs(doorPose.x - treePose.x) < 1, 'the ending must compose the tree with the doorway');
});

test('the parade makes room first, then every companion travels with the tree', () => {
  const project = makeStoryProject('last-tree-parade');
  for (const shot of project.shots.slice(0, 2)) {
    const tree = shot.props.find(prop => prop.kind === 'tree')!;
    assert.equal(changes(shot, tree.id), false);
  }
  const finale = project.shots[2];
  for (const prop of finale.props) {
    assert.ok(changes(finale, prop.id));
    const start = finale.frames[0].poses[prop.id];
    const end = finale.frames[2].poses[prop.id];
    assert.ok(Math.abs((end.x - start.x) - 1.3) < 1e-9);
    assert.ok(Math.abs((end.z - start.z) + .6) < 1e-9);
  }
});

test('each cut starts where the previous shot left its named cast', () => {
  for (const spark of storySparks) {
    const project = makeStoryProject(spark.id);
    for (let scene = 1; scene < project.shots.length; scene++) {
      const previous = project.shots[scene - 1];
      const next = project.shots[scene];
      for (const prop of next.props) {
        const before = previous.props.find(item => item.name === prop.name)!;
        assert.ok(before, 'the same cast must carry through the story');
        assert.deepEqual(next.frames[0].poses[prop.id], previous.frames[2].poses[before.id], `${spark.title}: ${prop.name} jumps at the cut`);
      }
    }
  }
});

test('unknown story identifiers fail with a useful error', () => {
  assert.throws(() => makeStoryProject('missing' as StorySparkId), /available story sparks/);
});
