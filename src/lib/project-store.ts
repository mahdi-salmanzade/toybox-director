import { parseProject, uid } from './project.ts';
import type { Project, WorldId } from './project.ts';

export type ProjectSummary = { id: string; name: string; updatedAt: number; shotCount: number; world: WorldId };
type StoredProject = { id: string; project: Project; updatedAt: number };
type Metadata = { key: string; value: unknown };
export const PROJECT_DATABASE_NAME = 'toybox-project-library';
const LEGACY_KEY = 'toybox.project.v1';
const ACTIVE_KEY = 'activeProjectId';
const MIGRATION_KEY = 'legacyMigration';

function storageError(error: unknown): Error {
  if (error instanceof Error && error.name === 'QuotaExceededError') return new Error('Your device is out of space for projects. Export a backup, then remove a project or free some storage.', { cause: error });
  const detail = error instanceof Error ? error.message : 'The browser did not provide a reason.';
  return new Error(`The project library could not be accessed. ${detail}`, { cause: error });
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('This browser does not provide IndexedDB storage.')); return; }
    const request = indexedDB.open(PROJECT_DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('metadata', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('The browser refused to open its project storage.'));
    request.onblocked = () => { blocked = true; reject(new Error('Close other Toybox tabs and try again to finish upgrading project storage.')); };
  });
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('A storage operation failed.'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, operation: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const tx = db.transaction(['projects', 'metadata'], mode);
    const finished = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('The browser cancelled the storage operation.'));
      tx.onerror = () => { /* onabort supplies the transaction's final error. */ };
    });
    // Attach a handler immediately: request failures can abort before operation() settles.
    void finished.catch(() => undefined);
    try {
      const value = await operation(tx);
      await finished;
      return value;
    } catch (error) {
      try { tx.abort(); } catch { /* The transaction may already have completed or aborted. */ }
      await finished.catch(() => undefined);
      throw error;
    }
  } catch (error) { throw storageError(error); }
  finally { db?.close(); }
}
function unpack(record: StoredProject): Project {
  const project = parseProject(JSON.stringify(record.project));
  if (project.id !== record.id) throw new Error('A stored project has an inconsistent identifier.');
  return project;
}
export async function listProjects(): Promise<ProjectSummary[]> {
  return transaction('readonly', async tx => {
    const records = await result<StoredProject[]>(tx.objectStore('projects').getAll());
    return records.map(record => {
      const project = unpack(record);
      return { id: project.id, name: project.name, updatedAt: record.updatedAt, shotCount: project.shots.length, world: project.shots.find(shot => shot.id === project.activeShotId)!.world };
    }).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  });
}
export async function saveProject(project: Project): Promise<void> {
  // Snapshot before the first await so later edits cannot change this save in flight.
  const snapshot = parseProject(JSON.stringify(project));
  await transaction('readwrite', async tx => {
    await result(tx.objectStore('projects').put({ id: snapshot.id, project: snapshot, updatedAt: Date.now() } satisfies StoredProject));
  });
}
export async function loadProject(id: string): Promise<Project | null> {
  return transaction('readonly', async tx => {
    const record = await result<StoredProject | undefined>(tx.objectStore('projects').get(id));
    return record ? unpack(record) : null;
  });
}
export async function deleteProject(id: string): Promise<void> {
  await transaction('readwrite', async tx => {
    await result(tx.objectStore('projects').delete(id));
    const metadata = tx.objectStore('metadata');
    const active = await result<Metadata | undefined>(metadata.get(ACTIVE_KEY));
    if (active?.value === id) await result(metadata.delete(ACTIVE_KEY));
  });
}
export async function getActiveProjectId(): Promise<string | null> {
  return transaction('readonly', async tx => {
    const active = await result<Metadata | undefined>(tx.objectStore('metadata').get(ACTIVE_KEY));
    if (typeof active?.value !== 'string') return null;
    const exists = await result(tx.objectStore('projects').count(active.value));
    return exists ? active.value : null;
  });
}
export async function setActiveProjectId(id: string): Promise<void> {
  await transaction('readwrite', async tx => {
    const exists = await result(tx.objectStore('projects').count(id));
    if (!exists) throw new Error('Save this project before making it active.');
    await result(tx.objectStore('metadata').put({ key: ACTIVE_KEY, value: id } satisfies Metadata));
  });
}
/**
 * Move the old single localStorage project into the library atomically. The source
 * remains untouched until commit. A fingerprint makes retries safe if cleanup is
 * blocked; ID collisions preserve both projects rather than replacing either one.
 */
export async function migrateLegacyProject(): Promise<Project | null> {
  let legacy: string | null;
  try { legacy = globalThis.localStorage?.getItem(LEGACY_KEY) ?? null; }
  catch (error) { throw storageError(error); }
  if (!legacy) return null;
  const project = parseProject(legacy);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const migrated = await transaction('readwrite', async tx => {
    const projects = tx.objectStore('projects'); const metadata = tx.objectStore('metadata');
    const marker = await result<Metadata | undefined>(metadata.get(MIGRATION_KEY));
    const value = marker?.value as { fingerprint?: string; projectId?: string } | undefined;
    if (value?.fingerprint === fingerprint && typeof value.projectId === 'string') {
      const previous = await result<StoredProject | undefined>(projects.get(value.projectId));
      if (previous) return unpack(previous);
    }
    const collision = await result<StoredProject | undefined>(projects.get(project.id));
    if (collision && JSON.stringify(unpack(collision)) !== JSON.stringify(project)) project.id = uid();
    if (!collision || project.id !== collision.id) await result(projects.put({ id: project.id, project, updatedAt: Date.now() } satisfies StoredProject));
    await result(metadata.put({ key: MIGRATION_KEY, value: { fingerprint, projectId: project.id } } satisfies Metadata));
    const active = await result<Metadata | undefined>(metadata.get(ACTIVE_KEY));
    if (!active) await result(metadata.put({ key: ACTIVE_KEY, value: project.id } satisfies Metadata));
    return project;
  });
  try {
    // A different tab may have updated the old app while this migration was running.
    if (globalThis.localStorage?.getItem(LEGACY_KEY) === legacy) globalThis.localStorage.removeItem(LEGACY_KEY);
  } catch { /* Data is committed; the migration marker prevents duplicate retries. */ }
  return migrated;
}
