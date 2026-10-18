import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { makeProject, makeShot } from '../src/lib/project.ts';
import { deleteProject, getActiveProjectId, listProjects, loadProject, migrateLegacyProject, saveProject, setActiveProjectId } from '../src/lib/project-store.ts';

const legacyKey = 'toybox.project.v1';
let local: Map<string, string>;
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  local = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  } });
});

test('library persists separate projects, summaries, imported images and film edits', async () => {
  const first = makeProject(); const second = makeProject();
  second.name = 'Moon film'; second.shots = [makeShot('Delivery', 'lunar')]; second.activeShotId = second.shots[0].id;
  second.shots[0].frames[0].image = 'data:image/jpeg;base64,AQID';
  second.edit = { clips: [{ id: 'cut-1', jobId: 'render-1', outputIndex: 0, inPoint: .2, outPoint: 2 }] };
  await saveProject(first); await saveProject(second);
  const summaries = await listProjects();
  assert.equal(summaries.length, 2);
  const summary = summaries.find(item => item.id === second.id)!;
  assert.equal(summary.name, 'Moon film'); assert.equal(summary.world, 'lunar'); assert.equal(summary.shotCount, 1);
  assert.ok(summary.updatedAt > 0);
  assert.deepEqual(await loadProject(second.id), second);
  const loaded = await loadProject(first.id); loaded!.name = 'Unsaved change';
  assert.equal((await loadProject(first.id))!.name, first.name);
  assert.equal(await loadProject('missing'), null);
});

test('saving snapshots synchronously and updates only the matching project', async () => {
  const first = makeProject(); const second = makeProject();
  await saveProject(second);
  const saving = saveProject(first);
  const originalName = first.name; first.name = 'Changed after save started';
  await saving;
  assert.equal((await loadProject(first.id))!.name, originalName);
  await saveProject(first);
  assert.equal((await loadProject(first.id))!.name, first.name);
  assert.deepEqual(await loadProject(second.id), second);
  assert.equal((await listProjects()).length, 2);
});

test('active selection survives saves and is cleared atomically when deleted', async () => {
  const first = makeProject(); const second = makeProject();
  assert.equal(await getActiveProjectId(), null);
  await assert.rejects(setActiveProjectId(first.id), /Save this project/);
  await saveProject(first); await saveProject(second); await setActiveProjectId(first.id);
  await saveProject(second);
  assert.equal(await getActiveProjectId(), first.id);
  await deleteProject(second.id);
  assert.equal(await getActiveProjectId(), first.id);
  await deleteProject(first.id);
  assert.equal(await getActiveProjectId(), null);
  assert.deepEqual(await listProjects(), []);
});

test('legacy migration adds an ID, commits the project and selection before removing the source', async () => {
  const legacy = JSON.parse(JSON.stringify(makeProject())); delete legacy.id;
  local.set(legacyKey, JSON.stringify(legacy));
  const migrated = await migrateLegacyProject();
  assert.ok(migrated?.id);
  assert.deepEqual(await loadProject(migrated.id), migrated);
  assert.equal(await getActiveProjectId(), migrated.id);
  assert.equal(local.has(legacyKey), false);
  assert.equal(await migrateLegacyProject(), null);
});

test('legacy migration preserves existing projects and active selection when IDs collide', async () => {
  const existing = makeProject(); await saveProject(existing); await setActiveProjectId(existing.id);
  const legacy = structuredClone(existing); legacy.name = 'A different old project';
  local.set(legacyKey, JSON.stringify(legacy));
  const migrated = await migrateLegacyProject();
  assert.notEqual(migrated!.id, existing.id);
  assert.deepEqual(await loadProject(existing.id), existing);
  assert.equal((await loadProject(migrated!.id))!.name, legacy.name);
  assert.equal(await getActiveProjectId(), existing.id);
  assert.equal((await listProjects()).length, 2);
});

test('migration retries do not duplicate a project when localStorage cleanup is blocked', async () => {
  const legacy = JSON.parse(JSON.stringify(makeProject())); delete legacy.id;
  local.set(legacyKey, JSON.stringify(legacy));
  globalThis.localStorage.removeItem = () => { throw new Error('Blocked by browser'); };
  const first = await migrateLegacyProject(); const retry = await migrateLegacyProject();
  assert.equal(first!.id, retry!.id);
  assert.equal((await listProjects()).length, 1);
  assert.equal(local.has(legacyKey), true);
});

test('quota failures retain the legacy source and report the problem without partial saves', async () => {
  const project = makeProject(); const raw = JSON.stringify(project); local.set(legacyKey, raw);
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function () { throw new DOMException('Disk full', 'QuotaExceededError'); };
  try {
    await assert.rejects(migrateLegacyProject(), /out of space/);
    assert.equal(local.get(legacyKey), raw);
  } finally { IDBObjectStore.prototype.put = put; }
  assert.deepEqual(await listProjects(), []);
  assert.equal(await getActiveProjectId(), null);
  assert.ok(await migrateLegacyProject());
});

test('invalid legacy data stays intact and never overwrites valid library data', async () => {
  const project = makeProject(); await saveProject(project);
  local.set(legacyKey, '{bad json');
  await assert.rejects(migrateLegacyProject(), /not valid JSON/);
  assert.equal(local.get(legacyKey), '{bad json');
  assert.deepEqual(await loadProject(project.id), project);
});

test('unavailable browser storage reports a useful error', async () => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
  await assert.rejects(listProjects(), /does not provide IndexedDB/);
});
